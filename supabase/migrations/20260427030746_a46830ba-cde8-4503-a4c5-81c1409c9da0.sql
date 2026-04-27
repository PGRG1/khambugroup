-- Add receipt file columns to sales_records
ALTER TABLE public.sales_records
  ADD COLUMN IF NOT EXISTS receipt_file_url text,
  ADD COLUMN IF NOT EXISTS receipt_file_name text;

-- Create private bucket for scanned sales receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('sales-receipts', 'sales-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated can read sales receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'sales-receipts');

CREATE POLICY "Authorized can upload sales receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'sales-receipts'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
);

CREATE POLICY "Authorized can update sales receipts"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'sales-receipts'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
);

CREATE POLICY "Authorized can delete sales receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'sales-receipts'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
);