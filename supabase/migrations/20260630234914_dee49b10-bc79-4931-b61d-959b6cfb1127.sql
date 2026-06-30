
-- Bank module: schema additions on existing tables + new supporting tables

-- 1) bank_transactions: extend
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS value_date date,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'HKD',
  ADD COLUMN IF NOT EXISTS category_account_id uuid REFERENCES public.chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS attachment_urls text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS parent_txn_id uuid REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_transfer boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS transfer_pair_id uuid,
  ADD COLUMN IF NOT EXISTS fx_rate numeric,
  ADD COLUMN IF NOT EXISTS fx_gain_loss numeric,
  ADD COLUMN IF NOT EXISTS is_manual boolean DEFAULT false;

-- 2) bank_transaction_matches: many-to-many matching
CREATE TABLE IF NOT EXISTS public.bank_transaction_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  txn_id uuid NOT NULL REFERENCES public.bank_transactions(id) ON DELETE CASCADE,
  matched_type text NOT NULL,
  matched_id text NOT NULL,
  amount numeric NOT NULL,
  confidence text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_btm_txn ON public.bank_transaction_matches(txn_id);
CREATE INDEX IF NOT EXISTS idx_btm_match ON public.bank_transaction_matches(matched_type, matched_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transaction_matches TO authenticated;
GRANT ALL ON public.bank_transaction_matches TO service_role;

ALTER TABLE public.bank_transaction_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members can view bank matches"
  ON public.bank_transaction_matches FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "tenant members can write bank matches"
  ON public.bank_transaction_matches FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "tenant members can update bank matches"
  ON public.bank_transaction_matches FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "tenant members can delete bank matches"
  ON public.bank_transaction_matches FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_member(tenant_id, auth.uid()));

-- 3) bank_fx_rates
CREATE TABLE IF NOT EXISTS public.bank_fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  rate_date date NOT NULL,
  from_currency text NOT NULL,
  to_currency text NOT NULL,
  rate numeric NOT NULL,
  source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, rate_date, from_currency, to_currency)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_fx_rates TO authenticated;
GRANT ALL ON public.bank_fx_rates TO service_role;

ALTER TABLE public.bank_fx_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant members view fx" ON public.bank_fx_rates FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "tenant members insert fx" ON public.bank_fx_rates FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "tenant members update fx" ON public.bank_fx_rates FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY "tenant members delete fx" ON public.bank_fx_rates FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_member(tenant_id, auth.uid()));
