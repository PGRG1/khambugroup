-- Create storage bucket for receipt uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false);

-- Only authenticated users can upload receipts
CREATE POLICY "Authenticated users can upload receipts"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'receipts' AND auth.uid() IS NOT NULL);

-- Only authenticated users can view their receipts
CREATE POLICY "Authenticated users can view receipts"
ON storage.objects FOR SELECT
USING (bucket_id = 'receipts' AND auth.uid() IS NOT NULL);

-- Only authenticated users can delete their receipts
CREATE POLICY "Authenticated users can delete receipts"
ON storage.objects FOR DELETE
USING (bucket_id = 'receipts' AND auth.uid() IS NOT NULL);