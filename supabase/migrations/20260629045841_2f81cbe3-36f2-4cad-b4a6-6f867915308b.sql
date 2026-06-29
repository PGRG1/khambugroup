ALTER TABLE public.suppliers ADD COLUMN vendor_id TEXT;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;