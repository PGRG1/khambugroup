
-- Backfill-capable generator: loop per rule, generate all periods up to today.
-- Also one-time reset: for active rules whose first bill has never been generated
-- (last_generated_at IS NULL), pin next_generation_date to the first recognition
-- date >= effective_from so historical periods can be created.

CREATE OR REPLACE FUNCTION public.generate_recurring_expense_bills()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_safety int;
BEGIN
  -- Reset first-generation pointer for rules that have never produced a bill
  UPDATE public.expense_recurring_rules er
     SET next_generation_date = public.compute_next_generation_date(
           er.effective_from, er.cadence, er.recognition_day, er.day_of_month, er.effective_from)
   WHERE er.status = 'active'
     AND er.effective_from IS NOT NULL
     AND er.last_generated_at IS NULL
     AND (
        er.next_generation_date IS NULL
        OR er.next_generation_date > public.compute_next_generation_date(
             er.effective_from, er.cadence, er.recognition_day, er.day_of_month, er.effective_from)
     );

  FOR r IN
    SELECT * FROM public.expense_recurring_rules
     WHERE status = 'active'
       AND next_generation_date IS NOT NULL
       AND next_generation_date <= CURRENT_DATE
  LOOP
    v_safety := 0;
    -- Loop within the rule to backfill all overdue periods
    WHILE r.next_generation_date IS NOT NULL
      AND r.next_generation_date <= CURRENT_DATE
      AND v_safety < 240
    LOOP
      v_safety := v_safety + 1;
      v_bill_date := r.next_generation_date;

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
          VALUES (v_bill_id, 'generated', NULL, jsonb_build_object('rule_id', r.id, 'rule_name', r.name, 'period_start', v_period_start));

        v_count := v_count + 1;

      EXCEPTION WHEN unique_violation THEN
        v_skipped := v_skipped + 1;
      END;

      v_next := public.compute_next_generation_date(
        r.effective_from, r.cadence, r.recognition_day, r.day_of_month,
        (v_bill_date + v_advance)::date);

      UPDATE public.expense_recurring_rules
         SET next_generation_date = v_next,
             last_generated_at = now()
       WHERE id = r.id;

      r.next_generation_date := v_next;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('created', v_count, 'skipped_duplicate', v_skipped);
END;
$function$;
