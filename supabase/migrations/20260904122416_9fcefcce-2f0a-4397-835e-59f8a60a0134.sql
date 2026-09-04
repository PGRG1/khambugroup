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
  -- server-controlled timestamps: never trust client-supplied values
  v_invoice.created_at := now();
  v_invoice.updated_at := now();

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