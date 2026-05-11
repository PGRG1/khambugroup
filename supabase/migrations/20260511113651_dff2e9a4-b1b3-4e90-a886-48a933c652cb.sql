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
  acc_proc_fee_default uuid; acc_bank_fee_default uuid;
  acc_fee uuid; acc_bank uuid;
  acc_bank_charge_default uuid;
  e_id uuid; r record; cnt int := 0; v_ln int;
  v_method text; v_amt numeric;
  v_total_debits numeric; v_total_credits numeric; v_imbalance numeric;
  v_methods text[] := ARRAY['visa','mastercard','amex','union_pay','jcb','alipay','wechat','payme'];
  v_labels jsonb := '{"visa":"Visa","mastercard":"Mastercard","amex":"Amex","union_pay":"UnionPay","jcb":"JCB","alipay":"Alipay","wechat":"WeChat","payme":"PayMe"}'::jsonb;
  inv record; line record;
  v_inv_unmapped int;
  v_lines_sum numeric;
  v_ap_amount numeric;
  pr record; sb record; bf record; sl record;
  v_accrual_date date;
  v_gross numeric; v_net numeric; v_mpf_e numeric; v_mpf_r numeric; v_mpf_total numeric;
  v_proc_fee numeric; v_xfer_fee numeric;
  v_emp_venue text;
  v_uid uuid := auth.uid();
  v_uname text;
  v_period text;
  v_fee_amt numeric;
  v_bank_amt numeric;
  v_pm_key text;
  acc_bank_charge uuid;
  MPF_RATE constant numeric := 0.05;
  MPF_CAP  constant numeric := 1500;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized: admin role required';
  END IF;

  SELECT display_name INTO v_uname FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  INSERT INTO public.ledger_audit_log (event_type, user_id, user_display_name, status, notes)
    VALUES ('ledger_rebuild_start', v_uid, v_uname, 'in_progress', 'Rebuilding journal from operations');

  UPDATE public.payment_settlement_batches b
     SET clearing_journal_entry_id = NULL
   WHERE b.clearing_journal_entry_id IN (
     SELECT id FROM public.journal_entries
     WHERE source_type = 'settlement_clearing' AND manually_adjusted = false
   );

  DELETE FROM public.journal_entries WHERE source_type <> 'manual' AND manually_adjusted = false;

  SELECT id INTO acc_suspense FROM public.chart_of_accounts WHERE code='1900' LIMIT 1;
  SELECT id INTO acc_ap FROM public.chart_of_accounts WHERE code='2100' LIMIT 1;
  SELECT id INTO acc_proc_fee_default FROM public.chart_of_accounts WHERE code='6810' LIMIT 1;
  SELECT id INTO acc_bank_fee_default FROM public.chart_of_accounts WHERE code='6820' LIMIT 1;
  SELECT id INTO acc_bank_charge_default FROM public.chart_of_accounts WHERE code='7110' LIMIT 1;

  -- ===== SALES =====
  FOR r IN
    SELECT s.date::date AS d, s.venue,
           ROUND(COALESCE(SUM(s.subtotal),0)::numeric, 2) AS subtotal,
           ROUND(COALESCE(SUM(s.service_charge),0)::numeric, 2) AS svc,
           ROUND(COALESCE(SUM(s.discount),0)::numeric, 2) AS discount,
           ROUND(COALESCE(SUM(s.cash),0)::numeric, 2) AS m_cash,
           ROUND(COALESCE(SUM(s.visa),0)::numeric, 2) AS m_visa,
           ROUND(COALESCE(SUM(s.mastercard),0)::numeric, 2) AS m_mastercard,
           ROUND(COALESCE(SUM(s.amex),0)::numeric, 2) AS m_amex,
           ROUND(COALESCE(SUM(s.union_pay),0)::numeric, 2) AS m_unionpay,
           ROUND(COALESCE(SUM(s.jcb),0)::numeric, 2) AS m_jcb,
           ROUND(COALESCE(SUM(s.alipay),0)::numeric, 2) AS m_alipay,
           ROUND(COALESCE(SUM(s.wechat),0)::numeric, 2) AS m_wechat,
           ROUND(COALESCE(SUM(s.payme),0)::numeric, 2) AS m_payme,
           ROUND(COALESCE(SUM(s.card_tips),0)::numeric, 2) AS tips
    FROM public.sales_records s
    GROUP BY s.date::date, s.venue
    HAVING COALESCE(SUM(s.subtotal),0)+COALESCE(SUM(s.service_charge),0)+COALESCE(SUM(s.discount),0)+COALESCE(SUM(s.card_tips),0) <> 0
  LOOP
    IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source_type='sales' AND source_id=r.d::text||'|'||r.venue AND manually_adjusted=true) THEN CONTINUE; END IF;
    SELECT account_id INTO acc_sales FROM public.account_mapping_rules WHERE rule_type='sales_revenue' AND match_key=r.venue LIMIT 1;
    SELECT account_id INTO acc_svc FROM public.account_mapping_rules WHERE rule_type='service_charge' AND match_key=r.venue LIMIT 1;
    SELECT account_id INTO acc_disc FROM public.account_mapping_rules WHERE rule_type='sales_discount' AND match_key=r.venue LIMIT 1;
    SELECT account_id INTO acc_tips FROM public.account_mapping_rules WHERE rule_type='tips_payable' AND match_key=r.venue LIMIT 1;
    acc_cash := NULL;
    SELECT account_id INTO acc_cash FROM public.account_mapping_rules WHERE rule_type='sales_payment_method' AND match_key='cash__'||r.venue LIMIT 1;
    IF acc_cash IS NULL THEN SELECT account_id INTO acc_cash FROM public.account_mapping_rules WHERE rule_type='sales_payment_method' AND match_key='cash' LIMIT 1; END IF;
    IF acc_cash IS NULL THEN SELECT account_id INTO acc_cash FROM public.account_mapping_rules WHERE rule_type='sales_cash' AND match_key='' LIMIT 1; END IF;
    IF acc_sales IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status)
      VALUES (r.d, 'Sales — '||r.venue, 'sales', r.d::text||'|'||r.venue, r.venue, 'draft') RETURNING id INTO e_id;
    v_ln := 0;
    IF r.m_cash > 0 AND acc_cash IS NOT NULL THEN
      v_ln := v_ln+1; INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_cash,r.m_cash,0,r.venue,v_ln,'Cash');
    END IF;
    FOREACH v_method IN ARRAY v_methods LOOP
      v_amt := CASE v_method WHEN 'visa' THEN r.m_visa WHEN 'mastercard' THEN r.m_mastercard WHEN 'amex' THEN r.m_amex
        WHEN 'union_pay' THEN r.m_unionpay WHEN 'jcb' THEN r.m_jcb WHEN 'alipay' THEN r.m_alipay
        WHEN 'wechat' THEN r.m_wechat WHEN 'payme' THEN r.m_payme END;
      IF v_amt > 0 THEN
        acc_pm := NULL;
        SELECT account_id INTO acc_pm FROM public.account_mapping_rules WHERE rule_type='sales_payment_method' AND match_key=v_method||'__'||r.venue LIMIT 1;
        IF acc_pm IS NULL THEN SELECT account_id INTO acc_pm FROM public.account_mapping_rules WHERE rule_type='sales_payment_method' AND match_key=v_method LIMIT 1; END IF;
        IF acc_pm IS NOT NULL THEN
          v_ln := v_ln+1; INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_pm,v_amt,0,r.venue,v_ln,COALESCE(v_labels->>v_method,v_method));
        END IF;
      END IF;
    END LOOP;
    IF ABS(r.discount) > 0 AND acc_disc IS NOT NULL THEN
      v_ln := v_ln+1; INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_disc,ABS(r.discount),0,r.venue,v_ln,'Sales discount');
    END IF;
    IF r.subtotal > 0 THEN v_ln := v_ln+1; INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no) VALUES (e_id,acc_sales,0,r.subtotal,r.venue,v_ln); END IF;
    IF r.svc > 0 AND acc_svc IS NOT NULL THEN v_ln := v_ln+1; INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no) VALUES (e_id,acc_svc,0,r.svc,r.venue,v_ln); END IF;
    IF ABS(r.tips) > 0 AND acc_tips IS NOT NULL THEN v_ln := v_ln+1; INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_tips,0,ABS(r.tips),r.venue,v_ln,'Card tips'); END IF;
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO v_total_debits, v_total_credits FROM public.journal_lines WHERE entry_id=e_id;
    v_imbalance := ROUND(v_total_debits - v_total_credits, 2);
    IF v_imbalance <> 0 AND acc_suspense IS NOT NULL THEN
      v_ln := v_ln+1;
      IF v_imbalance > 0 THEN INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_suspense,0,v_imbalance,r.venue,v_ln,'Reconciliation Δ');
      ELSE INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_suspense,-v_imbalance,0,r.venue,v_ln,'Reconciliation Δ'); END IF;
    END IF;
    UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
    cnt := cnt+1;
  END LOOP;

  -- ===== INVOICES (sign-safe) =====
  IF acc_ap IS NOT NULL THEN
    FOR inv IN
      SELECT i.id, i.invoice_date, i.venue, i.invoice_number, i.supplier_id, ROUND(i.total_amount::numeric,2) AS total_amount, COALESCE(s.name,'') AS supplier_name
      FROM public.invoices i LEFT JOIN public.suppliers s ON s.id = i.supplier_id WHERE i.status IN ('paid','unpaid')
    LOOP
      IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source_type='invoice' AND source_id=inv.id::text AND manually_adjusted=true) THEN CONTINUE; END IF;
      SELECT COUNT(*) INTO v_inv_unmapped
        FROM public.invoice_line_items li
        LEFT JOIN public.product_master pm ON pm.id=li.product_master_id
        LEFT JOIN public.account_mapping_rules amr ON amr.rule_type='procurement_category' AND amr.match_key=COALESCE(pm.financial_treatment,'')||'__'||COALESCE(pm.level1_category,'')
        WHERE li.invoice_id=inv.id AND (li.product_master_id IS NULL OR pm.financial_treatment='' OR COALESCE(pm.default_coa_account_id, amr.account_id) IS NULL);
      IF v_inv_unmapped > 0 THEN CONTINUE; END IF;
      INSERT INTO public.journal_entries (entry_date,memo,source_type,source_id,venue,status)
        VALUES (inv.invoice_date,'Invoice '||COALESCE(inv.invoice_number,'')||' — '||inv.supplier_name,'invoice',inv.id::text,inv.venue,'draft') RETURNING id INTO e_id;
      v_ln := 0;
      FOR line IN
        SELECT li.id, ROUND(li.total::numeric,2) AS total, COALESCE(NULLIF(pm.default_coa_account_id::text,'')::uuid, amr.account_id) AS acct, li.description
        FROM public.invoice_line_items li
        LEFT JOIN public.product_master pm ON pm.id=li.product_master_id
        LEFT JOIN public.account_mapping_rules amr ON amr.rule_type='procurement_category' AND amr.match_key=COALESCE(pm.financial_treatment,'')||'__'||COALESCE(pm.level1_category,'')
        WHERE li.invoice_id=inv.id
      LOOP
        IF line.acct IS NULL THEN CONTINUE; END IF;
        IF line.total > 0 THEN
          v_ln := v_ln+1;
          INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,line.acct,line.total,0,inv.venue,v_ln,line.description);
        ELSIF line.total < 0 THEN
          v_ln := v_ln+1;
          INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,line.acct,0,ABS(line.total),inv.venue,v_ln,line.description);
        END IF;
      END LOOP;
      v_ap_amount := ROUND(inv.total_amount,2);
      IF v_ap_amount > 0 THEN
        v_ln := v_ln+1;
        INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_ap,0,v_ap_amount,inv.venue,v_ln,inv.supplier_name);
      ELSIF v_ap_amount < 0 THEN
        v_ln := v_ln+1;
        INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_ap,ABS(v_ap_amount),0,inv.venue,v_ln,inv.supplier_name);
      END IF;
      SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO v_total_debits,v_total_credits FROM public.journal_lines WHERE entry_id=e_id;
      v_imbalance := ROUND(v_total_debits - v_total_credits,2);
      IF v_imbalance <> 0 AND acc_suspense IS NOT NULL THEN
        v_ln := v_ln+1;
        IF v_imbalance > 0 THEN INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_suspense,0,v_imbalance,inv.venue,v_ln,'Rounding');
        ELSE INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_suspense,-v_imbalance,0,inv.venue,v_ln,'Rounding'); END IF;
      END IF;
      IF (SELECT COUNT(*) FROM public.journal_lines WHERE entry_id=e_id) < 2 THEN
        DELETE FROM public.journal_entries WHERE id=e_id;
      ELSE
        UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
        cnt := cnt+1;
      END IF;
    END LOOP;

    -- ===== INVOICE PAYMENTS (sign-safe: refund flips Dr/Cr) =====
    FOR r IN
      SELECT p.id, p.payment_date, ROUND(p.amount::numeric,2) AS amount, p.payment_method, i.venue, i.invoice_number, COALESCE(s.name,'') AS supplier_name
      FROM public.invoice_payments p LEFT JOIN public.invoices i ON i.id=p.invoice_id LEFT JOIN public.suppliers s ON s.id=i.supplier_id WHERE p.amount<>0
    LOOP
      IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source_type='invoice_payment' AND source_id=r.id::text AND manually_adjusted=true) THEN CONTINUE; END IF;
      acc_pay_cash := NULL;
      SELECT account_id INTO acc_pay_cash FROM public.account_mapping_rules WHERE rule_type='payment_method_cash' AND match_key=r.payment_method LIMIT 1;
      IF acc_pay_cash IS NULL THEN SELECT id INTO acc_pay_cash FROM public.chart_of_accounts WHERE is_cash=true ORDER BY code LIMIT 1; END IF;
      IF acc_pay_cash IS NULL THEN CONTINUE; END IF;
      INSERT INTO public.journal_entries (entry_date,memo,source_type,source_id,venue,status)
        VALUES (r.payment_date,'Payment for '||COALESCE(r.invoice_number,'')||' — '||r.supplier_name,'invoice_payment',r.id::text,r.venue,'draft') RETURNING id INTO e_id;
      IF r.amount > 0 THEN
        INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_ap,r.amount,0,r.venue,1,r.supplier_name);
        INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_pay_cash,0,r.amount,r.venue,2,r.payment_method);
      ELSE
        INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_pay_cash,ABS(r.amount),0,r.venue,1,r.payment_method||' (refund)');
        INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_ap,0,ABS(r.amount),r.venue,2,r.supplier_name);
      END IF;
      UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
      cnt := cnt+1;
    END LOOP;
  END IF;

  -- ===== PAYROLL (unchanged) =====
  SELECT account_id INTO acc_pr_sal_pay FROM public.account_mapping_rules WHERE rule_type='salary_payable' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_pr_mpf_pay FROM public.account_mapping_rules WHERE rule_type='mpf_payable' AND match_key='' LIMIT 1;
  IF acc_pr_sal_pay IS NOT NULL AND acc_pr_mpf_pay IS NOT NULL THEN
    FOR pr IN
      SELECT p.id,p.year,p.month,p.gross_salary,p.net_salary,p.mpf_employee,p.mpf_employer,p.actual_total,p.actual_base_salary,p.actual_allowances,p.actual_overtime,p.actual_bonus,p.actual_deductions,p.forecast_total,p.forecast_base_salary,p.payment_status,p.net_salary_payment_date,p.mpf_payment_date,COALESCE(p.payment_method,'bank_transfer') AS payment_method, e.venue AS emp_venue, e.first_name||' '||e.last_name AS emp_name
      FROM public.hr_payroll p LEFT JOIN public.hr_employees e ON e.id=p.employee_id
    LOOP
      v_emp_venue := COALESCE(pr.emp_venue,'');
      v_period := pr.year::text||'-'||LPAD(pr.month::text,2,'0');
      v_accrual_date := (v_period||'-01')::date + INTERVAL '1 month' - INTERVAL '1 day';
      v_gross := ROUND(COALESCE(pr.actual_total, pr.gross_salary, 0)::numeric, 2);
      v_mpf_e := ROUND(COALESCE(pr.mpf_employee, LEAST(v_gross*MPF_RATE, MPF_CAP))::numeric, 2);
      v_mpf_r := ROUND(COALESCE(pr.mpf_employer, LEAST(v_gross*MPF_RATE, MPF_CAP))::numeric, 2);
      v_net := ROUND(COALESCE(pr.net_salary, v_gross - v_mpf_e)::numeric, 2);
      v_mpf_total := v_mpf_e + v_mpf_r;
      SELECT account_id INTO acc_pr_sal_exp FROM public.account_mapping_rules WHERE rule_type='salary_expense' AND match_key=v_emp_venue LIMIT 1;
      IF acc_pr_sal_exp IS NULL THEN SELECT account_id INTO acc_pr_sal_exp FROM public.account_mapping_rules WHERE rule_type='salary_expense' AND match_key='' LIMIT 1; END IF;
      SELECT account_id INTO acc_pr_mpf_exp FROM public.account_mapping_rules WHERE rule_type='mpf_expense' AND match_key=v_emp_venue LIMIT 1;
      IF acc_pr_mpf_exp IS NULL THEN SELECT account_id INTO acc_pr_mpf_exp FROM public.account_mapping_rules WHERE rule_type='mpf_expense' AND match_key='' LIMIT 1; END IF;
      IF acc_pr_sal_exp IS NULL OR acc_pr_mpf_exp IS NULL THEN CONTINUE; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE source_type='payroll_accrual' AND source_id=pr.id::text AND manually_adjusted=true) THEN
        INSERT INTO public.journal_entries (entry_date,memo,source_type,source_id,venue,status)
          VALUES (v_accrual_date,'Payroll accrual '||v_period||' — '||pr.emp_name,'payroll_accrual',pr.id::text,NULLIF(v_emp_venue,''),'draft')
          RETURNING id INTO e_id;
        v_ln := 0;
        IF v_gross>0 THEN v_ln:=v_ln+1; INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo) VALUES(e_id,acc_pr_sal_exp,v_gross,0,NULLIF(v_emp_venue,''),v_ln,'Gross salary'); END IF;
        IF v_mpf_r>0 THEN v_ln:=v_ln+1; INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo) VALUES(e_id,acc_pr_mpf_exp,v_mpf_r,0,NULLIF(v_emp_venue,''),v_ln,'MPF employer'); END IF;
        IF v_net>0 THEN v_ln:=v_ln+1; INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo) VALUES(e_id,acc_pr_sal_pay,0,v_net,NULLIF(v_emp_venue,''),v_ln,'Net payable'); END IF;
        IF v_mpf_total>0 THEN v_ln:=v_ln+1; INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo) VALUES(e_id,acc_pr_mpf_pay,0,v_mpf_total,NULLIF(v_emp_venue,''),v_ln,'MPF payable'); END IF;
        SELECT COALESCE(SUM(debit),0),COALESCE(SUM(credit),0) INTO v_total_debits,v_total_credits FROM public.journal_lines WHERE entry_id=e_id;
        v_imbalance := ROUND(v_total_debits-v_total_credits,2);
        IF v_imbalance<>0 AND acc_suspense IS NOT NULL THEN
          v_ln:=v_ln+1;
          IF v_imbalance>0 THEN INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo) VALUES(e_id,acc_suspense,0,v_imbalance,NULLIF(v_emp_venue,''),v_ln,'Δ');
          ELSE INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo) VALUES(e_id,acc_suspense,-v_imbalance,0,NULLIF(v_emp_venue,''),v_ln,'Δ'); END IF;
        END IF;
        IF (SELECT COUNT(*) FROM public.journal_lines WHERE entry_id=e_id) < 2 THEN DELETE FROM public.journal_entries WHERE id=e_id;
        ELSE UPDATE public.journal_entries SET status='posted' WHERE id=e_id; cnt:=cnt+1; END IF;
      END IF;
      IF pr.payment_status='paid' AND pr.net_salary_payment_date IS NOT NULL AND v_net>0 THEN
        IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE source_type='payroll_payment' AND source_id=pr.id::text AND manually_adjusted=true) THEN
          acc_pay_cash := NULL;
          SELECT account_id INTO acc_pay_cash FROM public.account_mapping_rules WHERE rule_type='payment_method_cash' AND match_key=pr.payment_method LIMIT 1;
          IF acc_pay_cash IS NULL THEN SELECT id INTO acc_pay_cash FROM public.chart_of_accounts WHERE is_cash=true ORDER BY code LIMIT 1; END IF;
          IF acc_pay_cash IS NOT NULL THEN
            INSERT INTO public.journal_entries (entry_date,memo,source_type,source_id,venue,status)
              VALUES (pr.net_salary_payment_date,'Salary paid '||v_period||' — '||pr.emp_name,'payroll_payment',pr.id::text,NULLIF(v_emp_venue,''),'draft') RETURNING id INTO e_id;
            INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo) VALUES(e_id,acc_pr_sal_pay,v_net,0,NULLIF(v_emp_venue,''),1,'Clear salary payable');
            INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo) VALUES(e_id,acc_pay_cash,0,v_net,NULLIF(v_emp_venue,''),2,pr.payment_method);
            UPDATE public.journal_entries SET status='posted' WHERE id=e_id; cnt:=cnt+1;
          END IF;
        END IF;
      END IF;
      IF pr.mpf_payment_date IS NOT NULL AND v_mpf_total>0 THEN
        IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE source_type='mpf_payment' AND source_id=pr.id::text AND manually_adjusted=true) THEN
          acc_pay_cash := NULL;
          SELECT account_id INTO acc_pay_cash FROM public.account_mapping_rules WHERE rule_type='payment_method_cash' AND match_key=pr.payment_method LIMIT 1;
          IF acc_pay_cash IS NULL THEN SELECT id INTO acc_pay_cash FROM public.chart_of_accounts WHERE is_cash=true ORDER BY code LIMIT 1; END IF;
          IF acc_pay_cash IS NOT NULL THEN
            INSERT INTO public.journal_entries (entry_date,memo,source_type,source_id,venue,status)
              VALUES (pr.mpf_payment_date,'MPF paid '||v_period||' — '||pr.emp_name,'mpf_payment',pr.id::text,NULLIF(v_emp_venue,''),'draft') RETURNING id INTO e_id;
            INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo) VALUES(e_id,acc_pr_mpf_pay,v_mpf_total,0,NULLIF(v_emp_venue,''),1,'Clear MPF payable');
            INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo) VALUES(e_id,acc_pay_cash,0,v_mpf_total,NULLIF(v_emp_venue,''),2,'MPF remittance');
            UPDATE public.journal_entries SET status='posted' WHERE id=e_id; cnt:=cnt+1;
          END IF;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- ===== SETTLEMENT CLEARING (sign-safe) =====
  FOR sb IN
    SELECT b.id, b.settlement_date, b.gross_amount, b.fee_amount, b.bank_transfer_fee,
           b.net_settlement, b.bank_transaction_id, b.processor_id,
           m.display_name AS merchant_name, m.venue AS merchant_venue,
           m.fee_account_id,
           COALESCE(b.bank_account_id, m.default_bank_account_id) AS bank_acc_id,
           p.name AS proc_name,
           bt.money_in AS bank_money_in,
           bt.money_out AS bank_money_out
    FROM public.payment_settlement_batches b
    JOIN public.payment_processor_merchants m ON m.id = b.merchant_id
    JOIN public.payment_processors p          ON p.id = b.processor_id
    LEFT JOIN public.bank_transactions bt     ON bt.id = b.bank_transaction_id
    WHERE b.bank_transaction_id IS NOT NULL
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.journal_entries
      WHERE source_type='settlement_clearing' AND source_id = sb.id::text AND manually_adjusted = true
    ) THEN CONTINUE; END IF;

    -- Use absolute money_in; if money_in is 0 and money_out exists (chargeback), skip with audit
    v_bank_amt := ROUND(GREATEST(COALESCE(sb.bank_money_in,0), 0)::numeric, 2);
    IF v_bank_amt = 0 AND COALESCE(sb.bank_money_out,0) > 0 THEN
      INSERT INTO public.ledger_audit_log (event_type,user_id,user_display_name,status,notes)
        VALUES ('settlement_clearing_skipped',v_uid,v_uname,'skipped',
                'Chargeback / outflow on bank txn for batch '||sb.id::text||' — needs manual review');
      CONTINUE;
    END IF;
    IF v_bank_amt = 0 THEN
      v_bank_amt := ROUND(GREATEST(COALESCE(sb.net_settlement,0), 0)::numeric, 2);
    END IF;

    v_proc_fee := ROUND(GREATEST(ABS(COALESCE(sb.fee_amount,0)), 0)::numeric, 2);
    v_xfer_fee := ROUND(GREATEST(ABS(COALESCE(sb.bank_transfer_fee,0)), 0)::numeric, 2);
    v_gross    := ROUND(COALESCE(sb.gross_amount,0)::numeric, 2);

    IF v_gross <= 0 AND v_bank_amt <= 0 THEN
      INSERT INTO public.ledger_audit_log (event_type,user_id,user_display_name,status,notes)
        VALUES ('settlement_clearing_skipped',v_uid,v_uname,'skipped',
                'Zero/negative gross & bank for batch '||sb.id::text);
      CONTINUE;
    END IF;

    acc_bank := NULL;
    IF sb.bank_acc_id IS NOT NULL THEN
      SELECT linked_gl_account_id INTO acc_bank FROM public.bank_accounts WHERE id = sb.bank_acc_id;
    END IF;
    IF acc_bank IS NULL THEN
      INSERT INTO public.ledger_audit_log (event_type,user_id,user_display_name,status,notes)
        VALUES ('settlement_clearing_skipped',v_uid,v_uname,'skipped','No GL on bank account for batch '||sb.id::text);
      CONTINUE;
    END IF;

    acc_fee := COALESCE(sb.fee_account_id, acc_proc_fee_default);

    INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status)
      VALUES (sb.settlement_date,
              sb.proc_name||' settlement clearing — '||sb.merchant_name,
              'settlement_clearing', sb.id::text, sb.merchant_venue, 'draft')
      RETURNING id INTO e_id;
    v_ln := 0;

    IF v_bank_amt > 0 THEN
      v_ln := v_ln+1;
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo)
        VALUES (e_id, acc_bank, v_bank_amt, 0, sb.merchant_venue, v_ln, 'Net settlement received');
    END IF;

    IF v_proc_fee > 0 AND acc_fee IS NOT NULL THEN
      v_ln := v_ln+1;
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo)
        VALUES (e_id, acc_fee, v_proc_fee, 0, sb.merchant_venue, v_ln, 'Processing fees');
    END IF;

    IF v_xfer_fee > 0 AND COALESCE(acc_bank_fee_default, acc_fee) IS NOT NULL THEN
      v_ln := v_ln+1;
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo)
        VALUES (e_id, COALESCE(acc_bank_fee_default, acc_fee), v_xfer_fee, 0, sb.merchant_venue, v_ln, 'Bank settlement fee');
    END IF;

    FOR sl IN
      SELECT payment_type, ROUND(COALESCE(SUM(gross_amount),0)::numeric,2) AS g
      FROM public.payment_settlement_lines
      WHERE batch_id = sb.id
      GROUP BY payment_type
      HAVING ROUND(COALESCE(SUM(gross_amount),0)::numeric,2) > 0
    LOOP
      v_pm_key := regexp_replace(sl.payment_type, '_foreign$', '');
      acc_pm := NULL;
      SELECT account_id INTO acc_pm FROM public.account_mapping_rules
       WHERE rule_type='sales_payment_method'
         AND match_key = v_pm_key||'__'||COALESCE(sb.merchant_venue,'')
       LIMIT 1;
      IF acc_pm IS NULL THEN
        SELECT account_id INTO acc_pm FROM public.account_mapping_rules
         WHERE rule_type='sales_payment_method' AND match_key = v_pm_key
         LIMIT 1;
      END IF;
      IF acc_pm IS NULL THEN acc_pm := acc_suspense; END IF;
      IF acc_pm IS NOT NULL THEN
        v_ln := v_ln+1;
        INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo)
          VALUES (e_id, acc_pm, 0, sl.g, sb.merchant_venue, v_ln, 'Clear '||sl.payment_type||' merchant receivable');
      END IF;
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM public.journal_lines WHERE entry_id=e_id AND credit > 0) AND v_gross > 0 THEN
      v_ln := v_ln+1;
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo)
        VALUES (e_id, COALESCE(acc_suspense,acc_bank), 0, v_gross, sb.merchant_venue, v_ln, 'Clear merchant receivable (no lines)');
    END IF;

    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
      INTO v_total_debits, v_total_credits FROM public.journal_lines WHERE entry_id = e_id;
    v_imbalance := ROUND(v_total_debits - v_total_credits, 2);
    IF v_imbalance <> 0 AND acc_suspense IS NOT NULL THEN
      v_ln := v_ln+1;
      IF v_imbalance > 0 THEN
        INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo)
          VALUES (e_id, acc_suspense, 0, v_imbalance, sb.merchant_venue, v_ln, 'Adjustments / points / rounding');
      ELSE
        INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo)
          VALUES (e_id, acc_suspense, -v_imbalance, 0, sb.merchant_venue, v_ln, 'Adjustments / points / rounding');
      END IF;
    END IF;

    IF (SELECT COUNT(*) FROM public.journal_lines WHERE entry_id=e_id) < 2 THEN
      DELETE FROM public.journal_entries WHERE id=e_id;
      CONTINUE;
    END IF;

    UPDATE public.journal_entries SET status='posted' WHERE id=e_id;

    UPDATE public.payment_settlement_batches
       SET clearing_journal_entry_id = e_id,
           status = 'cleared'
     WHERE id = sb.id;

    IF sb.bank_transaction_id IS NOT NULL THEN
      UPDATE public.bank_transactions
         SET journal_entry_id = e_id
       WHERE id = sb.bank_transaction_id;
    END IF;

    cnt := cnt + 1;
  END LOOP;

  -- ===== BANK FEES (unchanged) =====
  FOR bf IN
    SELECT t.id, t.txn_date, t.description, t.bank_account_id, t.money_out, t.money_in,
           ba.linked_gl_account_id AS bank_gl, ba.venue AS bank_venue,
           amr.account_id AS mapped_acct
    FROM public.bank_transactions t
    JOIN public.bank_accounts ba ON ba.id = t.bank_account_id
    LEFT JOIN public.account_mapping_rules amr
      ON amr.rule_type = 'bank_txn_type' AND amr.match_key = COALESCE(t.suggested_type,'')
    WHERE COALESCE(t.suggested_type,'') = 'bank_fee' OR t.status = 'bank_fee'
  LOOP
    IF EXISTS (SELECT 1 FROM public.journal_entries
               WHERE source_type='bank_fee' AND source_id = bf.id::text AND manually_adjusted=true) THEN CONTINUE; END IF;
    v_fee_amt := ROUND(ABS(COALESCE(bf.money_out,0) - COALESCE(bf.money_in,0))::numeric, 2);
    IF v_fee_amt <= 0 THEN CONTINUE; END IF;
    IF bf.bank_gl IS NULL THEN
      INSERT INTO public.ledger_audit_log (event_type,user_id,user_display_name,status,notes)
        VALUES ('bank_fee_skipped',v_uid,v_uname,'skipped','Bank account has no linked GL account: '||bf.id::text);
      CONTINUE;
    END IF;
    acc_bank_charge := COALESCE(bf.mapped_acct, acc_bank_charge_default);
    IF acc_bank_charge IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.journal_entries (entry_date,memo,source_type,source_id,venue,status)
      VALUES (bf.txn_date, 'Bank fee — '||LEFT(bf.description,80), 'bank_fee', bf.id::text, bf.bank_venue, 'draft')
      RETURNING id INTO e_id;
    INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo)
      VALUES (e_id, acc_bank_charge, v_fee_amt, 0, bf.bank_venue, 1, 'Bank charge');
    INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo)
      VALUES (e_id, bf.bank_gl, 0, v_fee_amt, bf.bank_venue, 2, LEFT(bf.description,80));
    UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
    UPDATE public.bank_transactions SET journal_entry_id = e_id WHERE id = bf.id;
    cnt:=cnt+1;
  END LOOP;

  INSERT INTO public.ledger_audit_log (event_type,user_id,user_display_name,amount,status,notes)
    VALUES ('ledger_rebuild_finish',v_uid,v_uname,cnt,'success','Created '||cnt||' journal entries');
  RETURN jsonb_build_object('entries_created', cnt);
END;
$function$;