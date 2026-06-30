
CREATE POLICY "auth read bank attachments" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'bank-attachments');
CREATE POLICY "auth write bank attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'bank-attachments');
CREATE POLICY "auth update bank attachments" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'bank-attachments');
CREATE POLICY "auth delete bank attachments" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'bank-attachments');
