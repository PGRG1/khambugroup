
CREATE TABLE public.supplier_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  account_number text NOT NULL,
  label text,
  default_venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  default_gl_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_accounts_tenant_supplier_acct_uk UNIQUE (tenant_id, supplier_id, account_number)
);
CREATE INDEX idx_supplier_accounts_tenant_supplier ON public.supplier_accounts(tenant_id, supplier_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_accounts TO authenticated;
GRANT ALL ON public.supplier_accounts TO service_role;

ALTER TABLE public.supplier_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select ON public.supplier_accounts
  FOR SELECT USING (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY tenant_write ON public.supplier_accounts
  FOR ALL
  USING (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id));

CREATE TRIGGER update_supplier_accounts_updated_at
  BEFORE UPDATE ON public.supplier_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Link columns on bills & statements
ALTER TABLE public.expense_bills
  ADD COLUMN supplier_account_id uuid REFERENCES public.supplier_accounts(id) ON DELETE SET NULL;
CREATE INDEX idx_expense_bills_supplier_account ON public.expense_bills(supplier_account_id);

ALTER TABLE public.expense_vendor_statements
  ADD COLUMN supplier_account_id uuid REFERENCES public.supplier_accounts(id) ON DELETE SET NULL;
CREATE INDEX idx_expense_vendor_statements_supplier_account ON public.expense_vendor_statements(supplier_account_id);

-- Backfill: create supplier_accounts rows from suppliers.account_number
INSERT INTO public.supplier_accounts (supplier_id, tenant_id, account_number, label, default_venue_id, default_gl_account_id, is_active)
SELECT
  s.id,
  s.tenant_id,
  s.account_number,
  CASE WHEN s.id = '5062bdf5-e222-4caa-af0b-f00fa7a8173e' THEN 'G/F, 1F, 3F' ELSE NULL END,
  CASE WHEN s.id = '5062bdf5-e222-4caa-af0b-f00fa7a8173e' THEN 'a5b9ac37-87a8-47e7-96d1-33e5744aac2f'::uuid ELSE NULL END,
  CASE WHEN s.id = '5062bdf5-e222-4caa-af0b-f00fa7a8173e' THEN '698af63c-fd1a-4ea1-93ca-27fced28af89'::uuid ELSE NULL END,
  true
FROM public.suppliers s
WHERE s.account_number IS NOT NULL
  AND btrim(s.account_number) <> ''
ON CONFLICT (tenant_id, supplier_id, account_number) DO NOTHING;

-- Backfill expense_bills.supplier_account_id where bill_number matches the account_number
UPDATE public.expense_bills eb
SET supplier_account_id = sa.id
FROM public.supplier_accounts sa
WHERE eb.supplier_id = sa.supplier_id
  AND eb.tenant_id = sa.tenant_id
  AND eb.bill_number = sa.account_number
  AND eb.supplier_account_id IS NULL;

-- Backfill expense_vendor_statements similarly (statement_number match)
UPDATE public.expense_vendor_statements evs
SET supplier_account_id = sa.id
FROM public.supplier_accounts sa
WHERE evs.supplier_id = sa.supplier_id
  AND evs.tenant_id = sa.tenant_id
  AND evs.statement_number = sa.account_number
  AND evs.supplier_account_id IS NULL;
