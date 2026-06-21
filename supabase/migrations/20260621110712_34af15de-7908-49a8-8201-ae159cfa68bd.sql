
-- 1. Recurring rule template fields
ALTER TABLE public.expense_recurring_rules
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS effective_from date,
  ADD COLUMN IF NOT EXISTS next_generation_date date,
  ADD COLUMN IF NOT EXISTS payment_due_day integer,
  ADD COLUMN IF NOT EXISTS credit_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_approve boolean NOT NULL DEFAULT false;

-- Backfill status from existing active boolean
UPDATE public.expense_recurring_rules
   SET status = CASE WHEN active THEN 'active' ELSE 'paused' END
 WHERE status = 'draft';

UPDATE public.expense_recurring_rules
   SET effective_from = COALESCE(effective_from, next_due_date, CURRENT_DATE);

-- 2. Expense bill source-tracking fields
ALTER TABLE public.expense_bills
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS recurring_rule_id uuid REFERENCES public.expense_recurring_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS document_requirement text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS combined_venues boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_bills_recurring_period
  ON public.expense_bills(recurring_rule_id, period_start)
  WHERE recurring_rule_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expense_bills_source
  ON public.expense_bills(source_type);

-- 3. Helper: compute the next generation date for a rule
CREATE OR REPLACE FUNCTION public.compute_next_generation_date(
  p_effective_from date,
  p_cadence text,
  p_recognition_day text,
  p_day_of_month integer,
  p_from date DEFAULT NULL
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_anchor date := COALESCE(p_from, p_effective_from);
  v_month_start date;
  v_candidate date;
  v_day int;
BEGIN
  IF p_effective_from IS NULL THEN RETURN NULL; END IF;

  v_month_start := date_trunc('month', v_anchor)::date;

  LOOP
    IF p_recognition_day = 'last' THEN
      v_candidate := (v_month_start + INTERVAL '1 month - 1 day')::date;
    ELSE
      v_day := COALESCE(NULLIF(p_recognition_day,'')::int, p_day_of_month, 1);
      v_day := LEAST(v_day, EXTRACT(DAY FROM (v_month_start + INTERVAL '1 month - 1 day'))::int);
      v_candidate := v_month_start + (v_day - 1);
    END IF;

    IF v_candidate >= COALESCE(p_from, p_effective_from) AND v_candidate >= p_effective_from THEN
      RETURN v_candidate;
    END IF;

    -- Advance by cadence
    IF p_cadence = 'weekly' THEN
      v_month_start := v_month_start + INTERVAL '7 days';
    ELSIF p_cadence = 'quarterly' THEN
      v_month_start := (v_month_start + INTERVAL '3 months')::date;
    ELSIF p_cadence = 'yearly' THEN
      v_month_start := (v_month_start + INTERVAL '1 year')::date;
    ELSE
      v_month_start := (v_month_start + INTERVAL '1 month')::date;
    END IF;
  END LOOP;
END;
$$;

-- Backfill next_generation_date
UPDATE public.expense_recurring_rules
   SET next_generation_date = public.compute_next_generation_date(
       effective_from, cadence, recognition_day, day_of_month, CURRENT_DATE)
 WHERE next_generation_date IS NULL AND effective_from IS NOT NULL;

-- 4. Generator routine
CREATE OR REPLACE FUNCTION public.generate_recurring_expense_bills()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_period_start date;
  v_period_end date;
  v_bill_date date;
  v_bill_id uuid;
  v_next date;
  v_advance interval;
  v_count int := 0;
  v_skipped int := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.expense_recurring_rules
     WHERE status = 'active'
       AND next_generation_date IS NOT NULL
       AND next_generation_date <= CURRENT_DATE
  LOOP
    v_bill_date := r.next_generation_date;

    -- Period bounds based on cadence
    IF r.cadence = 'weekly' THEN
      v_period_start := v_bill_date;
      v_period_end   := v_bill_date + INTERVAL '6 days';
      v_advance := INTERVAL '7 days';
    ELSIF r.cadence = 'quarterly' THEN
      v_period_start := date_trunc('month', v_bill_date)::date;
      v_period_end   := (v_period_start + INTERVAL '3 months - 1 day')::date;
      v_advance := INTERVAL '3 months';
    ELSIF r.cadence = 'yearly' THEN
      v_period_start := date_trunc('year', v_bill_date)::date;
      v_period_end   := (v_period_start + INTERVAL '1 year - 1 day')::date;
      v_advance := INTERVAL '1 year';
    ELSE
      v_period_start := date_trunc('month', v_bill_date)::date;
      v_period_end   := (v_period_start + INTERVAL '1 month - 1 day')::date;
      v_advance := INTERVAL '1 month';
    END IF;

    BEGIN
      INSERT INTO public.expense_bills (
        supplier_id, vendor_name, bill_number, bill_date, due_date,
        service_period_start, service_period_end, period_start, period_end,
        venue_id, venue, department, currency,
        subtotal, tax_amount, total_amount,
        approval_status, notes,
        source_type, recurring_rule_id, combined_venues, document_requirement
      ) VALUES (
        r.supplier_id, r.vendor_name, NULL, v_bill_date,
        CASE WHEN r.payment_due_day IS NOT NULL
             THEN (date_trunc('month', v_bill_date) +
                   (LEAST(r.payment_due_day,
                          EXTRACT(DAY FROM (date_trunc('month', v_bill_date) + INTERVAL '1 month - 1 day'))::int) - 1) * INTERVAL '1 day')::date
             ELSE NULL END,
        v_period_start, v_period_end, v_period_start, v_period_end,
        CASE WHEN r.combined_venues THEN NULL ELSE r.venue_id END,
        CASE WHEN r.combined_venues THEN NULL ELSE (SELECT name FROM public.venues WHERE id = r.venue_id) END,
        r.department, r.currency,
        r.expected_amount, 0, r.expected_amount,
        'pending_review',
        'Auto-generated from rule: ' || r.name ||
          CASE WHEN r.notes IS NOT NULL AND r.notes <> '' THEN E'\n' || r.notes ELSE '' END,
        'recurring_rule', r.id, r.combined_venues, 'not_required'
      )
      RETURNING id INTO v_bill_id;

      IF r.account_id IS NOT NULL THEN
        INSERT INTO public.expense_bill_allocations (
          bill_id, line_no, expense_category, account_id, venue, department, amount, tax_treatment, tax_amount, notes
        ) VALUES (
          v_bill_id, 1,
          (SELECT name FROM public.expense_categories WHERE id = r.category_id),
          r.account_id,
          CASE WHEN r.combined_venues THEN NULL ELSE (SELECT name FROM public.venues WHERE id = r.venue_id) END,
          r.department, r.expected_amount, 'none', 0, NULL
        );
      END IF;

      INSERT INTO public.expense_bill_audit (bill_id, event_type, actor_id, details)
        VALUES (v_bill_id, 'generated', NULL, jsonb_build_object('rule_id', r.id, 'rule_name', r.name));

      v_count := v_count + 1;

    EXCEPTION WHEN unique_violation THEN
      v_skipped := v_skipped + 1;
    END;

    -- Advance pointer
    v_next := public.compute_next_generation_date(
      r.effective_from, r.cadence, r.recognition_day, r.day_of_month,
      (v_bill_date + v_advance)::date);

    UPDATE public.expense_recurring_rules
       SET next_generation_date = v_next,
           last_generated_at = now()
     WHERE id = r.id;
  END LOOP;

  RETURN jsonb_build_object('created', v_count, 'skipped_duplicate', v_skipped);
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_recurring_expense_bills() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_next_generation_date(date, text, text, integer, date) TO authenticated, service_role;

-- 5. Trigger to keep next_generation_date in sync when rule changes
CREATE OR REPLACE FUNCTION public.tg_recompute_next_generation_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.effective_from IS NOT NULL THEN
    IF TG_OP = 'INSERT'
       OR NEW.effective_from   IS DISTINCT FROM OLD.effective_from
       OR NEW.cadence          IS DISTINCT FROM OLD.cadence
       OR NEW.recognition_day  IS DISTINCT FROM OLD.recognition_day
       OR NEW.day_of_month     IS DISTINCT FROM OLD.day_of_month THEN
      NEW.next_generation_date := public.compute_next_generation_date(
        NEW.effective_from, NEW.cadence, NEW.recognition_day, NEW.day_of_month,
        GREATEST(COALESCE(NEW.next_generation_date, NEW.effective_from), NEW.effective_from));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_expense_recurring_rules_next_gen ON public.expense_recurring_rules;
CREATE TRIGGER trg_expense_recurring_rules_next_gen
  BEFORE INSERT OR UPDATE ON public.expense_recurring_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_next_generation_date();

-- 6. Update post_expense_bill to honor rule.credit_account_id
CREATE OR REPLACE FUNCTION public.post_expense_bill(p_bill_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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

  -- Credit account: rule override → global AP mapping
  IF b.recurring_rule_id IS NOT NULL THEN
    SELECT credit_account_id INTO acc_ap
      FROM public.expense_recurring_rules WHERE id = b.recurring_rule_id;
  END IF;
  IF acc_ap IS NULL THEN
    SELECT account_id INTO acc_ap FROM public.account_mapping_rules WHERE rule_type='accounts_payable' LIMIT 1;
  END IF;
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

  -- AP credit
  v_ln := v_ln + 1;
  IF b.total_amount >= 0 THEN
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
    VALUES (e_id, acc_ap, 0, b.total_amount, b.venue, v_ln, v_label);
  ELSE
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
    VALUES (e_id, acc_ap, ABS(b.total_amount), 0, b.venue, v_ln, v_label);
  END IF;

  -- Balance check
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO v_total_d, v_total_c FROM public.journal_lines WHERE entry_id = e_id;
  IF ROUND(v_total_d,2) <> ROUND(v_total_c,2) THEN
    DELETE FROM public.journal_entries WHERE id = e_id;
    RAISE EXCEPTION 'Bill posting unbalanced: debit % vs credit %', v_total_d, v_total_c;
  END IF;

  UPDATE public.journal_entries SET status = 'posted', posted_at = now() WHERE id = e_id;
  UPDATE public.expense_bills
     SET journal_entry_id = e_id,
         approval_status = 'posted',
         posted_by = v_uid,
         posted_at = now()
   WHERE id = p_bill_id;

  INSERT INTO public.expense_bill_audit (bill_id, event_type, actor_id, actor_name, details)
    VALUES (p_bill_id, 'posted', v_uid, v_uname, jsonb_build_object('journal_entry_id', e_id));

  RETURN jsonb_build_object('journal_entry_id', e_id);
END;
$function$;
