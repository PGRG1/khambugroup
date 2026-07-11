
-- 1) tenant_onboarding
CREATE TABLE public.tenant_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  current_phase int NOT NULL DEFAULT 1,
  steps jsonb NOT NULL DEFAULT '{}'::jsonb,
  starting_fresh boolean NOT NULL DEFAULT false,
  conversion_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_onboarding TO authenticated;
GRANT ALL ON public.tenant_onboarding TO service_role;
ALTER TABLE public.tenant_onboarding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "onboarding read" ON public.tenant_onboarding FOR SELECT
  USING (is_platform_admin(auth.uid()) OR is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "onboarding write" ON public.tenant_onboarding FOR ALL
  USING (is_platform_admin(auth.uid()) OR is_tenant_admin(tenant_id, auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()) OR is_tenant_admin(tenant_id, auth.uid()));
CREATE TRIGGER trg_tenant_onboarding_updated BEFORE UPDATE ON public.tenant_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) organizations.industry
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS industry text;

-- 3) tenants: typed localisation columns
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS base_currency text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS financial_year_end date,
  ADD COLUMN IF NOT EXISTS financial_year_start_year int;

-- Backfill from app_config where present (best-effort; ignore if missing)
UPDATE public.tenants t SET timezone = ac.value
  FROM public.app_config ac WHERE ac.tenant_id = t.id AND ac.key='timezone' AND t.timezone IS NULL;
UPDATE public.tenants t SET base_currency = ac.value
  FROM public.app_config ac WHERE ac.tenant_id = t.id AND ac.key='base_currency' AND t.base_currency IS NULL;
UPDATE public.tenants t SET country = ac.value
  FROM public.app_config ac WHERE ac.tenant_id = t.id AND ac.key='country' AND t.country IS NULL;

-- Defaults for new tenants
ALTER TABLE public.tenants ALTER COLUMN timezone SET DEFAULT 'Asia/Hong_Kong';
ALTER TABLE public.tenants ALTER COLUMN base_currency SET DEFAULT 'HKD';
ALTER TABLE public.tenants ALTER COLUMN country SET DEFAULT 'HK';

-- Migrate organisation legal_entity_name into organizations.legal_name if empty
UPDATE public.organizations o SET legal_name = ac.value
  FROM public.app_config ac
  WHERE ac.tenant_id = o.tenant_id AND ac.key='legal_entity_name' AND (o.legal_name IS NULL OR o.legal_name='');

-- Drop deprecated app_config keys now that data is typed
DELETE FROM public.app_config
  WHERE key IN ('timezone','base_currency','country','legal_entity_name','client_group_name','financial_year_start');

-- 4) coa_templates
CREATE TABLE public.coa_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  industry text,
  description text,
  template jsonb NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coa_templates TO authenticated, anon;
GRANT ALL ON public.coa_templates TO service_role;
ALTER TABLE public.coa_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coa templates readable" ON public.coa_templates FOR SELECT USING (true);
CREATE POLICY "coa templates admin write" ON public.coa_templates FOR ALL
  USING (is_platform_admin(auth.uid())) WITH CHECK (is_platform_admin(auth.uid()));

