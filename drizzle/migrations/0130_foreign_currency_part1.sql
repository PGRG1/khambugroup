CREATE TABLE public.fx_reference_rates(
 rate_date date NOT NULL, quote_currency text NOT NULL CHECK (quote_currency ~ '^[A-Z]{3}$'),
 usd_rate numeric NOT NULL CHECK (usd_rate>0), source text NOT NULL, fetched_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(rate_date,quote_currency));
COMMENT ON TABLE public.fx_reference_rates IS 'Global daily reference rates: 1 USD = usd_rate units of quote_currency.';
GRANT SELECT ON public.fx_reference_rates TO authenticated;
GRANT ALL ON public.fx_reference_rates TO service_role;
ALTER TABLE public.fx_reference_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signed in read reference rates" ON public.fx_reference_rates FOR SELECT TO authenticated USING (true);

ALTER TABLE public.bank_fx_rates ADD COLUMN IF NOT EXISTS overridden_by uuid DEFAULT auth.uid(), ADD COLUMN IF NOT EXISTS overridden_at timestamptz NOT NULL DEFAULT now();
COMMENT ON TABLE public.bank_fx_rates IS 'Tenant manual rate overrides (from_currency -> to_currency on rate_date), recording who and when.';

ALTER TABLE public.journal_lines ADD COLUMN IF NOT EXISTS currency text, ADD COLUMN IF NOT EXISTS original_amount numeric, ADD COLUMN IF NOT EXISTS fx_rate numeric;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS currency text, ADD COLUMN IF NOT EXISTS fx_rate numeric, ADD COLUMN IF NOT EXISTS fx_rate_source text;
ALTER TABLE public.expense_bills ADD COLUMN IF NOT EXISTS fx_rate numeric, ADD COLUMN IF NOT EXISTS fx_rate_source text;
ALTER TABLE public.payment_settlement_imports ADD COLUMN IF NOT EXISTS fx_rate numeric;
ALTER TABLE public.customer_opening_balances ADD COLUMN IF NOT EXISTS fx_rate numeric;
ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS fx_rate_source text;

-- Rate lookup: units of base per 1 unit of currency, nearest previous date.
CREATE OR REPLACE FUNCTION public.fx_rate(p_tenant uuid, p_date date, p_currency text)
RETURNS TABLE(rate numeric, rate_date date, source text, nearest boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE b text; o record; r1 record; r2 record;
BEGIN
 SELECT coalesce(base_currency,'HKD') INTO b FROM tenants WHERE id=p_tenant;
 IF upper(p_currency)=b THEN RETURN QUERY SELECT 1::numeric,p_date,'base'::text,false; RETURN; END IF;
 SELECT f.rate,f.rate_date INTO o FROM bank_fx_rates f WHERE f.tenant_id=p_tenant AND f.from_currency=upper(p_currency) AND f.to_currency=b AND f.rate_date<=p_date ORDER BY f.rate_date DESC LIMIT 1;
 SELECT x.usd_rate,x.rate_date INTO r1 FROM fx_reference_rates x WHERE x.quote_currency=b AND x.rate_date<=p_date ORDER BY x.rate_date DESC LIMIT 1;
 SELECT x.usd_rate,x.rate_date INTO r2 FROM fx_reference_rates x WHERE x.quote_currency=upper(p_currency) AND x.rate_date<=p_date ORDER BY x.rate_date DESC LIMIT 1;
 IF o.rate IS NOT NULL AND (r2.rate_date IS NULL OR o.rate_date>=least(r1.rate_date,r2.rate_date)) THEN
  RETURN QUERY SELECT o.rate,o.rate_date,'manual'::text,o.rate_date<>p_date; RETURN; END IF;
 IF r1.usd_rate IS NULL AND b='USD' THEN r1.usd_rate:=1; r1.rate_date:=r2.rate_date; END IF;
 IF upper(p_currency)='USD' THEN r2.usd_rate:=1; r2.rate_date:=r1.rate_date; END IF;
 IF r1.usd_rate IS NULL OR r2.usd_rate IS NULL THEN RETURN; END IF;
 RETURN QUERY SELECT round(r1.usd_rate/r2.usd_rate,8),least(r1.rate_date,r2.rate_date),'reference'::text,least(r1.rate_date,r2.rate_date)<>p_date;
END $$;
GRANT EXECUTE ON FUNCTION public.fx_rate(uuid,date,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_base_currency() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.base_currency IS DISTINCT FROM OLD.base_currency THEN
  IF NEW.base_currency !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Base currency must be a 3-letter ISO code'; END IF;
  IF EXISTS(SELECT 1 FROM journal_entries WHERE tenant_id=NEW.id AND status='posted') THEN
   RAISE EXCEPTION 'Base currency is locked once a journal is posted'; END IF;
 END IF; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS tenants_base_currency_guard ON public.tenants;
CREATE TRIGGER tenants_base_currency_guard BEFORE UPDATE OF base_currency ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.guard_base_currency();

CREATE OR REPLACE FUNCTION public.set_base_currency(p_tenant uuid, p_currency text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT (is_super_admin(auth.uid()) OR (is_tenant_member(p_tenant,auth.uid()) AND has_role(auth.uid(),'admin'))) THEN RAISE EXCEPTION 'Only an admin can set the base currency'; END IF;
 UPDATE tenants SET base_currency=upper(p_currency) WHERE id=p_tenant;
END $$;
REVOKE ALL ON FUNCTION public.set_base_currency(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_base_currency(uuid,text) TO authenticated;