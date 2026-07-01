
-- 1) Add tenant_id to bank tables
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.bank_statement_imports ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- 2) Drop existing policies and recreate tenant-scoped ones
DROP POLICY IF EXISTS tenant_venue_select ON public.bank_accounts;
DROP POLICY IF EXISTS tenant_venue_write ON public.bank_accounts;
DROP POLICY IF EXISTS tenant_select ON public.bank_accounts;
DROP POLICY IF EXISTS tenant_write ON public.bank_accounts;

DROP POLICY IF EXISTS tenant_select ON public.bank_transactions;
DROP POLICY IF EXISTS tenant_write ON public.bank_transactions;
DROP POLICY IF EXISTS tenant_venue_select ON public.bank_transactions;
DROP POLICY IF EXISTS tenant_venue_write ON public.bank_transactions;

DROP POLICY IF EXISTS tenant_select ON public.bank_statement_imports;
DROP POLICY IF EXISTS tenant_write ON public.bank_statement_imports;
DROP POLICY IF EXISTS tenant_venue_select ON public.bank_statement_imports;
DROP POLICY IF EXISTS tenant_venue_write ON public.bank_statement_imports;

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select ON public.bank_accounts FOR SELECT
  USING (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY tenant_write ON public.bank_accounts FOR ALL
  USING (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY tenant_select ON public.bank_transactions FOR SELECT
  USING (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY tenant_write ON public.bank_transactions FOR ALL
  USING (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY tenant_select ON public.bank_statement_imports FOR SELECT
  USING (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY tenant_write ON public.bank_statement_imports FOR ALL
  USING (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_accounts TO authenticated;
GRANT ALL ON public.bank_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_statement_imports TO authenticated;
GRANT ALL ON public.bank_statement_imports TO service_role;

-- 3) Add source column + backfill
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'statement';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_source_check'
  ) THEN
    ALTER TABLE public.bank_transactions
      ADD CONSTRAINT bank_transactions_source_check
      CHECK (source IN ('statement','manual','system'));
  END IF;
END $$;

UPDATE public.bank_transactions
  SET source = 'manual'
  WHERE is_manual = true AND source <> 'manual';

-- 4) Add cash_flow_category to chart_of_accounts
ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS cash_flow_category text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chart_of_accounts_cash_flow_category_check'
  ) THEN
    ALTER TABLE public.chart_of_accounts
      ADD CONSTRAINT chart_of_accounts_cash_flow_category_check
      CHECK (cash_flow_category IS NULL OR cash_flow_category IN ('operating','investing','financing'));
  END IF;
END $$;

-- 5) Extend journal_entries.source_type CHECK to include bank_transaction + expense_bill
ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'sales','sales_summary','invoice','invoice_payment',
    'payroll_accrual','payroll_payment','mpf_payment',
    'settlement_fee','settlement_clearing','bank_fee','bank_txn',
    'manual','adjustment','opening',
    'bank_transaction','expense_bill'
  ]::text[]));

-- 6) Add proper FK on bank_transactions.journal_entry_id
ALTER TABLE public.bank_transactions
  DROP CONSTRAINT IF EXISTS bank_transactions_journal_entry_id_fkey;
ALTER TABLE public.bank_transactions
  ADD CONSTRAINT bank_transactions_journal_entry_id_fkey
  FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE SET NULL;