INSERT INTO public.coa_templates (code, name, industry, description, template) VALUES
('f_and_b_hk', 'F&B — Hong Kong', 'food_and_beverage',
 'Restaurant/bar chart with food vs beverage COGS split, service charge revenue, and F&B opex.',
 '[
  {"code":"1000","name":"Cash on Hand","account_type":"asset","normal_side":"debit","is_cash":true,"sort_order":10},
  {"code":"1010","name":"Bank — Operating","account_type":"asset","normal_side":"debit","is_cash":true,"sort_order":20},
  {"code":"1020","name":"Payment Settlement Clearing","account_type":"asset","normal_side":"debit","sort_order":25},
  {"code":"1100","name":"Accounts Receivable","account_type":"asset","normal_side":"debit","sort_order":30},
  {"code":"1200","name":"Inventory — Food","account_type":"asset","normal_side":"debit","sort_order":40},
  {"code":"1210","name":"Inventory — Beverage","account_type":"asset","normal_side":"debit","sort_order":45},
  {"code":"1500","name":"Fixed Assets","account_type":"asset","normal_side":"debit","sort_order":50},
  {"code":"2000","name":"Accounts Payable","account_type":"liability","normal_side":"credit","sort_order":60},
  {"code":"2100","name":"Accrued Expenses","account_type":"liability","normal_side":"credit","sort_order":70},
  {"code":"2200","name":"Taxes Payable","account_type":"liability","normal_side":"credit","sort_order":80},
  {"code":"2300","name":"Tips Payable","account_type":"liability","normal_side":"credit","sort_order":85},
  {"code":"3000","name":"Owner''s Equity","account_type":"equity","normal_side":"credit","sort_order":90},
  {"code":"3100","name":"Retained Earnings","account_type":"equity","normal_side":"credit","sort_order":100},
  {"code":"4000","name":"Food Sales","account_type":"revenue","normal_side":"credit","sort_order":110},
  {"code":"4010","name":"Beverage Sales","account_type":"revenue","normal_side":"credit","sort_order":115},
  {"code":"4100","name":"Service Charge","account_type":"revenue","normal_side":"credit","sort_order":120},
  {"code":"4200","name":"Other Income","account_type":"other_income","normal_side":"credit","sort_order":130},
  {"code":"4900","name":"Discounts & Comps","account_type":"revenue","normal_side":"debit","sort_order":135},
  {"code":"5000","name":"COGS — Food","account_type":"cogs","normal_side":"debit","sort_order":140},
  {"code":"5010","name":"COGS — Beverage","account_type":"cogs","normal_side":"debit","sort_order":145},
  {"code":"6000","name":"Salaries & Wages","account_type":"opex","normal_side":"debit","sort_order":150},
  {"code":"6010","name":"MPF & Benefits","account_type":"opex","normal_side":"debit","sort_order":152},
  {"code":"6100","name":"Rent","account_type":"opex","normal_side":"debit","sort_order":160},
  {"code":"6200","name":"Utilities","account_type":"opex","normal_side":"debit","sort_order":170},
  {"code":"6250","name":"Cleaning & Consumables","account_type":"opex","normal_side":"debit","sort_order":175},
  {"code":"6300","name":"Marketing","account_type":"opex","normal_side":"debit","sort_order":180},
  {"code":"6350","name":"Delivery Platform Fees","account_type":"opex","normal_side":"debit","sort_order":182},
  {"code":"6360","name":"Merchant / Card Fees","account_type":"opex","normal_side":"debit","sort_order":184},
  {"code":"6400","name":"Repairs & Maintenance","account_type":"opex","normal_side":"debit","sort_order":190},
  {"code":"6500","name":"Licenses & Permits","account_type":"opex","normal_side":"debit","sort_order":195},
  {"code":"6900","name":"General & Admin","account_type":"opex","normal_side":"debit","sort_order":200}
 ]'::jsonb);

-- 5) account_opening_balances
CREATE TABLE public.account_opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  coa_account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  as_at_date date NOT NULL,
  debit numeric(18,2) NOT NULL DEFAULT 0,
  credit numeric(18,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
  posted_journal_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, organization_id, coa_account_id, as_at_date)
);
CREATE INDEX ON public.account_opening_balances(tenant_id);
CREATE INDEX ON public.account_opening_balances(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_opening_balances TO authenticated;
GRANT ALL ON public.account_opening_balances TO service_role;
ALTER TABLE public.account_opening_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aob read" ON public.account_opening_balances FOR SELECT
  USING (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "aob write" ON public.account_opening_balances FOR ALL
  USING (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id));
CREATE TRIGGER trg_aob_updated BEFORE UPDATE ON public.account_opening_balances
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6) customer_opening_balances (mirror supplier_opening_balances shape)
CREATE TABLE public.customer_opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  invoice_no text,
  invoice_date date,
  due_date date,
  original_amount numeric(18,2) NOT NULL DEFAULT 0,
  outstanding_amount numeric(18,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'HKD',
  is_credit_note boolean NOT NULL DEFAULT false,
  as_of_date date NOT NULL,
  venue text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.customer_opening_balances(tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_opening_balances TO authenticated;
GRANT ALL ON public.customer_opening_balances TO service_role;
ALTER TABLE public.customer_opening_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cob read" ON public.customer_opening_balances FOR SELECT
  USING (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "cob write" ON public.customer_opening_balances FOR ALL
  USING (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id));
CREATE TRIGGER trg_cob_updated BEFORE UPDATE ON public.customer_opening_balances
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 7) Seed tenant_onboarding rows for all existing tenants so the cockpit works immediately
INSERT INTO public.tenant_onboarding (tenant_id, current_phase, steps)
SELECT t.id, 1, '{}'::jsonb
FROM public.tenants t
WHERE NOT EXISTS (SELECT 1 FROM public.tenant_onboarding o WHERE o.tenant_id = t.id);
