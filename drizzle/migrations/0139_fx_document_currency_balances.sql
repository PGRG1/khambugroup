ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS default_currency text;
COMMENT ON COLUMN public.suppliers.default_currency IS 'ISO currency the supplier bills in; null = tenant base currency.';
ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS original_unit_price numeric, ADD COLUMN IF NOT EXISTS original_total numeric;
ALTER TABLE public.expense_bill_allocations ADD COLUMN IF NOT EXISTS original_amount numeric;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS original_balance numeric;
ALTER TABLE public.expense_bills ADD COLUMN IF NOT EXISTS original_balance numeric;
COMMENT ON COLUMN public.invoices.original_balance IS 'Remaining owed in the document currency; null when base.';
COMMENT ON COLUMN public.expense_bills.original_balance IS 'Remaining owed in the document currency; null when base.';
ALTER TABLE public.credit_notes ADD COLUMN IF NOT EXISTS currency text, ADD COLUMN IF NOT EXISTS fx_rate numeric, ADD COLUMN IF NOT EXISTS original_currency_amount numeric, ADD COLUMN IF NOT EXISTS original_remaining numeric;
COMMENT ON COLUMN public.credit_notes.original_currency_amount IS 'Credit in the document currency (original_amount stays base); null when base.';
ALTER TABLE public.supplier_opening_balances ADD COLUMN IF NOT EXISTS currency text, ADD COLUMN IF NOT EXISTS original_amount numeric, ADD COLUMN IF NOT EXISTS fx_rate numeric;
ALTER TABLE public.account_opening_balances ADD COLUMN IF NOT EXISTS currency text, ADD COLUMN IF NOT EXISTS original_amount numeric, ADD COLUMN IF NOT EXISTS fx_rate numeric;
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS opening_fx_rate numeric, ADD COLUMN IF NOT EXISTS opening_base_value numeric;
COMMENT ON COLUMN public.bank_accounts.opening_base_value IS 'Opening balance in base at the opening_date rate (historical carrying value); data only, never posted.';

CREATE OR REPLACE FUNCTION public.fx_document_defaults() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b text; r record; d date; j jsonb := to_jsonb(NEW);
BEGIN
 SELECT coalesce(base_currency,'HKD') INTO b FROM tenants WHERE id=NEW.tenant_id;
 IF NEW.currency IS NULL OR NEW.currency='' THEN NEW.currency:=b; END IF;
 NEW.currency:=upper(NEW.currency);
 IF NEW.currency<>b AND NEW.fx_rate IS NULL THEN
  d:=CASE TG_TABLE_NAME WHEN 'expense_bills' THEN (j->>'bill_date')::date WHEN 'invoices' THEN (j->>'invoice_date')::date
     WHEN 'credit_notes' THEN coalesce((j->>'credit_note_date')::date,current_date)
     WHEN 'supplier_opening_balances' THEN coalesce((j->>'as_of_date')::date,current_date)
     WHEN 'account_opening_balances' THEN coalesce((j->>'as_at_date')::date,current_date)
     WHEN 'customer_opening_balances' THEN coalesce((j->>'invoice_date')::date,current_date)
     ELSE coalesce((j->>'period_end')::date,current_date) END;
  SELECT * INTO r FROM fx_rate(NEW.tenant_id,d,NEW.currency);
  IF r.rate IS NOT NULL THEN NEW.fx_rate:=r.rate; END IF;
 END IF;
 RETURN NEW; END $$;

CREATE TRIGGER fx_defaults_credit_notes BEFORE INSERT OR UPDATE OF currency ON public.credit_notes FOR EACH ROW EXECUTE FUNCTION public.fx_document_defaults();
CREATE TRIGGER fx_defaults_supplier_opening BEFORE INSERT OR UPDATE OF currency ON public.supplier_opening_balances FOR EACH ROW EXECUTE FUNCTION public.fx_document_defaults();
CREATE TRIGGER fx_defaults_account_opening BEFORE INSERT OR UPDATE OF currency ON public.account_opening_balances FOR EACH ROW EXECUTE FUNCTION public.fx_document_defaults();

-- Document-currency open balance starts at the document total.
CREATE OR REPLACE FUNCTION public.fx_original_balance_default() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.original_total IS NOT NULL AND NEW.original_balance IS NULL THEN NEW.original_balance:=NEW.original_total; END IF;
 IF NEW.original_total IS NULL THEN NEW.original_balance:=NULL; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER fx_original_balance_invoices BEFORE INSERT OR UPDATE OF original_total ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.fx_original_balance_default();
CREATE TRIGGER fx_original_balance_bills BEFORE INSERT OR UPDATE OF original_total ON public.expense_bills FOR EACH ROW EXECUTE FUNCTION public.fx_original_balance_default();

CREATE OR REPLACE FUNCTION public.fx_credit_note_original() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.original_currency_amount IS NOT NULL AND NEW.original_remaining IS NULL THEN NEW.original_remaining:=NEW.original_currency_amount; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER fx_credit_note_original BEFORE INSERT ON public.credit_notes FOR EACH ROW EXECUTE FUNCTION public.fx_credit_note_original();

-- Foreign bank accounts: historical opening carrying value at the opening-date rate.
CREATE OR REPLACE FUNCTION public.fx_bank_opening_value() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b text; r record;
BEGIN
 SELECT coalesce(base_currency,'HKD') INTO b FROM tenants WHERE id=NEW.tenant_id;
 IF coalesce(upper(NEW.currency),b)=b OR NEW.opening_date IS NULL THEN NEW.opening_fx_rate:=NULL; NEW.opening_base_value:=NULL; RETURN NEW; END IF;
 IF NEW.opening_fx_rate IS NULL OR TG_OP='UPDATE' AND (OLD.opening_date IS DISTINCT FROM NEW.opening_date OR OLD.currency IS DISTINCT FROM NEW.currency) AND NEW.opening_fx_rate IS NOT DISTINCT FROM OLD.opening_fx_rate THEN
  SELECT * INTO r FROM fx_rate(NEW.tenant_id,NEW.opening_date,upper(NEW.currency)); NEW.opening_fx_rate:=r.rate;
 END IF;
 NEW.opening_base_value:=CASE WHEN NEW.opening_fx_rate IS NULL THEN NULL ELSE round(coalesce(NEW.opening_balance,0)*NEW.opening_fx_rate,2) END;
 RETURN NEW; END $$;
CREATE TRIGGER fx_bank_opening_value BEFORE INSERT OR UPDATE OF opening_balance, opening_date, currency, opening_fx_rate ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.fx_bank_opening_value();
UPDATE public.bank_accounts SET opening_fx_rate=NULL WHERE currency IS NOT NULL AND opening_date IS NOT NULL;