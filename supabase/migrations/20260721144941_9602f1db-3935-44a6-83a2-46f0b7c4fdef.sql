
-- Extend journal source_type check for prepaid postings
ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_type_check
  CHECK (source_type = ANY (ARRAY['sales','sales_summary','invoice','invoice_payment','payroll_accrual','payroll_payment','mpf_payment','settlement_fee','settlement_clearing','bank_fee','bank_txn','manual','adjustment','opening','bank_transaction','expense_bill','petty_cash','petty_cash_replenishment','prepaid_deferral','prepaid_recognition']));

-- ============ prepaid_schedules ============
CREATE TABLE public.prepaid_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  source_bill_id uuid REFERENCES public.expense_bills(id) ON DELETE SET NULL,
  supplier_id uuid,
  supplier_account_id uuid,
  venue_id uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '',
  total_amount numeric NOT NULL CHECK (total_amount > 0),
  prepaid_account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  expense_account_id uuid NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  method text NOT NULL DEFAULT 'straight_line',
  start_period date NOT NULL,
  num_periods int NOT NULL CHECK (num_periods >= 1),
  amount_recognized numeric NOT NULL DEFAULT 0,
  amount_remaining numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  initial_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.prepaid_schedules (tenant_id, status);
CREATE INDEX ON public.prepaid_schedules (source_bill_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prepaid_schedules TO authenticated;
GRANT ALL ON public.prepaid_schedules TO service_role;
ALTER TABLE public.prepaid_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY prepaid_schedules_tenant_select ON public.prepaid_schedules
  FOR SELECT USING (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY prepaid_schedules_tenant_all ON public.prepaid_schedules
  FOR ALL USING ((is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id))
                 AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))
  WITH CHECK ((is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id))
              AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE TRIGGER trg_prepaid_schedules_updated
  BEFORE UPDATE ON public.prepaid_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ prepaid_schedule_lines ============
CREATE TABLE public.prepaid_schedule_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.prepaid_schedules(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  period date NOT NULL,
  planned_amount numeric NOT NULL CHECK (planned_amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','posted','reversed')),
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, period)
);
CREATE INDEX ON public.prepaid_schedule_lines (tenant_id, status, period);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prepaid_schedule_lines TO authenticated;
GRANT ALL ON public.prepaid_schedule_lines TO service_role;
ALTER TABLE public.prepaid_schedule_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY prepaid_schedule_lines_tenant_select ON public.prepaid_schedule_lines
  FOR SELECT USING (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY prepaid_schedule_lines_tenant_all ON public.prepaid_schedule_lines
  FOR ALL USING ((is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id))
                 AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)))
  WITH CHECK ((is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id))
              AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role)));

CREATE TRIGGER trg_prepaid_schedule_lines_updated
  BEFORE UPDATE ON public.prepaid_schedule_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ RPC: create_prepaid_schedule ============
