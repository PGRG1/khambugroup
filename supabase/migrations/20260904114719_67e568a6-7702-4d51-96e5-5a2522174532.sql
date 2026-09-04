ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS source_origin text;

CREATE OR REPLACE FUNCTION public.enforce_scanner_invoice_attachment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.source_origin = 'scanner'
     AND (NEW.file_url IS NULL OR btrim(NEW.file_url) = '' OR NEW.file_url ~* '^(blob:|data:)') THEN
    RAISE EXCEPTION 'Scanned invoices must have a durable source attachment (invoice %).', COALESCE(NEW.invoice_number, '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_scanner_invoice_attachment ON public.invoices;
CREATE TRIGGER trg_enforce_scanner_invoice_attachment
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.enforce_scanner_invoice_attachment();

CREATE OR REPLACE VIEW public.v_invoices_missing_attachment
WITH (security_invoker = true)
AS
SELECT i.id, i.tenant_id, i.invoice_number, i.invoice_date, i.supplier_id,
       i.status, i.source_origin, i.created_at, i.entered_by
FROM public.invoices i
WHERE i.file_url IS NULL OR btrim(i.file_url) = '';

GRANT SELECT ON public.v_invoices_missing_attachment TO authenticated;
GRANT SELECT ON public.v_invoices_missing_attachment TO service_role;