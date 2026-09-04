-- 1. Durable attachment metadata ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  bucket text NOT NULL DEFAULT 'invoice-files',
  path text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes bigint NOT NULL DEFAULT 0,
  checksum text,
  sort_order integer NOT NULL DEFAULT 0,
  attached_by uuid,
  attached_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_attachments ADD COLUMN IF NOT EXISTS attached_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoice_attachments_invoice_fk'
      AND conrelid = 'public.invoice_attachments'::regclass
  ) THEN
    ALTER TABLE public.invoice_attachments
      ADD CONSTRAINT invoice_attachments_invoice_fk
      FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS invoice_attachments_unique_path
  ON public.invoice_attachments (invoice_id, path);
CREATE UNIQUE INDEX IF NOT EXISTS invoice_attachments_tenant_unique_path
  ON public.invoice_attachments (tenant_id, invoice_id, path);
CREATE INDEX IF NOT EXISTS invoice_attachments_invoice_idx
  ON public.invoice_attachments (tenant_id, invoice_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_attachments TO authenticated;
GRANT ALL ON public.invoice_attachments TO service_role;

ALTER TABLE public.invoice_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members manage invoice attachments" ON public.invoice_attachments;
CREATE POLICY "Tenant members manage invoice attachments"
  ON public.invoice_attachments FOR ALL TO authenticated
  USING (public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.user_has_tenant(auth.uid(), tenant_id));

DROP TRIGGER IF EXISTS trg_invoice_attachments_touch ON public.invoice_attachments;
CREATE TRIGGER trg_invoice_attachments_touch
BEFORE UPDATE ON public.invoice_attachments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Atomic linkage RPC ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.link_invoice_attachments(
  p_tenant_id uuid,
  p_invoice_id uuid,
  p_attachments jsonb,
  p_reason text DEFAULT 'scanner'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invoice public.invoices%ROWTYPE;
  v_file_url text;
  v_file_name text;
  v_count integer;
  a jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('scanner', 'repair') THEN
    RAISE EXCEPTION 'Invalid attachment reason: %', COALESCE(p_reason, '(null)');
  END IF;
  IF p_tenant_id IS NULL OR NOT public.user_has_tenant(v_uid, p_tenant_id) THEN
    RAISE EXCEPTION 'Not authorised for this tenant.';
  END IF;
  IF p_attachments IS NULL
     OR jsonb_typeof(p_attachments) <> 'array'
     OR jsonb_array_length(p_attachments) = 0 THEN
    RAISE EXCEPTION 'At least one attachment is required.';
  END IF;

  FOR a IN SELECT jsonb_array_elements(p_attachments) LOOP
    IF COALESCE(btrim(a->>'path'), '') = '' THEN
      RAISE EXCEPTION 'Attachment path is required.';
    END IF;
    IF a->>'path' NOT LIKE (p_tenant_id::text || '/%') THEN
      RAISE EXCEPTION 'Attachment path % is outside this tenant folder.', a->>'path';
    END IF;
    IF COALESCE(btrim(a->>'original_name'), '') = '' THEN
      RAISE EXCEPTION 'Attachment original_name is required.';
    END IF;
    IF (a->>'sort_order') IS NULL THEN
      RAISE EXCEPTION 'Attachment sort_order is required.';
    END IF;
  END LOOP;

  SELECT * INTO v_invoice FROM public.invoices
   WHERE id = p_invoice_id AND tenant_id = p_tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found for this tenant.';
  END IF;

  INSERT INTO public.invoice_attachments
    (tenant_id, invoice_id, bucket, path, original_name, mime_type, size_bytes, checksum, sort_order, attached_by, attached_at)
  SELECT p_tenant_id,
         p_invoice_id,
         COALESCE(x->>'bucket', 'invoice-files'),
         x->>'path',
         COALESCE(x->>'original_name', x->>'path'),
         COALESCE(x->>'mime_type', 'application/octet-stream'),
         COALESCE((x->>'size_bytes')::bigint, 0),
         x->>'checksum',
         COALESCE((x->>'sort_order')::int, 0),
         v_uid,
         now()
  FROM jsonb_array_elements(p_attachments) x
  ORDER BY COALESCE((x->>'sort_order')::int, 0)
  ON CONFLICT (invoice_id, path) DO UPDATE
    SET original_name = EXCLUDED.original_name,
        mime_type     = EXCLUDED.mime_type,
        size_bytes    = EXCLUDED.size_bytes,
        checksum      = EXCLUDED.checksum,
        sort_order    = EXCLUDED.sort_order,
        updated_at    = now();

  SELECT string_agg(path, ',' ORDER BY sort_order),
         string_agg(original_name, ', ' ORDER BY sort_order),
         count(*)
    INTO v_file_url, v_file_name, v_count
    FROM public.invoice_attachments
   WHERE invoice_id = p_invoice_id AND tenant_id = p_tenant_id;

  UPDATE public.invoices
     SET file_url = v_file_url,
         file_name = v_file_name
   WHERE id = p_invoice_id AND tenant_id = p_tenant_id;

  INSERT INTO public.audit_log (tenant_id, user_id, user_display_name, action, entity_type, entity_id, details)
  SELECT p_tenant_id,
         v_uid,
         COALESCE((SELECT display_name FROM public.profiles WHERE user_id = v_uid), 'Unknown'),
         CASE WHEN p_reason = 'repair' THEN 'attachment_repair' ELSE 'attachment_link' END,
         'invoice',
         p_invoice_id::text,
         jsonb_build_object('reason', p_reason, 'invoice_number', v_invoice.invoice_number, 'attachments', p_attachments);

  RETURN jsonb_build_object('invoice_id', p_invoice_id, 'attachment_count', v_count, 'file_url', v_file_url);
END;
$$;

REVOKE ALL ON FUNCTION public.link_invoice_attachments(uuid, uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_invoice_attachments(uuid, uuid, jsonb, text) TO authenticated;

-- 3. Atomic scanner invoice creation -------------------------------------------
CREATE OR REPLACE FUNCTION public.create_scanner_invoice_with_attachments(
  p_tenant_id uuid,
  p_invoice jsonb,
  p_line_items jsonb,
  p_attachments jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invoice public.invoices%ROWTYPE;
  v_id uuid := gen_random_uuid();
  v_file_url text;
  v_file_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF p_tenant_id IS NULL OR NOT public.user_has_tenant(v_uid, p_tenant_id) THEN
    RAISE EXCEPTION 'Not authorised for this tenant.';
  END IF;
  IF p_attachments IS NULL
     OR jsonb_typeof(p_attachments) <> 'array'
     OR jsonb_array_length(p_attachments) = 0 THEN
    RAISE EXCEPTION 'A scanned invoice requires at least one durable source attachment.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_attachments) x
     WHERE COALESCE(btrim(x->>'path'), '') = ''
        OR x->>'path' NOT LIKE (p_tenant_id::text || '/%')
  ) THEN
    RAISE EXCEPTION 'Attachment path is outside this tenant folder.';
  END IF;

  SELECT string_agg(x->>'path', ',' ORDER BY COALESCE((x->>'sort_order')::int, 0)),
         string_agg(COALESCE(x->>'original_name', x->>'path'), ', ' ORDER BY COALESCE((x->>'sort_order')::int, 0))
    INTO v_file_url, v_file_name
    FROM jsonb_array_elements(p_attachments) x;

  v_invoice := jsonb_populate_record(NULL::public.invoices, p_invoice);
  v_invoice.id := v_id;
  v_invoice.tenant_id := p_tenant_id;
  v_invoice.source_origin := 'scanner';
  v_invoice.file_url := v_file_url;
  v_invoice.file_name := v_file_name;
  v_invoice.created_at := COALESCE(v_invoice.created_at, now());

  INSERT INTO public.invoices SELECT v_invoice.*;

  IF p_line_items IS NOT NULL AND jsonb_typeof(p_line_items) = 'array'
     AND jsonb_array_length(p_line_items) > 0 THEN
    INSERT INTO public.invoice_line_items
    SELECT (r).*
    FROM (
      SELECT jsonb_populate_record(
               NULL::public.invoice_line_items,
               x || jsonb_build_object('invoice_id', v_id, 'tenant_id', p_tenant_id)
             ) AS r
      FROM jsonb_array_elements(p_line_items) x
    ) s;
  END IF;

  INSERT INTO public.invoice_attachments
    (tenant_id, invoice_id, bucket, path, original_name, mime_type, size_bytes, checksum, sort_order, attached_by, attached_at)
  SELECT p_tenant_id, v_id,
         COALESCE(x->>'bucket', 'invoice-files'),
         x->>'path',
         COALESCE(x->>'original_name', x->>'path'),
         COALESCE(x->>'mime_type', 'application/octet-stream'),
         COALESCE((x->>'size_bytes')::bigint, 0),
         x->>'checksum',
         COALESCE((x->>'sort_order')::int, 0),
         v_uid, now()
  FROM jsonb_array_elements(p_attachments) x
  ORDER BY COALESCE((x->>'sort_order')::int, 0);

  INSERT INTO public.audit_log (tenant_id, user_id, user_display_name, action, entity_type, entity_id, details)
  SELECT p_tenant_id, v_uid,
         COALESCE((SELECT display_name FROM public.profiles WHERE user_id = v_uid), 'Unknown'),
         'attachment_link', 'invoice', v_id::text,
         jsonb_build_object('reason', 'scanner', 'invoice_number', v_invoice.invoice_number, 'attachments', p_attachments);

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_scanner_invoice_with_attachments(uuid, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_scanner_invoice_with_attachments(uuid, jsonb, jsonb, jsonb) TO authenticated;

-- 4. Enforcement ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_scanner_invoice_attachment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.source_origin = 'scanner'
     AND (NEW.file_url IS NULL OR btrim(NEW.file_url) = '' OR NEW.file_url ~* '^(blob:|data:)') THEN
    RAISE EXCEPTION 'Scanned invoices must have a durable source attachment (invoice %).', COALESCE(NEW.invoice_number, '');
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.source_origin = 'scanner'
     AND NOT EXISTS (
       SELECT 1 FROM public.invoice_attachments ia
        WHERE ia.invoice_id = NEW.id AND ia.tenant_id = NEW.tenant_id
     ) THEN
    RAISE EXCEPTION 'Scanned invoice % has no linked source document record.', COALESCE(NEW.invoice_number, '');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_scanner_invoice_attachment ON public.invoices;
CREATE TRIGGER trg_enforce_scanner_invoice_attachment
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.enforce_scanner_invoice_attachment();

-- 5. Audit view -----------------------------------------------------------------
DROP VIEW IF EXISTS public.v_invoices_missing_attachment;
CREATE VIEW public.v_invoices_missing_attachment
WITH (security_invoker = true)
AS
SELECT i.id, i.tenant_id, i.invoice_number, i.invoice_date, i.supplier_id,
       i.status, i.source_origin, i.created_at, i.entered_by,
       (i.file_url IS NULL OR btrim(i.file_url) = '') AS missing_file_url,
       NOT EXISTS (
         SELECT 1 FROM public.invoice_attachments ia
          WHERE ia.invoice_id = i.id AND ia.tenant_id = i.tenant_id
       ) AS missing_metadata
FROM public.invoices i
WHERE i.file_url IS NULL
   OR btrim(i.file_url) = ''
   OR (i.source_origin = 'scanner' AND NOT EXISTS (
        SELECT 1 FROM public.invoice_attachments ia
         WHERE ia.invoice_id = i.id AND ia.tenant_id = i.tenant_id));

GRANT SELECT ON public.v_invoices_missing_attachment TO authenticated;
GRANT SELECT ON public.v_invoices_missing_attachment TO service_role;

-- 6. Tenant-scoped storage access for invoice files ------------------------------
CREATE OR REPLACE FUNCTION public.invoice_storage_path_allowed(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first text := split_part(COALESCE(p_name, ''), '/', 1);
  v_tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  BEGIN
    v_tenant := v_first::uuid;
  EXCEPTION WHEN others THEN
    -- legacy (non tenant-prefixed) objects stay readable to signed-in users
    RETURN true;
  END;
  RETURN public.user_has_tenant(auth.uid(), v_tenant);
END;
$$;

REVOKE ALL ON FUNCTION public.invoice_storage_path_allowed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoice_storage_path_allowed(text) TO authenticated;

DROP POLICY IF EXISTS "Authenticated can read invoice files" ON storage.objects;
CREATE POLICY "Authenticated can read invoice files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'invoice-files' AND public.invoice_storage_path_allowed(name));

DROP POLICY IF EXISTS "Authorized can upload invoice files" ON storage.objects;
CREATE POLICY "Authorized can upload invoice files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoice-files' AND public.invoice_storage_path_allowed(name));

DROP POLICY IF EXISTS "Authorized can update invoice files" ON storage.objects;
CREATE POLICY "Authorized can update invoice files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'invoice-files' AND public.invoice_storage_path_allowed(name))
  WITH CHECK (bucket_id = 'invoice-files' AND public.invoice_storage_path_allowed(name));

DROP POLICY IF EXISTS "Authorized can delete invoice files" ON storage.objects;
CREATE POLICY "Authorized can delete invoice files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'invoice-files' AND public.invoice_storage_path_allowed(name));

DROP POLICY IF EXISTS "Admins can delete invoice files" ON storage.objects;