CREATE OR REPLACE FUNCTION public.create_prepaid_schedule(
  p_tenant_id uuid,
  p_source_bill_id uuid,
  p_supplier_id uuid,
  p_supplier_account_id uuid,
  p_venue_id uuid,
  p_description text,
  p_total_amount numeric,
  p_prepaid_account_id uuid,
  p_expense_account_id uuid,
  p_start_period date,
  p_num_periods int,
  p_method text DEFAULT 'straight_line'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_schedule_id uuid;
  v_je_id uuid;
  v_start date := date_trunc('month', p_start_period)::date;
  v_per_line numeric;
  v_remainder numeric;
  v_sum_check numeric := 0;
  v_planned numeric;
  v_line_amt numeric;
  v_venue_txt text;
  i int;
  v_period date;
  v_actor uuid := auth.uid();
  v_already_expensed boolean := false;
  v_reclassify boolean := false;
  v_credit_account uuid;
  v_source_type text;
  v_source_id text;
  v_memo text;
BEGIN
  IF p_num_periods < 1 THEN RAISE EXCEPTION 'num_periods must be >= 1'; END IF;
  IF p_total_amount <= 0 THEN RAISE EXCEPTION 'total_amount must be > 0'; END IF;

  SELECT name INTO v_venue_txt FROM public.venues WHERE id = p_venue_id;

  -- Compute straight-line split with remainder on LAST line
  v_per_line := round(p_total_amount / p_num_periods, 2);
  v_remainder := p_total_amount - (v_per_line * p_num_periods);

  -- Detect reclassify case: source bill already posted and hit expense account
  IF p_source_bill_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.journal_lines jl
      JOIN public.journal_entries je ON je.id = jl.entry_id
      WHERE je.source_type = 'expense_bill'
        AND je.source_id = p_source_bill_id::text
        AND je.status = 'posted'
        AND jl.account_id = p_expense_account_id
        AND jl.debit > 0
    ) INTO v_already_expensed;
    v_reclassify := v_already_expensed;
  END IF;

  IF v_reclassify THEN
    -- Path B: RECLASSIFY — Dr Prepaid / Cr Expense (move already-booked expense into deferral)
    v_credit_account := p_expense_account_id;
    v_source_type := 'prepaid_deferral';
    v_source_id := gen_random_uuid()::text;
    v_memo := 'Reclassify to prepaid: ' || COALESCE(p_description, '');
  ELSE
    -- Path A: initial deferral — Dr Prepaid / Cr AP
    SELECT id INTO v_credit_account FROM public.chart_of_accounts
      WHERE tenant_id = p_tenant_id AND (code = '2010' OR code = '2000' OR lower(name) LIKE '%accounts payable%')
      ORDER BY code LIMIT 1;
    IF v_credit_account IS NULL THEN
      RAISE EXCEPTION 'Accounts Payable account not found for tenant %', p_tenant_id;
    END IF;
    v_source_type := 'prepaid_deferral';
    v_source_id := gen_random_uuid()::text;
    v_memo := 'Prepaid deferral: ' || COALESCE(p_description, '');
  END IF;

  INSERT INTO public.journal_entries (tenant_id, entry_date, memo, source_type, source_id, venue, venue_id, status, posted_at, created_by)
  VALUES (p_tenant_id, v_start, v_memo, v_source_type, v_source_id, v_venue_txt, p_venue_id, 'posted', now(), v_actor)
  RETURNING id INTO v_je_id;

  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, venue_id, memo, line_no, tenant_id) VALUES
    (v_je_id, p_prepaid_account_id, p_total_amount, 0, v_venue_txt, p_venue_id, v_memo, 1, p_tenant_id),
    (v_je_id, v_credit_account,     0, p_total_amount, v_venue_txt, p_venue_id, v_memo, 2, p_tenant_id);

  -- Insert schedule
  INSERT INTO public.prepaid_schedules (
    tenant_id, source_bill_id, supplier_id, supplier_account_id, venue_id, description,
    total_amount, prepaid_account_id, expense_account_id, method, start_period, num_periods,
    amount_recognized, amount_remaining, status, initial_journal_entry_id
  ) VALUES (
    p_tenant_id, p_source_bill_id, p_supplier_id, p_supplier_account_id, p_venue_id, COALESCE(p_description,''),
    p_total_amount, p_prepaid_account_id, p_expense_account_id, COALESCE(p_method,'straight_line'), v_start, p_num_periods,
    0, p_total_amount, 'active', v_je_id
  ) RETURNING id INTO v_schedule_id;

  -- Generate lines
  FOR i IN 1..p_num_periods LOOP
    v_period := (v_start + ((i - 1) || ' months')::interval)::date;
    IF i = p_num_periods THEN
      v_line_amt := v_per_line + v_remainder;
    ELSE
      v_line_amt := v_per_line;
    END IF;
    v_sum_check := v_sum_check + v_line_amt;
    INSERT INTO public.prepaid_schedule_lines (schedule_id, tenant_id, period, planned_amount)
    VALUES (v_schedule_id, p_tenant_id, v_period, v_line_amt);
  END LOOP;

  -- Guardrail: lines must sum EXACTLY to total_amount
  IF round(v_sum_check, 2) <> round(p_total_amount, 2) THEN
    RAISE EXCEPTION 'Prepaid line sum (%) does not equal total (%)', v_sum_check, p_total_amount;
  END IF;

  RETURN v_schedule_id;
