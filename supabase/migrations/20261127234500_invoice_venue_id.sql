-- Scanned and chat-booked invoices were saved with the venue's name only (venue_id empty), so pages that scope by
-- venue_id (Home's Purchases tile) left them out. From now on an invoice saved with a venue name gets that venue's id.
-- Existing rows are not rewritten (no journal rebuilds); readers fall back to the name.
CREATE OR REPLACE FUNCTION public.invoice_fill_venue_id() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.venue_id IS NULL AND coalesce(btrim(NEW.venue), '') <> '' THEN
    SELECT id INTO NEW.venue_id FROM public.venues WHERE tenant_id = NEW.tenant_id AND name = NEW.venue LIMIT 1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_invoice_fill_venue_id ON public.invoices;
CREATE TRIGGER trg_invoice_fill_venue_id BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.invoice_fill_venue_id();
