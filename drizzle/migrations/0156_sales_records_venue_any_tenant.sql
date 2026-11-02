ALTER TABLE public.sales_records DROP CONSTRAINT IF EXISTS sales_records_venue_check;
ALTER TABLE public.sales_records ADD CONSTRAINT sales_records_venue_check CHECK (btrim(venue) <> '');