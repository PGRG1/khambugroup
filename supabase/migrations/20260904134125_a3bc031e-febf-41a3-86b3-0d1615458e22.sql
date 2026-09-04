CREATE TABLE IF NOT EXISTS public.payment_receipts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  bucket text NOT NULL DEFAULT 'payment-receipts',
  path text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes bigint NOT NULL DEFAULT 0,
  checksum text,
  sort_order integer NOT NULL DEFAULT 0,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_receipts_bucket_path_key ON public.payment_receipts (bucket, path);
CREATE INDEX IF NOT EXISTS payment_receipts_payment_idx ON public.payment_receipts (payment_id, sort_order);
CREATE INDEX IF NOT EXISTS payment_receipts_tenant_idx ON public.payment_receipts (tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_receipts TO authenticated;
GRANT ALL ON public.payment_receipts TO service_role;

ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant members read payment receipts" ON public.payment_receipts;
CREATE POLICY "Tenant members read payment receipts" ON public.payment_receipts
  FOR SELECT TO authenticated
  USING (public.user_has_tenant(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "Tenant members write payment receipts" ON public.payment_receipts;
CREATE POLICY "Tenant members write payment receipts" ON public.payment_receipts
  FOR ALL TO authenticated
  USING (public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.user_has_tenant(auth.uid(), tenant_id));

DROP TRIGGER IF EXISTS payment_receipts_touch_updated_at ON public.payment_receipts;
CREATE TRIGGER payment_receipts_touch_updated_at
  BEFORE UPDATE ON public.payment_receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies: private bucket, tenant-prefixed object paths only.
DROP POLICY IF EXISTS "Tenant read payment receipt objects" ON storage.objects;
CREATE POLICY "Tenant read payment receipt objects" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-receipts'
    AND EXISTS (SELECT 1 FROM public.user_tenant_ids(auth.uid()) t WHERE (storage.foldername(name))[1] = t::text)
  );

DROP POLICY IF EXISTS "Tenant upload payment receipt objects" ON storage.objects;
CREATE POLICY "Tenant upload payment receipt objects" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-receipts'
    AND EXISTS (SELECT 1 FROM public.user_tenant_ids(auth.uid()) t WHERE (storage.foldername(name))[1] = t::text)
  );

DROP POLICY IF EXISTS "Tenant delete payment receipt objects" ON storage.objects;
CREATE POLICY "Tenant delete payment receipt objects" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'payment-receipts'
    AND EXISTS (SELECT 1 FROM public.user_tenant_ids(auth.uid()) t WHERE (storage.foldername(name))[1] = t::text)
  );

-- Atomic payment + allocations + receipt metadata.
CREATE OR REPLACE FUNCTION public.record_payment_with_receipts(
  p_tenant_id uuid,
  p_payment jsonb,
  p_allocations jsonb,
  p_receipts jsonb DEFAULT '[]'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_payment_id uuid;
  r jsonb;
  v_i integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_tenant_id IS NULL OR NOT public.user_has_tenant(v_uid, p_tenant_id) THEN
    RAISE EXCEPTION 'Not a member of this tenant';
  END IF;

  v_payment_id := public.record_payment_with_allocations(p_payment, p_allocations);

  UPDATE public.payments SET tenant_id = p_tenant_id WHERE id = v_payment_id;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_receipts, '[]'::jsonb))
  LOOP
    IF COALESCE(r->>'path','') = '' THEN
      RAISE EXCEPTION 'Receipt path is required';
    END IF;
    IF split_part(r->>'path', '/', 1) <> p_tenant_id::text THEN
      RAISE EXCEPTION 'Receipt path % is not scoped to this tenant', r->>'path';
    END IF;

    INSERT INTO public.payment_receipts (
      tenant_id, payment_id, bucket, path, original_name, mime_type, size_bytes, checksum, sort_order, uploaded_by
    ) VALUES (
      p_tenant_id,
      v_payment_id,
      COALESCE(NULLIF(r->>'bucket',''), 'payment-receipts'),
      r->>'path',
      COALESCE(NULLIF(r->>'original_name',''), 'receipt'),
      COALESCE(NULLIF(r->>'mime_type',''), 'application/octet-stream'),
      COALESCE((r->>'size_bytes')::bigint, 0),
      NULLIF(r->>'checksum',''),
      COALESCE((r->>'sort_order')::int, v_i),
      v_uid
    );
    v_i := v_i + 1;
  END LOOP;

  RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_payment_with_receipts(uuid, jsonb, jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.record_payment_with_receipts(uuid, jsonb, jsonb, jsonb) TO authenticated;
