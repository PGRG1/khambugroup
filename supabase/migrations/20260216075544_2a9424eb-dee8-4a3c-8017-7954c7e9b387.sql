
-- Add file storage columns to invoices table
ALTER TABLE public.invoices ADD COLUMN file_url text NULL;
ALTER TABLE public.invoices ADD COLUMN file_name text NULL;

-- Create storage bucket for invoice files
INSERT INTO storage.buckets (id, name, public) VALUES ('invoice-files', 'invoice-files', false);

-- RLS: Authenticated users can read invoice files
CREATE POLICY "Authenticated can read invoice files"
ON storage.objects FOR SELECT
USING (bucket_id = 'invoice-files' AND auth.role() = 'authenticated');

-- RLS: Admins/managers can upload invoice files
CREATE POLICY "Authorized can upload invoice files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'invoice-files' AND (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')
));

-- RLS: Admins can delete invoice files
CREATE POLICY "Admins can delete invoice files"
ON storage.objects FOR DELETE
USING (bucket_id = 'invoice-files' AND public.has_role(auth.uid(), 'admin'));
