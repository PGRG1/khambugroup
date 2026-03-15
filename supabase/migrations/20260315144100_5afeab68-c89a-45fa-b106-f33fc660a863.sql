CREATE POLICY "Authorized can delete invoice files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'invoice-files' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

CREATE POLICY "Authorized can update invoice files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'invoice-files' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')))
WITH CHECK (bucket_id = 'invoice-files' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));