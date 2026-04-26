CREATE OR REPLACE FUNCTION public.rebuild_journal_from_operations()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  acc_sales_default uuid;
  acc_service uuid;
  acc_sales_cash uuid;
  acc_ap uuid;
  acc_invoice_default uuid;
  acc_salary_exp uuid;
  acc_mpf_exp uuid;
  acc_salary_pay uuid;
  acc_mpf_pay uuid;
  acc_opening_eq uuid;
  acc_cash_default uuid;
  acc_kpay_fallback uuid;
  acc_discount uuid;
  acc_pm uuid;
  acc_svc_v uuid;
  acc_disc_v uuid;
  e_id uuid;
  r record;
  cnt int := 0;
  v_opening_balance numeric;
  v_opening_date date;
  v_total numeric;
  v_svc numeric;
  v_gross_rev numeric;
  v_discount_abs numeric;
  v_lines_total numeric;
  v_diff numeric;
  v_cash numeric;
  v_card_total numeric;
  v_ln int;
  v_method text;
  v_amt numeric;
  v_methods text[] := ARRAY['visa','mastercard','amex','union_pay','jcb','alipay','wechat','payme'];
  v_labels jsonb := '{"visa":"Visa","mastercard":"Mastercard","amex":"Amex","union_pay":"UnionPay","jcb":"JCB","alipay":"Alipay","wechat":"WeChat","payme":"PayMe"}'::jsonb;
