ALTER TABLE public.expense_bills ADD COLUMN IF NOT EXISTS original_total numeric;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS original_total numeric;
COMMENT ON COLUMN public.expense_bills.original_total IS 'Total in the document currency when foreign; total_amount stays in base = original_total x fx_rate.';
COMMENT ON COLUMN public.invoices.original_total IS 'Total in the document currency when foreign; total_amount stays in base = original_total x fx_rate.';

CREATE OR REPLACE FUNCTION public.fx_document_defaults() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b text; r record; d date;
BEGIN
 SELECT coalesce(base_currency,'HKD') INTO b FROM tenants WHERE id=NEW.tenant_id;
 IF NEW.currency IS NULL OR NEW.currency='' THEN NEW.currency:=b; END IF;
 NEW.currency:=upper(NEW.currency);
 IF NEW.currency<>b AND NEW.fx_rate IS NULL THEN
  d:=CASE TG_TABLE_NAME WHEN 'expense_bills' THEN (to_jsonb(NEW)->>'bill_date')::date WHEN 'invoices' THEN (to_jsonb(NEW)->>'invoice_date')::date WHEN 'customer_opening_balances' THEN coalesce((to_jsonb(NEW)->>'invoice_date')::date,current_date) ELSE coalesce((to_jsonb(NEW)->>'period_end')::date,current_date) END;
  SELECT * INTO r FROM fx_rate(NEW.tenant_id,d,NEW.currency);
  IF r.rate IS NOT NULL THEN NEW.fx_rate:=r.rate; END IF;
 END IF;
 RETURN NEW; END $$;

ALTER TABLE public.expense_bills ALTER COLUMN currency DROP DEFAULT;
ALTER TABLE public.payment_settlement_imports ALTER COLUMN currency DROP DEFAULT;
ALTER TABLE public.customer_opening_balances ALTER COLUMN currency DROP DEFAULT;
CREATE TRIGGER fx_defaults_expense_bills BEFORE INSERT OR UPDATE OF currency ON public.expense_bills FOR EACH ROW EXECUTE FUNCTION public.fx_document_defaults();
CREATE TRIGGER fx_defaults_invoices BEFORE INSERT OR UPDATE OF currency ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.fx_document_defaults();
CREATE TRIGGER fx_defaults_settlement_imports BEFORE INSERT OR UPDATE OF currency ON public.payment_settlement_imports FOR EACH ROW EXECUTE FUNCTION public.fx_document_defaults();
CREATE TRIGGER fx_defaults_customer_opening BEFORE INSERT OR UPDATE OF currency ON public.customer_opening_balances FOR EACH ROW EXECUTE FUNCTION public.fx_document_defaults();

-- New journal lines from a foreign document keep currency, original amount and rate. Existing lines are never touched.
CREATE OR REPLACE FUNCTION public.journal_line_fx_from_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e record; c text; r numeric; b text;
BEGIN
 IF NEW.currency IS NOT NULL THEN RETURN NEW; END IF;
 SELECT source_type,source_id,tenant_id INTO e FROM journal_entries WHERE id=NEW.entry_id;
 IF e.source_id IS NULL THEN RETURN NEW; END IF;
 IF e.source_type='expense_bill' THEN SELECT currency,fx_rate INTO c,r FROM expense_bills WHERE id=e.source_id;
 ELSIF e.source_type='invoice' THEN SELECT currency,fx_rate INTO c,r FROM invoices WHERE id=e.source_id;
 ELSE RETURN NEW; END IF;
 SELECT coalesce(base_currency,'HKD') INTO b FROM tenants WHERE id=e.tenant_id;
 IF c IS NULL OR c=b OR coalesce(r,0)<=0 THEN RETURN NEW; END IF;
 NEW.currency:=c; NEW.fx_rate:=r; NEW.original_amount:=round((coalesce(NEW.debit,0)-coalesce(NEW.credit,0))/r,6);
 RETURN NEW; END $$;
CREATE TRIGGER journal_lines_fx_from_source BEFORE INSERT ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION public.journal_line_fx_from_source();