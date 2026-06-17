
-- Vendor Statements
CREATE TABLE public.expense_vendor_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  vendor_name text,
  statement_number text,
  statement_date date NOT NULL,
  period_start date,
  period_end date,
  opening_balance numeric NOT NULL DEFAULT 0,
  current_period_charges numeric NOT NULL DEFAULT 0,
  payments_credits numeric NOT NULL DEFAULT 0,
  late_fees numeric NOT NULL DEFAULT 0,
  closing_balance numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'HKD',
  venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  department text,
  status text NOT NULL DEFAULT 'draft',
  approval_status text NOT NULL DEFAULT 'draft',
  payment_status text NOT NULL DEFAULT 'unpaid',
  notes text,
  attachment_url text,
  posted_journal_entry_id uuid,
  uploaded_by uuid,
  reviewed_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_vendor_statements TO authenticated;
GRANT ALL ON public.expense_vendor_statements TO service_role;
ALTER TABLE public.expense_vendor_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read vendor statements" ON public.expense_vendor_statements FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage vendor statements" ON public.expense_vendor_statements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TABLE public.expense_vendor_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES public.expense_vendor_statements(id) ON DELETE CASCADE,
  line_date date,
  description text,
  amount numeric NOT NULL DEFAULT 0,
  line_type text NOT NULL DEFAULT 'current_charge', -- opening | current_charge | payment | credit | late_fee | closing
  account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_vendor_statement_lines TO authenticated;
GRANT ALL ON public.expense_vendor_statement_lines TO service_role;
ALTER TABLE public.expense_vendor_statement_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read statement lines" ON public.expense_vendor_statement_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage statement lines" ON public.expense_vendor_statement_lines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Recurring expense rules
CREATE TABLE public.expense_recurring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  vendor_name text,
  category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  department text,
  expected_amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'HKD',
  cadence text NOT NULL DEFAULT 'monthly', -- monthly | quarterly | yearly | weekly
  day_of_month int,
  next_due_date date,
  last_generated_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_recurring_rules TO authenticated;
GRANT ALL ON public.expense_recurring_rules TO service_role;
ALTER TABLE public.expense_recurring_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read recurring rules" ON public.expense_recurring_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage recurring rules" ON public.expense_recurring_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Link bank transactions to a posted expense bill (for Bank-Detected expenses)
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS expense_posted_bill_id uuid REFERENCES public.expense_bills(id) ON DELETE SET NULL;

-- updated_at triggers
CREATE TRIGGER trg_evs_updated BEFORE UPDATE ON public.expense_vendor_statements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_err_updated BEFORE UPDATE ON public.expense_recurring_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
