ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS vendor_code text;
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_vendor_code_key ON public.suppliers (vendor_code) WHERE vendor_code IS NOT NULL;