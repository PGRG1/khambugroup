
-- 1. Audit table
CREATE TABLE IF NOT EXISTS public.ledger_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  user_id uuid,
  user_display_name text,
  payroll_id uuid,
  journal_entry_id uuid,
  venue text,
  employee_name text,
  period text,
  amount numeric,
  status text NOT NULL DEFAULT 'success',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_audit_log_created_at ON public.ledger_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_audit_log_event_type ON public.ledger_audit_log (event_type);
CREATE INDEX IF NOT EXISTS idx_ledger_audit_log_payroll_id ON public.ledger_audit_log (payroll_id);

ALTER TABLE public.ledger_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read ledger audit" ON public.ledger_audit_log;
CREATE POLICY "Authenticated can read ledger audit"
  ON public.ledger_audit_log FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated can insert own ledger audit" ON public.ledger_audit_log;
CREATE POLICY "Authenticated can insert own ledger audit"
  ON public.ledger_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- No UPDATE/DELETE policies = immutable

-- 2. Update rebuild function to log entries
CREATE OR REPLACE FUNCTION public.rebuild_journal_from_operations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  acc_sales uuid; acc_svc uuid; acc_disc uuid; acc_tips uuid;
  acc_cash uuid; acc_pm uuid; acc_suspense uuid;
  acc_ap uuid; acc_pay_cash uuid;
  acc_pr_sal_exp uuid; acc_pr_mpf_exp uuid;
  acc_pr_sal_pay uuid; acc_pr_mpf_pay uuid;
  e_id uuid; r record; cnt int := 0; v_ln int;
  v_method text; v_amt numeric;
  v_total_debits numeric; v_total_credits numeric; v_imbalance numeric;
  v_methods text[] := ARRAY['visa','mastercard','amex','union_pay','jcb','alipay','wechat','payme'];
  v_labels jsonb := '{"visa":"Visa","mastercard":"Mastercard","amex":"Amex","union_pay":"UnionPay","jcb":"JCB","alipay":"Alipay","wechat":"WeChat","payme":"PayMe"}'::jsonb;
  inv record; line record;
  v_inv_unmapped int;
  v_lines_sum numeric;
  v_ap_amount numeric;
  pr record;
  v_accrual_date date;
  v_gross numeric; v_net numeric; v_mpf_e numeric; v_mpf_r numeric; v_mpf_total numeric;
  v_emp_venue text;
  v_uid uuid := auth.uid();
  v_uname text;
  v_period text;
  MPF_RATE constant numeric := 0.05;
  MPF_CAP  constant numeric := 1500;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized: admin role required';
  END IF;

  SELECT display_name INTO v_uname FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  INSERT INTO public.ledger_audit_log (event_type, user_id, user_display_name, status, notes)
    VALUES ('ledger_rebuild_start', v_uid, v_uname, 'in_progress', 'Rebuilding journal from operations');

  DELETE FROM public.journal_entries WHERE source_type <> 'manual';
  SELECT id INTO acc_suspense FROM public.chart_of_accounts WHERE code='1900' LIMIT 1;
  SELECT id INTO acc_ap FROM public.chart_of_accounts WHERE code='2100' LIMIT 1;

  FOR r IN
    SELECT s.date::date AS d, s.venue,
           ROUND(COALESCE(SUM(s.subtotal),0)::numeric, 2) AS subtotal,
           ROUND(COALESCE(SUM(s.service_charge),0)::numeric, 2) AS svc,
           ROUND(COALESCE(SUM(s.discount),0)::numeric, 2) AS discount,
           ROUND(COALESCE(SUM(s.cash),0)::numeric, 2)       AS m_cash,
           ROUND(COALESCE(SUM(s.visa),0)::numeric, 2)       AS m_visa,
           ROUND(COALESCE(SUM(s.mastercard),0)::numeric, 2) AS m_mastercard,
           ROUND(COALESCE(SUM(s.amex),0)::numeric, 2)       AS m_amex,
           ROUND(COALESCE(SUM(s.union_pay),0)::numeric, 2)  AS m_unionpay,
           ROUND(COALESCE(SUM(s.jcb),0)::numeric, 2)        AS m_jcb,
           ROUND(COALESCE(SUM(s.alipay),0)::numeric, 2)     AS m_alipay,
           ROUND(COALESCE(SUM(s.wechat),0)::numeric, 2)     AS m_wechat,
           ROUND(COALESCE(SUM(s.payme),0)::numeric, 2)      AS m_payme,
           ROUND(COALESCE(SUM(s.card_tips),0)::numeric, 2)  AS tips
    FROM public.sales_records s
    GROUP BY s.date::date, s.venue
    HAVING COALESCE(SUM(s.subtotal),0) + COALESCE(SUM(s.service_charge),0) + COALESCE(SUM(s.discount),0) + COALESCE(SUM(s.card_tips),0) <> 0
  LOOP
    SELECT account_id INTO acc_sales FROM public.account_mapping_rules
      WHERE rule_type='sales_revenue' AND match_key=r.venue LIMIT 1;
    SELECT account_id INTO acc_svc FROM public.account_mapping_rules
      WHERE rule_type='service_charge' AND match_key=r.venue LIMIT 1;
    SELECT account_id INTO acc_disc FROM public.account_mapping_rules
      WHERE rule_type='sales_discount' AND match_key=r.venue LIMIT 1;
    SELECT account_id INTO acc_tips FROM public.account_mapping_rules
      WHERE rule_type='tips_payable' AND match_key=r.venue LIMIT 1;

    acc_cash := NULL;
    SELECT account_id INTO acc_cash FROM public.account_mapping_rules
      WHERE rule_type='sales_payment_method' AND match_key='cash__'||r.venue LIMIT 1;
    IF acc_cash IS NULL THEN
      SELECT account_id INTO acc_cash FROM public.account_mapping_rules
        WHERE rule_type='sales_payment_method' AND match_key='cash' LIMIT 1;
    END IF;
    IF acc_cash IS NULL THEN
      SELECT account_id INTO acc_cash FROM public.account_mapping_rules
        WHERE rule_type='sales_cash' AND match_key='' LIMIT 1;
    END IF;

    IF acc_sales IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status)
      VALUES (r.d, 'Sales — '||r.venue, 'sales', r.d::text||'|'||r.venue, r.venue, 'draft')
      RETURNING id INTO e_id;

    v_ln := 0;

    IF r.m_cash > 0 AND acc_cash IS NOT NULL THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
        VALUES (e_id, acc_cash, r.m_cash, 0, r.venue, v_ln, 'Cash');
    END IF;

    FOREACH v_method IN ARRAY v_methods LOOP
      v_amt := CASE v_method
                 WHEN 'visa'       THEN r.m_visa
                 WHEN 'mastercard' THEN r.m_mastercard
                 WHEN 'amex'       THEN r.m_amex
                 WHEN 'union_pay'  THEN r.m_unionpay
                 WHEN 'jcb'        THEN r.m_jcb
                 WHEN 'alipay'     THEN r.m_alipay
                 WHEN 'wechat'     THEN r.m_wechat
                 WHEN 'payme'      THEN r.m_payme
               END;
      IF v_amt > 0 THEN
        acc_pm := NULL;
        SELECT account_id INTO acc_pm FROM public.account_mapping_rules
          WHERE rule_type='sales_payment_method' AND match_key=v_method||'__'||r.venue LIMIT 1;
        IF acc_pm IS NULL THEN
          SELECT account_id INTO acc_pm FROM public.account_mapping_rules
            WHERE rule_type='sales_payment_method' AND match_key=v_method LIMIT 1;
        END IF;
        IF acc_pm IS NOT NULL THEN
          v_ln := v_ln + 1;
          INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
            VALUES (e_id, acc_pm, v_amt, 0, r.venue, v_ln, COALESCE(v_labels->>v_method, v_method));
        END IF;
      END IF;
    END LOOP;

    IF ABS(r.discount) > 0 AND acc_disc IS NOT NULL THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
        VALUES (e_id, acc_disc, ABS(r.discount), 0, r.venue, v_ln, 'Sales discount');
    END IF;

    IF r.subtotal > 0 THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no)
        VALUES (e_id, acc_sales, 0, r.subtotal, r.venue, v_ln);
    END IF;

    IF r.svc > 0 AND acc_svc IS NOT NULL THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no)
        VALUES (e_id, acc_svc, 0, r.svc, r.venue, v_ln);
    END IF;

    IF ABS(r.tips) > 0 AND acc_tips IS NOT NULL THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
        VALUES (e_id, acc_tips, 0, ABS(r.tips), r.venue, v_ln, 'Card tips owed to staff');
    END IF;

    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
      INTO v_total_debits, v_total_credits
      FROM public.journal_lines WHERE entry_id = e_id;
    v_imbalance := ROUND(v_total_debits - v_total_credits, 2);
    IF v_imbalance <> 0 AND acc_suspense IS NOT NULL THEN
      v_ln := v_ln + 1;
      IF v_imbalance > 0 THEN
        INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
          VALUES (e_id, acc_suspense, 0, v_imbalance, r.venue, v_ln, 'Reconciliation difference');
      ELSE
        INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
          VALUES (e_id, acc_suspense, -v_imbalance, 0, r.venue, v_ln, 'Reconciliation difference');
      END IF;
      UPDATE public.journal_entries
        SET memo = memo || ' (reconciliation Δ ' || to_char(v_imbalance, 'FM999,999,990.00') || ')'
        WHERE id = e_id;
    END IF;

    UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
    cnt := cnt + 1;
  END LOOP;

  IF acc_ap IS NOT NULL THEN
    FOR inv IN
      SELECT i.id, i.invoice_date, i.venue, i.invoice_number, i.supplier_id,
             ROUND(i.total_amount::numeric, 2) AS total_amount,
             COALESCE(s.name, '') AS supplier_name
      FROM public.invoices i
      LEFT JOIN public.suppliers s ON s.id = i.supplier_id
      WHERE i.status IN ('paid','unpaid')
    LOOP
      SELECT COUNT(*) INTO v_inv_unmapped
      FROM public.invoice_line_items li
      LEFT JOIN public.product_master pm ON pm.id = li.product_master_id
      LEFT JOIN public.account_mapping_rules amr
        ON amr.rule_type = 'procurement_category'
       AND amr.match_key = COALESCE(pm.financial_treatment,'') || '__' || COALESCE(pm.level1_category,'')
      WHERE li.invoice_id = inv.id
        AND (li.product_master_id IS NULL
             OR pm.financial_treatment = ''
             OR COALESCE(pm.default_coa_account_id, amr.account_id) IS NULL);
      IF v_inv_unmapped > 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status)
        VALUES (inv.invoice_date,
                'Invoice '||COALESCE(inv.invoice_number,'')||' — '||inv.supplier_name,
                'invoice', inv.id::text, inv.venue, 'draft')
        RETURNING id INTO e_id;

      v_ln := 0;
      v_lines_sum := 0;
      FOR line IN
        SELECT COALESCE(pm.default_coa_account_id, amr.account_id) AS acct,
               pm.level1_category AS l1,
               ROUND(SUM(li.total)::numeric, 2) AS amt
        FROM public.invoice_line_items li
        JOIN public.product_master pm ON pm.id = li.product_master_id
        LEFT JOIN public.account_mapping_rules amr
          ON amr.rule_type = 'procurement_category'
         AND amr.match_key = COALESCE(pm.financial_treatment,'') || '__' || COALESCE(pm.level1_category,'')
        WHERE li.invoice_id = inv.id
        GROUP BY COALESCE(pm.default_coa_account_id, amr.account_id), pm.level1_category
      LOOP
        v_ln := v_ln + 1;
        IF line.amt >= 0 THEN
          INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo, category_l1)
            VALUES (e_id, line.acct, line.amt, 0, inv.venue, v_ln, inv.supplier_name, line.l1);
          v_lines_sum := v_lines_sum + line.amt;
        ELSE
          INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo, category_l1)
            VALUES (e_id, line.acct, 0, -line.amt, inv.venue, v_ln, inv.supplier_name||' (refund/return)', line.l1);
          v_lines_sum := v_lines_sum + line.amt;
        END IF;
      END LOOP;

      v_ap_amount := ROUND(v_lines_sum, 2);
      v_ln := v_ln + 1;
      IF v_ap_amount >= 0 THEN
        INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
          VALUES (e_id, acc_ap, 0, v_ap_amount, inv.venue, v_ln, inv.supplier_name);
      ELSE
        INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
          VALUES (e_id, acc_ap, -v_ap_amount, 0, inv.venue, v_ln, inv.supplier_name||' (credit note)');
      END IF;

      SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
        INTO v_total_debits, v_total_credits
        FROM public.journal_lines WHERE entry_id = e_id;
      v_imbalance := ROUND(v_total_debits - v_total_credits, 2);
      IF v_imbalance <> 0 AND acc_suspense IS NOT NULL THEN
        v_ln := v_ln + 1;
        IF v_imbalance > 0 THEN
          INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
            VALUES (e_id, acc_suspense, 0, v_imbalance, inv.venue, v_ln, 'Rounding');
        ELSE
          INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
            VALUES (e_id, acc_suspense, -v_imbalance, 0, inv.venue, v_ln, 'Rounding');
        END IF;
      END IF;

      UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
      cnt := cnt + 1;
    END LOOP;

    FOR r IN
      SELECT p.id, p.payment_date, ROUND(p.amount::numeric,2) AS amount,
             p.payment_method, i.venue, i.invoice_number,
             COALESCE(s.name,'') AS supplier_name
      FROM public.invoice_payments p
      LEFT JOIN public.invoices i ON i.id = p.invoice_id
      LEFT JOIN public.suppliers s ON s.id = i.supplier_id
      WHERE p.amount <> 0
    LOOP
      acc_pay_cash := NULL;
      SELECT account_id INTO acc_pay_cash FROM public.account_mapping_rules
        WHERE rule_type='payment_method_cash' AND match_key = r.payment_method LIMIT 1;
      IF acc_pay_cash IS NULL THEN
        SELECT id INTO acc_pay_cash FROM public.chart_of_accounts WHERE is_cash = true ORDER BY code LIMIT 1;
      END IF;
      IF acc_pay_cash IS NULL THEN CONTINUE; END IF;

      INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status)
        VALUES (r.payment_date,
                'Payment for '||COALESCE(r.invoice_number,'')||' — '||r.supplier_name,
                'invoice_payment', r.id::text, r.venue, 'draft')
        RETURNING id INTO e_id;

      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
        VALUES (e_id, acc_ap, r.amount, 0, r.venue, 1, r.supplier_name);
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
        VALUES (e_id, acc_pay_cash, 0, r.amount, r.venue, 2, r.payment_method);

      UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
      cnt := cnt + 1;
    END LOOP;
  END IF;

  -- Payroll
  SELECT account_id INTO acc_pr_sal_pay FROM public.account_mapping_rules
    WHERE rule_type='salary_payable' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_pr_mpf_pay FROM public.account_mapping_rules
    WHERE rule_type='mpf_payable' AND match_key='' LIMIT 1;

  IF acc_pr_sal_pay IS NOT NULL AND acc_pr_mpf_pay IS NOT NULL THEN
    FOR pr IN
      SELECT p.id, p.year, p.month,
             p.gross_salary, p.net_salary, p.mpf_employee, p.mpf_employer,
             p.actual_total, p.actual_base_salary, p.actual_allowances,
             p.actual_overtime, p.actual_bonus, p.actual_deductions,
             p.forecast_total, p.forecast_base_salary,
             p.payment_status,
             p.net_salary_payment_date, p.mpf_payment_date,
             COALESCE(p.payment_method,'bank_transfer') AS payment_method,
             e.venue AS emp_venue,
             e.first_name||' '||e.last_name AS emp_name
      FROM public.hr_payroll p
      LEFT JOIN public.hr_employees e ON e.id = p.employee_id
    LOOP
      v_emp_venue := COALESCE(pr.emp_venue, '');
      v_period := to_char(make_date(pr.year, pr.month, 1),'YYYY-MM');

      v_gross := COALESCE(NULLIF(pr.gross_salary,0), NULLIF(pr.actual_total,0),
                          NULLIF(pr.forecast_total,0), NULLIF(pr.actual_base_salary,0),
                          NULLIF(pr.forecast_base_salary,0), 0);
      v_gross := ROUND(COALESCE(v_gross,0)::numeric, 2);

      IF v_gross <= 0 THEN
        INSERT INTO public.ledger_audit_log
          (event_type, user_id, user_display_name, payroll_id, venue, employee_name, period, amount, status, notes)
          VALUES ('payroll_skipped', v_uid, v_uname, pr.id, NULLIF(v_emp_venue,''), pr.emp_name, v_period, 0, 'skipped',
                  'No gross salary value found');
        CONTINUE;
      END IF;

      v_mpf_e := COALESCE(NULLIF(pr.mpf_employee,0), LEAST(MPF_CAP, v_gross * MPF_RATE));
      v_mpf_r := COALESCE(NULLIF(pr.mpf_employer,0), LEAST(MPF_CAP, v_gross * MPF_RATE));
      v_mpf_e := ROUND(COALESCE(v_mpf_e,0)::numeric, 2);
      v_mpf_r := ROUND(COALESCE(v_mpf_r,0)::numeric, 2);
      v_mpf_total := ROUND(v_mpf_e + v_mpf_r, 2);

      v_net := COALESCE(NULLIF(pr.net_salary,0), v_gross - v_mpf_e);
      v_net := ROUND(COALESCE(v_net,0)::numeric, 2);

      acc_pr_sal_exp := NULL;
      SELECT account_id INTO acc_pr_sal_exp FROM public.account_mapping_rules
        WHERE rule_type='payroll_salary_expense' AND match_key=v_emp_venue LIMIT 1;
      IF acc_pr_sal_exp IS NULL THEN
        SELECT account_id INTO acc_pr_sal_exp FROM public.account_mapping_rules
          WHERE rule_type='payroll_salary_expense' AND match_key='' LIMIT 1;
      END IF;

      acc_pr_mpf_exp := NULL;
      SELECT account_id INTO acc_pr_mpf_exp FROM public.account_mapping_rules
        WHERE rule_type='payroll_mpf_expense' AND match_key=v_emp_venue LIMIT 1;
      IF acc_pr_mpf_exp IS NULL THEN
        SELECT account_id INTO acc_pr_mpf_exp FROM public.account_mapping_rules
          WHERE rule_type='payroll_mpf_expense' AND match_key='' LIMIT 1;
      END IF;

      IF acc_pr_sal_exp IS NULL OR acc_pr_mpf_exp IS NULL THEN
        INSERT INTO public.ledger_audit_log
          (event_type, user_id, user_display_name, payroll_id, venue, employee_name, period, amount, status, notes)
          VALUES ('payroll_skipped', v_uid, v_uname, pr.id, NULLIF(v_emp_venue,''), pr.emp_name, v_period, v_gross, 'skipped',
                  'Missing payroll account mapping');
        CONTINUE;
      END IF;

      v_accrual_date := (make_date(pr.year, pr.month, 1) + INTERVAL '1 month - 1 day')::date;

      INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status)
        VALUES (v_accrual_date,
                'Payroll accrual '||v_period||' — '||pr.emp_name,
                'payroll_accrual', pr.id::text, NULLIF(v_emp_venue,''), 'draft')
        RETURNING id INTO e_id;

      v_ln := 0;
      IF v_gross > 0 THEN
        v_ln := v_ln + 1;
        INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
          VALUES (e_id, acc_pr_sal_exp, v_gross, 0, NULLIF(v_emp_venue,''), v_ln, 'Gross salary');
      END IF;
      IF v_mpf_r > 0 THEN
        v_ln := v_ln + 1;
        INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
          VALUES (e_id, acc_pr_mpf_exp, v_mpf_r, 0, NULLIF(v_emp_venue,''), v_ln, 'MPF employer contribution');
      END IF;
      IF v_net > 0 THEN
        v_ln := v_ln + 1;
        INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
          VALUES (e_id, acc_pr_sal_pay, 0, v_net, NULLIF(v_emp_venue,''), v_ln, 'Net salary owed');
      END IF;
      IF v_mpf_total > 0 THEN
        v_ln := v_ln + 1;
        INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
          VALUES (e_id, acc_pr_mpf_pay, 0, v_mpf_total, NULLIF(v_emp_venue,''), v_ln, 'MPF payable (ee + er)');
      END IF;

      SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
        INTO v_total_debits, v_total_credits
        FROM public.journal_lines WHERE entry_id = e_id;
      v_imbalance := ROUND(v_total_debits - v_total_credits, 2);
      IF v_imbalance <> 0 AND acc_suspense IS NOT NULL THEN
        v_ln := v_ln + 1;
        IF v_imbalance > 0 THEN
          INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
            VALUES (e_id, acc_suspense, 0, v_imbalance, NULLIF(v_emp_venue,''), v_ln, 'Other deductions / rounding');
        ELSE
          INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
            VALUES (e_id, acc_suspense, -v_imbalance, 0, NULLIF(v_emp_venue,''), v_ln, 'Other deductions / rounding');
        END IF;
      END IF;

      IF (SELECT COUNT(*) FROM public.journal_lines WHERE entry_id = e_id) < 2 THEN
        DELETE FROM public.journal_entries WHERE id = e_id;
        INSERT INTO public.ledger_audit_log
          (event_type, user_id, user_display_name, payroll_id, venue, employee_name, period, amount, status, notes)
          VALUES ('payroll_accrual', v_uid, v_uname, pr.id, NULLIF(v_emp_venue,''), pr.emp_name, v_period, v_gross, 'skipped',
                  'Insufficient lines to balance');
      ELSE
        UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
        cnt := cnt + 1;
        INSERT INTO public.ledger_audit_log
          (event_type, user_id, user_display_name, payroll_id, journal_entry_id, venue, employee_name, period, amount, status, notes)
          VALUES ('payroll_accrual', v_uid, v_uname, pr.id, e_id, NULLIF(v_emp_venue,''), pr.emp_name, v_period, v_gross, 'success',
                  'Gross '||v_gross||' / Net '||v_net||' / MPF '||v_mpf_total);
      END IF;

      IF v_net > 0 AND (pr.net_salary_payment_date IS NOT NULL OR pr.payment_status = 'paid') THEN
        acc_pay_cash := NULL;
        SELECT account_id INTO acc_pay_cash FROM public.account_mapping_rules
          WHERE rule_type='payment_method_cash' AND match_key = pr.payment_method LIMIT 1;
        IF acc_pay_cash IS NULL THEN
          SELECT id INTO acc_pay_cash FROM public.chart_of_accounts WHERE is_cash = true ORDER BY code LIMIT 1;
        END IF;
        IF acc_pay_cash IS NOT NULL THEN
          INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status)
            VALUES (COALESCE(pr.net_salary_payment_date, v_accrual_date),
                    'Payroll net pay '||v_period||' — '||pr.emp_name,
                    'payroll_net_payment', pr.id::text, NULLIF(v_emp_venue,''), 'draft')
            RETURNING id INTO e_id;
          INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
            VALUES (e_id, acc_pr_sal_pay, v_net, 0, NULLIF(v_emp_venue,''), 1, 'Clear salary payable');
          INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
            VALUES (e_id, acc_pay_cash, 0, v_net, NULLIF(v_emp_venue,''), 2, pr.payment_method);
          UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
          cnt := cnt + 1;
          INSERT INTO public.ledger_audit_log
            (event_type, user_id, user_display_name, payroll_id, journal_entry_id, venue, employee_name, period, amount, status, notes)
            VALUES ('payroll_net_payment', v_uid, v_uname, pr.id, e_id, NULLIF(v_emp_venue,''), pr.emp_name, v_period, v_net, 'success',
                    'Paid via '||pr.payment_method);
        END IF;
      END IF;

      IF v_mpf_total > 0 AND (pr.mpf_payment_date IS NOT NULL OR pr.payment_status = 'paid') THEN
        acc_pay_cash := NULL;
        SELECT account_id INTO acc_pay_cash FROM public.account_mapping_rules
          WHERE rule_type='payment_method_cash' AND match_key = pr.payment_method LIMIT 1;
        IF acc_pay_cash IS NULL THEN
          SELECT id INTO acc_pay_cash FROM public.chart_of_accounts WHERE is_cash = true ORDER BY code LIMIT 1;
        END IF;
        IF acc_pay_cash IS NOT NULL THEN
          INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status)
            VALUES (COALESCE(pr.mpf_payment_date, v_accrual_date),
                    'MPF remittance '||v_period||' — '||pr.emp_name,
                    'payroll_mpf_payment', pr.id::text, NULLIF(v_emp_venue,''), 'draft')
            RETURNING id INTO e_id;
          INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
            VALUES (e_id, acc_pr_mpf_pay, v_mpf_total, 0, NULLIF(v_emp_venue,''), 1, 'Clear MPF payable');
          INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
            VALUES (e_id, acc_pay_cash, 0, v_mpf_total, NULLIF(v_emp_venue,''), 2, 'MPF remittance');
          UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
          cnt := cnt + 1;
          INSERT INTO public.ledger_audit_log
            (event_type, user_id, user_display_name, payroll_id, journal_entry_id, venue, employee_name, period, amount, status, notes)
            VALUES ('payroll_mpf_payment', v_uid, v_uname, pr.id, e_id, NULLIF(v_emp_venue,''), pr.emp_name, v_period, v_mpf_total, 'success',
                    'MPF remitted (ee+er)');
        END IF;
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.ledger_audit_log (event_type, user_id, user_display_name, amount, status, notes)
    VALUES ('ledger_rebuild_finish', v_uid, v_uname, cnt, 'success',
            'Created '||cnt||' journal entries');

  RETURN jsonb_build_object('entries_created', cnt);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.rebuild_journal_from_operations() FROM PUBLIC, anon;