END;
$$;

-- ============ RPC: post_prepaid_line ============
CREATE OR REPLACE FUNCTION public.post_prepaid_line(p_line_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_line public.prepaid_schedule_lines%ROWTYPE;
  v_sched public.prepaid_schedules%ROWTYPE;
  v_je_id uuid;
  v_venue_txt text;
  v_period_end date;
  v_actor uuid := auth.uid();
  v_new_recognized numeric;
  v_new_remaining numeric;
  v_memo text;
BEGIN
  SELECT * INTO v_line FROM public.prepaid_schedule_lines WHERE id = p_line_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Line % not found', p_line_id; END IF;

  IF v_line.status = 'posted' THEN
    RETURN v_line.journal_entry_id;
  END IF;

  SELECT * INTO v_sched FROM public.prepaid_schedules WHERE id = v_line.schedule_id FOR UPDATE;
  IF v_sched.status <> 'active' THEN
    RAISE EXCEPTION 'Schedule % is not active (status=%)', v_sched.id, v_sched.status;
  END IF;

  SELECT name INTO v_venue_txt FROM public.venues WHERE id = v_sched.venue_id;
  v_period_end := (date_trunc('month', v_line.period) + interval '1 month - 1 day')::date;
  v_memo := 'Prepaid recognition: ' || COALESCE(v_sched.description,'') || ' (' || to_char(v_line.period,'Mon YYYY') || ')';

  INSERT INTO public.journal_entries (tenant_id, entry_date, memo, source_type, source_id, venue, venue_id, status, posted_at, created_by)
  VALUES (v_sched.tenant_id, v_period_end, v_memo, 'prepaid_recognition', p_line_id::text, v_venue_txt, v_sched.venue_id, 'posted', now(), v_actor)
  RETURNING id INTO v_je_id;

  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, venue_id, memo, line_no, tenant_id) VALUES
    (v_je_id, v_sched.expense_account_id, v_line.planned_amount, 0, v_venue_txt, v_sched.venue_id, v_memo, 1, v_sched.tenant_id),
    (v_je_id, v_sched.prepaid_account_id, 0, v_line.planned_amount, v_venue_txt, v_sched.venue_id, v_memo, 2, v_sched.tenant_id);

  UPDATE public.prepaid_schedule_lines
    SET status = 'posted', journal_entry_id = v_je_id, posted_at = now()
    WHERE id = p_line_id;

  v_new_recognized := v_sched.amount_recognized + v_line.planned_amount;
  v_new_remaining := v_sched.amount_remaining - v_line.planned_amount;

  UPDATE public.prepaid_schedules
    SET amount_recognized = v_new_recognized,
        amount_remaining = v_new_remaining,
        status = CASE WHEN round(v_new_remaining, 2) <= 0 THEN 'completed' ELSE status END
    WHERE id = v_sched.id;

  RETURN v_je_id;
END;
$$;

-- ============ RPC: run_prepaid_recognition ============
CREATE OR REPLACE FUNCTION public.run_prepaid_recognition(p_as_of date DEFAULT current_date)
RETURNS TABLE(line_id uuid, journal_entry_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
  v_je uuid;
BEGIN
  FOR r IN
    SELECT l.id
    FROM public.prepaid_schedule_lines l
    JOIN public.prepaid_schedules s ON s.id = l.schedule_id
    WHERE l.status = 'pending'
      AND s.status = 'active'
      AND l.period <= p_as_of
    ORDER BY l.period, l.id
  LOOP
    v_je := public.post_prepaid_line(r.id);
    line_id := r.id;
    journal_entry_id := v_je;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;
