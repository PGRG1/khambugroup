
-- Bank Accounts master
CREATE TABLE public.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_name text NOT NULL,
  bank_name text NOT NULL DEFAULT '',
  account_number_last4 text NOT NULL DEFAULT '',
  currency text NOT NULL DEFAULT 'HKD',
  venue text,
  entity text,
  linked_gl_account_id uuid REFERENCES public.chart_of_accounts(id),
  opening_balance numeric NOT NULL DEFAULT 0,
  opening_date date NOT NULL DEFAULT CURRENT_DATE,
  is_active boolean NOT NULL DEFAULT true,
  last_reconciled_date date,
  notes text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read bank_accounts" ON public.bank_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can manage bank_accounts" ON public.bank_accounts FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));
CREATE TRIGGER trg_bank_accounts_updated BEFORE UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Statement Imports
CREATE TABLE public.bank_statement_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  opening_balance numeric NOT NULL DEFAULT 0,
  closing_balance numeric NOT NULL DEFAULT 0,
  file_url text,
  file_name text,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'imported',
  notes text NOT NULL DEFAULT ''
);
ALTER TABLE public.bank_statement_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read bank_statement_imports" ON public.bank_statement_imports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can manage bank_statement_imports" ON public.bank_statement_imports FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));

-- Bank Transactions
CREATE TABLE public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid REFERENCES public.bank_statement_imports(id) ON DELETE SET NULL,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  txn_date date NOT NULL,
  description text NOT NULL DEFAULT '',
  reference text NOT NULL DEFAULT '',
  money_in numeric NOT NULL DEFAULT 0,
  money_out numeric NOT NULL DEFAULT 0,
  running_balance numeric,
  status text NOT NULL DEFAULT 'unmatched',
  match_confidence text,
  matched_record_type text,
  matched_record_id text,
  journal_entry_id uuid,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_bank_txn_account_date ON public.bank_transactions(bank_account_id, txn_date);
CREATE INDEX idx_bank_txn_status ON public.bank_transactions(status);
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read bank_transactions" ON public.bank_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can manage bank_transactions" ON public.bank_transactions FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));
CREATE TRIGGER trg_bank_txn_updated BEFORE UPDATE ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Reconciliation periods (locks)
CREATE TABLE public.bank_reconciliation_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  statement_balance numeric NOT NULL DEFAULT 0,
  ledger_balance numeric NOT NULL DEFAULT 0,
  difference numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  locked_by uuid,
  locked_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_bank_recon_period ON public.bank_reconciliation_periods(bank_account_id, period_start, period_end);
ALTER TABLE public.bank_reconciliation_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read bank_recon_periods" ON public.bank_reconciliation_periods FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can manage bank_recon_periods" ON public.bank_reconciliation_periods FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));

-- Audit trail
CREATE TABLE public.bank_audit_trail (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  user_display_name text,
  action text NOT NULL,
  bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  bank_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  old_status text,
  new_status text,
  notes jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_bank_audit_account ON public.bank_audit_trail(bank_account_id, ts DESC);
ALTER TABLE public.bank_audit_trail ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read bank_audit_trail" ON public.bank_audit_trail FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert bank_audit_trail" ON public.bank_audit_trail FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Storage bucket for statements
INSERT INTO storage.buckets (id, name, public) VALUES ('bank-statements', 'bank-statements', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can read bank statements"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bank-statements');

CREATE POLICY "Authorized can upload bank statements"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bank-statements'
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role)));

CREATE POLICY "Authorized can update bank statements"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'bank-statements'
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role)));

CREATE POLICY "Authorized can delete bank statements"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'bank-statements'
    AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role)));
