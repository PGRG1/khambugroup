CREATE OR REPLACE FUNCTION public.sync_sales_records_venue_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.venue IS NOT NULL AND NEW.venue_id IS NULL THEN
      SELECT id INTO NEW.venue_id FROM public.venues WHERE name = NEW.venue LIMIT 1;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.venue IS NOT NULL
       AND (NEW.venue_id IS NULL OR NEW.venue IS DISTINCT FROM OLD.venue) THEN
      SELECT id INTO NEW.venue_id FROM public.venues WHERE name = NEW.venue LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sales_records_venue_id ON public.sales_records;
CREATE TRIGGER trg_sync_sales_records_venue_id
  BEFORE INSERT OR UPDATE ON public.sales_records
  FOR EACH ROW EXECUTE FUNCTION public.sync_sales_records_venue_id();

UPDATE public.sales_records sr
SET venue_id = v.id
FROM public.venues v
WHERE v.name = sr.venue AND sr.venue_id IS NULL;