
-- 1. Bank accounts: account type
ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'current';

-- 2. Bank transactions: richer extraction + recognition fields
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS value_date date,
  ADD COLUMN IF NOT EXISTS counterparty text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_page integer,
  ADD COLUMN IF NOT EXISTS suggested_type text,
  ADD COLUMN IF NOT EXISTS suggested_category text,
  ADD COLUMN IF NOT EXISTS suggested_match_id text,
  ADD COLUMN IF NOT EXISTS extraction_confidence numeric;

-- 3. Statement -> bank account auto mappings
CREATE TABLE IF NOT EXISTS public.bank_statement_account_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name text NOT NULL,
  account_number_last4 text NOT NULL,
  bank_account_id uuid NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bank_name, account_number_last4)
);
ALTER TABLE public.bank_statement_account_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read bank stmt mappings"
  ON public.bank_statement_account_mappings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can manage bank stmt mappings"
  ON public.bank_statement_account_mappings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- 4. User-defined recognition rules
CREATE TABLE IF NOT EXISTS public.bank_recon_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  match_contains text NOT NULL,
  suggested_type text NOT NULL,
  suggested_category text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bank_recon_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read bank recon rules"
  ON public.bank_recon_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can manage bank recon rules"
  ON public.bank_recon_rules FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- 5. Storage bucket for bank statements (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('bank-statements', 'bank-statements', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (admin/manager read+write; authenticated cannot read by default)
DROP POLICY IF EXISTS "Bank statements: staff read" ON storage.objects;
CREATE POLICY "Bank statements: staff read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bank-statements' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

DROP POLICY IF EXISTS "Bank statements: staff insert" ON storage.objects;
CREATE POLICY "Bank statements: staff insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bank-statements' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

DROP POLICY IF EXISTS "Bank statements: staff update" ON storage.objects;
CREATE POLICY "Bank statements: staff update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'bank-statements' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

DROP POLICY IF EXISTS "Bank statements: staff delete" ON storage.objects;
CREATE POLICY "Bank statements: staff delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'bank-statements' AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));
