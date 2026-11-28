-- Optional delivery photos on a supplier invoice: proof of what arrived. Kept apart from
-- invoice_attachments so the invoice's own pages (file_url) never mix with them.
CREATE TABLE IF NOT EXISTS public.invoice_delivery_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  bucket text NOT NULL DEFAULT 'invoice-files',
  path text NOT NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'image/jpeg',
  size_bytes bigint NOT NULL DEFAULT 0,
  taken_by uuid DEFAULT auth.uid(),
  taken_by_name text,
  taken_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_delivery_photos_path_in_tenant CHECK (path LIKE tenant_id::text || '/%'),
  UNIQUE (invoice_id, path)
);
CREATE INDEX IF NOT EXISTS invoice_delivery_photos_invoice ON public.invoice_delivery_photos (tenant_id, invoice_id, taken_at);

ALTER TABLE public.invoice_delivery_photos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, DELETE ON public.invoice_delivery_photos TO authenticated;
GRANT ALL ON public.invoice_delivery_photos TO service_role;

DROP POLICY IF EXISTS "Tenant members read delivery photos" ON public.invoice_delivery_photos;
CREATE POLICY "Tenant members read delivery photos" ON public.invoice_delivery_photos
  FOR SELECT TO authenticated USING (public.user_has_tenant(auth.uid(), tenant_id) OR public.is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS "Tenant members add delivery photos" ON public.invoice_delivery_photos;
CREATE POLICY "Tenant members add delivery photos" ON public.invoice_delivery_photos
  FOR INSERT TO authenticated WITH CHECK (
    public.user_has_tenant(auth.uid(), tenant_id)
    AND EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.tenant_id = invoice_delivery_photos.tenant_id));
DROP POLICY IF EXISTS "Tenant members remove delivery photos" ON public.invoice_delivery_photos;
CREATE POLICY "Tenant members remove delivery photos" ON public.invoice_delivery_photos
  FOR DELETE TO authenticated USING (public.user_has_tenant(auth.uid(), tenant_id));