BEGIN
  DELETE FROM public.journal_entries WHERE source_type <> 'manual';

  SELECT account_id INTO acc_service FROM public.account_mapping_rules WHERE rule_type='service_charge' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_sales_cash FROM public.account_mapping_rules WHERE rule_type='sales_cash' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_ap FROM public.account_mapping_rules WHERE rule_type='accounts_payable' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_invoice_default FROM public.account_mapping_rules WHERE rule_type='invoice_expense' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_salary_exp FROM public.account_mapping_rules WHERE rule_type='payroll_salary_expense' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_mpf_exp FROM public.account_mapping_rules WHERE rule_type='payroll_mpf_expense' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_salary_pay FROM public.account_mapping_rules WHERE rule_type='salary_payable' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_mpf_pay FROM public.account_mapping_rules WHERE rule_type='mpf_payable' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_opening_eq FROM public.account_mapping_rules WHERE rule_type='opening_equity' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_cash_default FROM public.account_mapping_rules WHERE rule_type='payment_method_cash' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_discount FROM public.account_mapping_rules WHERE rule_type='sales_discount' AND match_key='' LIMIT 1;
  IF acc_cash_default IS NULL THEN acc_cash_default := acc_sales_cash; END IF;
  SELECT account_id INTO acc_kpay_fallback FROM public.account_mapping_rules
    WHERE rule_type='sales_payment_method' AND match_key <> 'cash' LIMIT 1;

  SELECT cs.opening_balance, cs.opening_date INTO v_opening_balance, v_opening_date
    FROM public.cashflow_settings cs ORDER BY cs.updated_at DESC LIMIT 1;
  IF v_opening_balance IS NOT NULL AND v_opening_balance <> 0 AND acc_opening_eq IS NOT NULL AND acc_sales_cash IS NOT NULL THEN
    INSERT INTO public.journal_entries (entry_date, memo, source_type, status)
      VALUES (COALESCE(v_opening_date, CURRENT_DATE), 'Opening cash balance', 'opening', 'draft')
      RETURNING id INTO e_id;
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no)
      VALUES (e_id, acc_sales_cash, ROUND(v_opening_balance,2), 0, 1),
             (e_id, acc_opening_eq, 0, ROUND(v_opening_balance,2), 2);
    UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
    cnt := cnt + 1;
  END IF;

  FOR r IN
    SELECT s.date::date AS d, s.venue,
           ROUND(COALESCE(SUM(s.subtotal),0)::numeric, 2) AS subtotal,
           ROUND(COALESCE(SUM(s.service_charge),0)::numeric, 2) AS svc,
           ROUND(COALESCE(SUM(s.discount),0)::numeric, 2) AS discount,
           ROUND(COALESCE(SUM(s.total_sales),0)::numeric, 2) AS total,
           ROUND(COALESCE(SUM(s.cash),0)::numeric, 2)       AS m_cash,
           ROUND(COALESCE(SUM(s.visa),0)::numeric, 2)       AS m_visa,
           ROUND(COALESCE(SUM(s.mastercard),0)::numeric, 2) AS m_mastercard,
           ROUND(COALESCE(SUM(s.amex),0)::numeric, 2)       AS m_amex,
           ROUND(COALESCE(SUM(s.union_pay),0)::numeric, 2)  AS m_unionpay,
           ROUND(COALESCE(SUM(s.jcb),0)::numeric, 2)        AS m_jcb,
           ROUND(COALESCE(SUM(s.alipay),0)::numeric, 2)     AS m_alipay,
           ROUND(COALESCE(SUM(s.wechat),0)::numeric, 2)     AS m_wechat,
           ROUND(COALESCE(SUM(s.payme),0)::numeric, 2)      AS m_payme
    FROM public.sales_records s
    GROUP BY s.date::date, s.venue
    HAVING COALESCE(SUM(s.total_sales),0) > 0
  LOOP
    SELECT account_id INTO acc_sales_default FROM public.account_mapping_rules
      WHERE rule_type='sales_revenue' AND match_key=r.venue LIMIT 1;
    IF acc_sales_default IS NULL OR acc_sales_cash IS NULL THEN CONTINUE; END IF;

    -- Per-venue service charge & discount lookups (fallback to global)
    SELECT account_id INTO acc_svc_v FROM public.account_mapping_rules
      WHERE rule_type='service_charge' AND match_key=r.venue LIMIT 1;
    IF acc_svc_v IS NULL THEN acc_svc_v := acc_service; END IF;

    SELECT account_id INTO acc_disc_v FROM public.account_mapping_rules
      WHERE rule_type='sales_discount' AND match_key=r.venue LIMIT 1;
    IF acc_disc_v IS NULL THEN acc_disc_v := acc_discount; END IF;

    v_total := r.total;
    v_svc := LEAST(r.svc, v_total);
    v_discount_abs := ABS(r.discount);
    v_gross_rev := r.subtotal;
    v_cash := r.m_cash;
    v_card_total := r.m_visa + r.m_mastercard + r.m_amex + r.m_unionpay + r.m_jcb + r.m_alipay + r.m_wechat + r.m_payme;

    INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status)
      VALUES (r.d, 'Sales — '||r.venue, 'sales', r.d::text||'|'||r.venue, r.venue, 'draft')
      RETURNING id INTO e_id;

    v_ln := 0;

    IF v_cash > 0 THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
        VALUES (e_id, acc_sales_cash, v_cash, 0, r.venue, v_ln, 'Cash');
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
        SELECT account_id INTO acc_pm FROM public.account_mapping_rules
          WHERE rule_type='sales_payment_method' AND match_key=v_method LIMIT 1;
        IF acc_pm IS NULL THEN acc_pm := acc_kpay_fallback; END IF;
        IF acc_pm IS NOT NULL THEN
          v_ln := v_ln + 1;
          INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
            VALUES (e_id, acc_pm, v_amt, 0, r.venue, v_ln,
                    COALESCE(v_labels->>v_method, v_method) || ' ' || to_char(v_amt, 'FM999,999,999.00'));
        END IF;
      END IF;
    END LOOP;

    v_diff := v_total - (v_cash + v_card_total);
    IF v_diff > 0 THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
        VALUES (e_id, acc_sales_cash, v_diff, 0, r.venue, v_ln, 'Unallocated');
    ELSIF v_diff < 0 THEN
      UPDATE public.journal_lines SET debit = debit + v_diff
        WHERE id = (SELECT id FROM public.journal_lines WHERE entry_id = e_id ORDER BY line_no DESC LIMIT 1);
    END IF;

    IF v_discount_abs > 0 AND acc_disc_v IS NOT NULL THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
        VALUES (e_id, acc_disc_v, v_discount_abs, 0, r.venue, v_ln, 'Sales discount');
    END IF;

    v_ln := v_ln + 1;
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no)
      VALUES (e_id, acc_sales_default, 0, v_gross_rev, r.venue, v_ln);

    IF v_svc > 0 AND acc_svc_v IS NOT NULL THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no)
        VALUES (e_id, acc_svc_v, 0, v_svc, r.venue, v_ln);
    END IF;

    UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
    cnt := cnt + 1;
  END LOOP;

  -- Invoices (unchanged)
  FOR r IN
    SELECT i.id, i.invoice_date, i.venue, i.invoice_number, ROUND(i.total_amount::numeric,2) AS total_amount
    FROM public.invoices i
    WHERE COALESCE(i.total_amount,0) > 0
  LOOP
    INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status)
      VALUES (r.invoice_date, 'Invoice '||COALESCE(r.invoice_number,''), 'invoice', r.id::text, r.venue, 'draft')
      RETURNING id INTO e_id;
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no)
    SELECT e_id, grouped.acct, grouped.amt, 0, r.venue,
           ROW_NUMBER() OVER (ORDER BY grouped.acct)
    FROM (
      SELECT COALESCE(am.account_id, acc_invoice_default) AS acct, ROUND(SUM(li.total)::numeric,2) AS amt
      FROM public.invoice_line_items li
      LEFT JOIN public.product_master pm ON pm.id = li.product_master_id
      LEFT JOIN public.account_mapping_rules am ON am.rule_type='invoice_expense' AND am.match_key = COALESCE(pm.accounting_category,'')
      WHERE li.invoice_id = r.id
      GROUP BY COALESCE(am.account_id, acc_invoice_default)
    ) grouped
    WHERE grouped.acct IS NOT NULL AND grouped.amt > 0;

    SELECT COALESCE(SUM(debit),0) INTO v_lines_total FROM public.journal_lines WHERE entry_id = e_id;
    IF v_lines_total = 0 THEN
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no)
        VALUES (e_id, acc_invoice_default, r.total_amount, 0, r.venue, 1);
      v_lines_total := r.total_amount;
    END IF;
    v_diff := r.total_amount - v_lines_total;
    IF v_diff <> 0 THEN
      UPDATE public.journal_lines SET debit = debit + v_diff
        WHERE id = (SELECT id FROM public.journal_lines WHERE entry_id = e_id ORDER BY line_no DESC LIMIT 1);
    END IF;

    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no)
      VALUES (e_id, acc_ap, 0, r.total_amount, r.venue, 99);
    UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
    cnt := cnt + 1;
  END LOOP;

  -- Invoice payments (unchanged)
  FOR r IN
    SELECT p.id, p.payment_date, ROUND(p.amount::numeric,2) AS amount, p.payment_method, i.venue, i.invoice_number
    FROM public.invoice_payments p
    LEFT JOIN public.invoices i ON i.id = p.invoice_id
    WHERE COALESCE(p.amount,0) > 0
  LOOP
    SELECT account_id INTO acc_cash_default FROM public.account_mapping_rules
      WHERE rule_type='payment_method_cash' AND match_key = COALESCE(r.payment_method,'') LIMIT 1;
    IF acc_cash_default IS NULL THEN
      SELECT account_id INTO acc_cash_default FROM public.account_mapping_rules
        WHERE rule_type='payment_method_cash' AND match_key='' LIMIT 1;
    END IF;
    IF acc_cash_default IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status)
      VALUES (r.payment_date, 'Payment for '||COALESCE(r.invoice_number,''), 'invoice_payment', r.id::text, r.venue, 'draft')
      RETURNING id INTO e_id;
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no)
      VALUES (e_id, acc_ap, r.amount, 0, r.venue, 1),
             (e_id, acc_cash_default, 0, r.amount, r.venue, 2);
    UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
    cnt := cnt + 1;
  END LOOP;

  -- Payroll (unchanged)
  FOR r IN
    SELECT id, year, month,
           ROUND(COALESCE(net_salary,0)::numeric,2) AS ns,
           ROUND(COALESCE(mpf_employee,0)::numeric,2) AS mpfee,
           ROUND(COALESCE(mpf_employer,0)::numeric,2) AS mpfer,
           ROUND(COALESCE(gross_salary, COALESCE(net_salary,0)+COALESCE(mpf_employee,0))::numeric,2) AS gross,
           net_salary_payment_date, mpf_payment_date,
           ROUND(COALESCE(mpf_payment_amount,0)::numeric,2) AS mpf_payment_amount,
           payment_method
    FROM public.hr_payroll
    WHERE year IS NOT NULL AND month IS NOT NULL
  LOOP
    IF (r.gross + r.mpfer) > 0 AND acc_salary_exp IS NOT NULL AND acc_salary_pay IS NOT NULL AND acc_mpf_pay IS NOT NULL THEN
      INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, status)
        VALUES (make_date(r.year, r.month, 1) + interval '1 month' - interval '1 day', 'Payroll accrual '||r.year||'-'||lpad(r.month::text,2,'0'), 'payroll_accrual', r.id::text, 'draft')
        RETURNING id INTO e_id;
      IF r.gross > 0 THEN
        INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no)
          VALUES (e_id, acc_salary_exp, r.gross, 0, 1);
      END IF;
      IF r.mpfer > 0 AND acc_mpf_exp IS NOT NULL THEN
        INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no)
          VALUES (e_id, acc_mpf_exp, r.mpfer, 0, 2);
      END IF;
      IF r.ns > 0 THEN
        INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no)
          VALUES (e_id, acc_salary_pay, 0, r.ns, 3);
      END IF;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no)
        VALUES (e_id, acc_mpf_pay, 0, GREATEST((r.gross + r.mpfer) - r.ns, 0), 4);
      UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
      cnt := cnt + 1;
    END IF;

    IF r.net_salary_payment_date IS NOT NULL AND r.ns > 0 AND acc_salary_pay IS NOT NULL THEN
      SELECT account_id INTO acc_cash_default FROM public.account_mapping_rules
        WHERE rule_type='payment_method_cash' AND match_key = COALESCE(r.payment_method,'bank_transfer') LIMIT 1;
      IF acc_cash_default IS NULL THEN
        SELECT account_id INTO acc_cash_default FROM public.account_mapping_rules
          WHERE rule_type='payment_method_cash' AND match_key='' LIMIT 1;
      END IF;
      IF acc_cash_default IS NOT NULL THEN
        INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, status)
          VALUES (r.net_salary_payment_date, 'Net salary paid '||r.year||'-'||lpad(r.month::text,2,'0'), 'payroll_payment', r.id::text, 'draft')
          RETURNING id INTO e_id;
        INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no)
          VALUES (e_id, acc_salary_pay, r.ns, 0, 1),
                 (e_id, acc_cash_default, 0, r.ns, 2);
        UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
        cnt := cnt + 1;
      END IF;
    END IF;

    IF r.mpf_payment_date IS NOT NULL AND r.mpf_payment_amount > 0 AND acc_mpf_pay IS NOT NULL THEN
      SELECT account_id INTO acc_cash_default FROM public.account_mapping_rules
        WHERE rule_type='payment_method_cash' AND match_key='' LIMIT 1;
      IF acc_cash_default IS NOT NULL THEN
        INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, status)
          VALUES (r.mpf_payment_date, 'MPF paid '||r.year||'-'||lpad(r.month::text,2,'0'), 'mpf_payment', r.id::text, 'draft')
          RETURNING id INTO e_id;
        INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no)
          VALUES (e_id, acc_mpf_pay, r.mpf_payment_amount, 0, 1),
                 (e_id, acc_cash_default, 0, r.mpf_payment_amount, 2);
        UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
        cnt := cnt + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('entries_created', cnt);
END;
$function$;