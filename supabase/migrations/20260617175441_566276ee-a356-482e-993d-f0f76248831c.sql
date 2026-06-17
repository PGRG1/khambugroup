
CREATE POLICY "Authenticated read bill-attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'bill-attachments');

CREATE POLICY "Authenticated upload bill-attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bill-attachments');

CREATE POLICY "Authenticated update bill-attachments" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'bill-attachments');

CREATE POLICY "Authenticated delete bill-attachments" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'bill-attachments');
