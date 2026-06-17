
-- ============= EXPENSE BILLS HEADER =============
CREATE TABLE public.expense_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  vendor_name TEXT,
  bill_number TEXT,
  bill_date DATE NOT NULL,
  due_date DATE,
  service_period_start DATE,
  service_period_end DATE,
  venue_id UUID REFERENCES public.venues(id) ON DELETE SET NULL,
  venue TEXT,
  department TEXT,
  currency TEXT NOT NULL DEFAULT 'HKD',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  approval_status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  attachment_url TEXT,
  attachment_path TEXT,
  document_type TEXT DEFAULT 'bill_expense',
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  posted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_expense_bills_supplier ON public.expense_bills(supplier_id);
CREATE INDEX idx_expense_bills_bill_date ON public.expense_bills(bill_date);
CREATE INDEX idx_expense_bills_status ON public.expense_bills(approval_status, payment_status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_bills TO authenticated;
GRANT ALL ON public.expense_bills TO service_role;
ALTER TABLE public.expense_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read expense_bills" ON public.expense_bills FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert expense_bills" ON public.expense_bills FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update expense_bills" ON public.expense_bills FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin delete expense_bills" ON public.expense_bills FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'::public.app_role));

-- ============= ALLOCATIONS =============
CREATE TABLE public.expense_bill_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.expense_bills(id) ON DELETE CASCADE,
  line_no INT NOT NULL DEFAULT 1,
  expense_category TEXT,
  account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  venue TEXT,
  department TEXT,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_treatment TEXT NOT NULL DEFAULT 'none',
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_expense_bill_allocations_bill ON public.expense_bill_allocations(bill_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_bill_allocations TO authenticated;
GRANT ALL ON public.expense_bill_allocations TO service_role;
ALTER TABLE public.expense_bill_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage allocations" ON public.expense_bill_allocations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= PAYMENTS =============
CREATE TABLE public.expense_bill_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.expense_bills(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
  bank_account_id UUID REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  reference TEXT,
  notes TEXT,
  journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_expense_bill_payments_bill ON public.expense_bill_payments(bill_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_bill_payments TO authenticated;
GRANT ALL ON public.expense_bill_payments TO service_role;
ALTER TABLE public.expense_bill_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage bill payments" ON public.expense_bill_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= AUDIT TRAIL =============
CREATE TABLE public.expense_bill_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.expense_bills(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_expense_bill_audit_bill ON public.expense_bill_audit(bill_id);
GRANT SELECT, INSERT ON public.expense_bill_audit TO authenticated;
GRANT ALL ON public.expense_bill_audit TO service_role;
ALTER TABLE public.expense_bill_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read audit" ON public.expense_bill_audit FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert audit" ON public.expense_bill_audit FOR INSERT TO authenticated WITH CHECK (true);

-- ============= LINKS (late fee linking) =============
CREATE TABLE public.expense_bill_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_bill_id UUID NOT NULL REFERENCES public.expense_bills(id) ON DELETE CASCADE,
  child_bill_id UUID NOT NULL REFERENCES public.expense_bills(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL DEFAULT 'late_fee',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_bill_id, child_bill_id, link_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_bill_links TO authenticated;
GRANT ALL ON public.expense_bill_links TO service_role;
ALTER TABLE public.expense_bill_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage bill links" ON public.expense_bill_links FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============= updated_at triggers =============
CREATE TRIGGER trg_expense_bills_updated BEFORE UPDATE ON public.expense_bills FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_expense_bill_allocations_updated BEFORE UPDATE ON public.expense_bill_allocations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_expense_bill_payments_updated BEFORE UPDATE ON public.expense_bill_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= POST EXPENSE BILL RPC =============
CREATE OR REPLACE FUNCTION public.post_expense_bill(p_bill_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_uname TEXT;
  b RECORD;
  a RECORD;
  e_id UUID;
  v_ln INT := 0;
  acc_ap UUID;
  acc_tax UUID;
  v_total_d NUMERIC := 0;
  v_total_c NUMERIC := 0;
  v_label TEXT;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized: admin role required';
  END IF;

  SELECT * INTO b FROM public.expense_bills WHERE id = p_bill_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Bill not found'; END IF;
  IF b.journal_entry_id IS NOT NULL THEN
    RETURN jsonb_build_object('already_posted', true, 'journal_entry_id', b.journal_entry_id);
  END IF;

  SELECT display_name INTO v_uname FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  SELECT account_id INTO acc_ap FROM public.account_mapping_rules WHERE rule_type='accounts_payable' LIMIT 1;
  IF acc_ap IS NULL THEN RAISE EXCEPTION 'Accounts Payable account not mapped'; END IF;

  v_label := 'Bill '||COALESCE(b.bill_number,'')||' — '||COALESCE(b.vendor_name, (SELECT name FROM public.suppliers WHERE id=b.supplier_id), '');

  INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status, created_by)
  VALUES (b.bill_date, v_label, 'expense_bill', b.id::text, b.venue, 'draft', v_uid)
  RETURNING id INTO e_id;

  FOR a IN
    SELECT * FROM public.expense_bill_allocations WHERE bill_id = b.id AND amount <> 0 ORDER BY line_no
  LOOP
    IF a.account_id IS NULL THEN
      DELETE FROM public.journal_entries WHERE id = e_id;
      RAISE EXCEPTION 'Allocation line % missing account', a.line_no;
    END IF;
    v_ln := v_ln + 1;
    IF a.amount > 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
      VALUES (e_id, a.account_id, a.amount, 0, COALESCE(a.venue,b.venue), v_ln, COALESCE(a.expense_category, a.notes, v_label));
    ELSE
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
      VALUES (e_id, a.account_id, 0, ABS(a.amount), COALESCE(a.venue,b.venue), v_ln, COALESCE(a.expense_category, a.notes, v_label));
    END IF;
  END LOOP;

  IF b.tax_amount <> 0 THEN
    SELECT account_id INTO acc_tax FROM public.account_mapping_rules WHERE rule_type='tax_input' LIMIT 1;
    IF acc_tax IS NOT NULL THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
      VALUES (e_id, acc_tax, b.tax_amount, 0, b.venue, v_ln, 'Input tax');
    END IF;
  END IF;

  v_ln := v_ln + 1;
  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
  VALUES (e_id, acc_ap, 0, b.total_amount, b.venue, v_ln, v_label);

  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO v_total_d, v_total_c
    FROM public.journal_lines WHERE entry_id = e_id;
  IF ROUND(v_total_d,2) <> ROUND(v_total_c,2) THEN
    DELETE FROM public.journal_entries WHERE id = e_id;
    RAISE EXCEPTION 'Bill not balanced: debits=% credits=%', v_total_d, v_total_c;
  END IF;

  UPDATE public.journal_entries SET status='posted', posted_at=now() WHERE id = e_id;
  UPDATE public.expense_bills
     SET journal_entry_id = e_id,
         approval_status = 'posted',
         posted_by = v_uid,
         posted_at = now()
   WHERE id = b.id;

  INSERT INTO public.expense_bill_audit (bill_id, event_type, actor_id, actor_name, details)
  VALUES (b.id, 'posted', v_uid, v_uname, jsonb_build_object('journal_entry_id', e_id, 'total', b.total_amount));

  RETURN jsonb_build_object('success', true, 'journal_entry_id', e_id);
END;
$$;

-- ============= PAY EXPENSE BILL RPC =============
CREATE OR REPLACE FUNCTION public.post_expense_bill_payment(p_payment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_uname TEXT;
  p RECORD;
  b RECORD;
  e_id UUID;
  acc_ap UUID;
  acc_bank UUID;
  v_total_paid NUMERIC;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized: admin role required';
  END IF;

  SELECT * INTO p FROM public.expense_bill_payments WHERE id = p_payment_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF p.journal_entry_id IS NOT NULL THEN
    RETURN jsonb_build_object('already_posted', true, 'journal_entry_id', p.journal_entry_id);
  END IF;
  SELECT * INTO b FROM public.expense_bills WHERE id = p.bill_id;

  SELECT display_name INTO v_uname FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  SELECT account_id INTO acc_ap FROM public.account_mapping_rules WHERE rule_type='accounts_payable' LIMIT 1;
  IF acc_ap IS NULL THEN RAISE EXCEPTION 'Accounts Payable account not mapped'; END IF;

  IF p.payment_method='cash' THEN
    SELECT account_id INTO acc_bank FROM public.account_mapping_rules WHERE rule_type='cash_payment_clearing' LIMIT 1;
  ELSIF p.bank_account_id IS NOT NULL THEN
    SELECT linked_gl_account_id INTO acc_bank FROM public.bank_accounts WHERE id = p.bank_account_id;
  ELSE
    SELECT account_id INTO acc_bank FROM public.account_mapping_rules WHERE rule_type='bank_payment_clearing' AND match_key='' LIMIT 1;
  END IF;
  IF acc_bank IS NULL THEN RAISE EXCEPTION 'No bank/cash account resolved for payment'; END IF;

  INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status, created_by)
  VALUES (p.payment_date, 'Payment for bill '||COALESCE(b.bill_number,''), 'expense_bill_payment', p.id::text, b.venue, 'draft', v_uid)
  RETURNING id INTO e_id;

  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
  VALUES (e_id, acc_ap, p.amount, 0, b.venue, 1, 'AP settle');
  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
  VALUES (e_id, acc_bank, 0, p.amount, b.venue, 2, p.payment_method);

  UPDATE public.journal_entries SET status='posted', posted_at=now() WHERE id = e_id;
  UPDATE public.expense_bill_payments SET journal_entry_id = e_id WHERE id = p.id;

  SELECT COALESCE(SUM(amount),0) INTO v_total_paid FROM public.expense_bill_payments WHERE bill_id = b.id;
  UPDATE public.expense_bills
     SET paid_amount = v_total_paid,
         payment_status = CASE WHEN v_total_paid >= total_amount THEN 'paid' WHEN v_total_paid > 0 THEN 'partial' ELSE 'unpaid' END
   WHERE id = b.id;

  INSERT INTO public.expense_bill_audit (bill_id, event_type, actor_id, actor_name, details)
  VALUES (b.id, 'payment_posted', v_uid, v_uname, jsonb_build_object('journal_entry_id', e_id, 'amount', p.amount));

  RETURN jsonb_build_object('success', true, 'journal_entry_id', e_id);
END;
$$;

-- ============= Add page permission key for new users =============
CREATE OR REPLACE FUNCTION public.handle_new_user_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_access_control (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_page_permissions (user_id, page_key)
  VALUES 
    (NEW.id, 'revenue'),
    (NEW.id, 'forecast'),
    (NEW.id, 'data'),
    (NEW.id, 'activity-log'),
    (NEW.id, 'pl-report'),
    (NEW.id, 'invoices'),
    (NEW.id, 'inventory'),
    (NEW.id, 'notifications'),
    (NEW.id, 'kpis'),
    (NEW.id, 'kpi-management'),
    (NEW.id, 'bills-expenses')
  ON CONFLICT (user_id, page_key) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Backfill existing users
INSERT INTO public.user_page_permissions (user_id, page_key)
SELECT u.id, 'bills-expenses' FROM auth.users u
ON CONFLICT (user_id, page_key) DO NOTHING;
