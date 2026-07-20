CREATE OR REPLACE FUNCTION public.post_payroll_accrual(p_year integer, p_month integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_uname text;
  v_existing int;
  v_accrual_date date;
  acc_sal_pay uuid; acc_mpf_pay uuid; acc_suspense uuid;
  acc_sal_exp uuid; acc_mpf_exp uuid;
  e_id uuid;
  v_ln int;
  v_total_d numeric; v_total_c numeric; v_imb numeric;
  r record; v_emp_venue text;
  v_gross numeric; v_mpf_e numeric; v_mpf_r numeric;
  cnt int := 0;
  MPF_RATE constant numeric := 0.05;
  MPF_CAP constant numeric := 1500;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid,'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized: admin role required';
  END IF;

  SELECT COUNT(*) INTO v_existing
    FROM public.hr_payroll
   WHERE year=p_year AND month=p_month AND accrual_journal_entry_id IS NOT NULL;
  IF v_existing > 0 THEN
    RETURN jsonb_build_object('already_posted', true, 'period', p_year||'-'||LPAD(p_month::text,2,'0'));
  END IF;

  v_accrual_date := (make_date(p_year,p_month,1) + INTERVAL '1 month - 1 day')::date;

  SELECT display_name INTO v_uname FROM public.profiles WHERE user_id=v_uid LIMIT 1;
  SELECT account_id INTO acc_sal_pay FROM public.account_mapping_rules WHERE rule_type='salary_payable' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_mpf_pay FROM public.account_mapping_rules WHERE rule_type='mpf_payable' AND match_key='' LIMIT 1;
  IF acc_sal_pay IS NULL THEN SELECT id INTO acc_sal_pay FROM public.chart_of_accounts WHERE code='2040' LIMIT 1; END IF;
  IF acc_mpf_pay IS NULL THEN SELECT id INTO acc_mpf_pay FROM public.chart_of_accounts WHERE code='2030' LIMIT 1; END IF;
  SELECT id INTO acc_suspense FROM public.chart_of_accounts WHERE code='1900' LIMIT 1;

  IF acc_sal_pay IS NULL OR acc_mpf_pay IS NULL THEN
    RAISE EXCEPTION 'Missing Salary Payable / MPF Payable account. Configure under Finance → Mappings → Payroll.';
  END IF;

  FOR r IN
    SELECT COALESCE(NULLIF(e.venue,''),'(unassigned)') AS venue,
           ROUND(SUM(
               COALESCE(p.forecast_base_salary, p.base_salary, 0)
             + COALESCE(p.overtime_pay, 0)
             + COALESCE(p.actual_bonus, 0)
             + COALESCE(p.annual_leave_pay, 0)
             - COALESCE(p.unpaid_leave_deduction, 0)
             + COALESCE(p.adjustments_override, 0)
           )::numeric, 2) AS gross,
           ROUND(SUM(COALESCE(p.mpf_employee, LEAST(COALESCE(p.actual_total,p.gross_salary,0)*MPF_RATE,MPF_CAP)))::numeric,2) AS mpf_e,
           ROUND(SUM(COALESCE(p.mpf_employer, LEAST(COALESCE(p.actual_total,p.gross_salary,0)*MPF_RATE,MPF_CAP)))::numeric,2) AS mpf_r,
           array_agg(p.id) AS payroll_ids
      FROM public.hr_payroll p
      LEFT JOIN public.hr_employees e ON e.id=p.employee_id
     WHERE p.year=p_year AND p.month=p_month
     GROUP BY COALESCE(NULLIF(e.venue,''),'(unassigned)')
     HAVING SUM(
               COALESCE(p.forecast_base_salary, p.base_salary, 0)
             + COALESCE(p.overtime_pay, 0)
             + COALESCE(p.actual_bonus, 0)
             + COALESCE(p.annual_leave_pay, 0)
             - COALESCE(p.unpaid_leave_deduction, 0)
             + COALESCE(p.adjustments_override, 0)
           ) <> 0
  LOOP
    v_emp_venue := NULLIF(r.venue,'(unassigned)');
    v_gross := r.gross; v_mpf_e := r.mpf_e; v_mpf_r := r.mpf_r;

    SELECT account_id INTO acc_sal_exp FROM public.account_mapping_rules WHERE rule_type IN ('payroll_salary_expense','salary_expense') AND match_key=COALESCE(v_emp_venue,'') LIMIT 1;
    IF acc_sal_exp IS NULL THEN SELECT account_id INTO acc_sal_exp FROM public.account_mapping_rules WHERE rule_type IN ('payroll_salary_expense','salary_expense') AND match_key='' LIMIT 1; END IF;
    IF acc_sal_exp IS NULL THEN SELECT id INTO acc_sal_exp FROM public.chart_of_accounts WHERE code='6010' LIMIT 1; END IF;

    SELECT account_id INTO acc_mpf_exp FROM public.account_mapping_rules WHERE rule_type IN ('payroll_mpf_expense','mpf_expense') AND match_key=COALESCE(v_emp_venue,'') LIMIT 1;
    IF acc_mpf_exp IS NULL THEN SELECT account_id INTO acc_mpf_exp FROM public.account_mapping_rules WHERE rule_type IN ('payroll_mpf_expense','mpf_expense') AND match_key='' LIMIT 1; END IF;
    IF acc_mpf_exp IS NULL THEN SELECT id INTO acc_mpf_exp FROM public.chart_of_accounts WHERE code='6020' LIMIT 1; END IF;

    IF acc_sal_exp IS NULL OR acc_mpf_exp IS NULL THEN
      RAISE EXCEPTION 'Missing Salaries Expense (6010) / MPF Expense (6020) accounts in Chart of Accounts.';
    END IF;

    INSERT INTO public.journal_entries(entry_date, memo, source_type, source_id, venue, status, created_by)
      VALUES (v_accrual_date,
              'Payroll accrual '||p_year||'-'||LPAD(p_month::text,2,'0')||' — '||r.venue,
              'payroll_accrual',
              p_year||'-'||LPAD(p_month::text,2,'0')||'|'||r.venue,
              v_emp_venue,'draft',v_uid)
      RETURNING id INTO e_id;
    v_ln := 0;
    IF v_gross>0 THEN v_ln:=v_ln+1; INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo) VALUES(e_id,acc_sal_exp,v_gross,0,v_emp_venue,v_ln,'Gross salary'); END IF;
    IF v_mpf_r>0 THEN v_ln:=v_ln+1; INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo) VALUES(e_id,acc_mpf_exp,v_mpf_r,0,v_emp_venue,v_ln,'MPF employer'); END IF;
    IF (v_gross - v_mpf_e) > 0 THEN v_ln:=v_ln+1; INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo) VALUES(e_id,acc_sal_pay,0,v_gross - v_mpf_e,v_emp_venue,v_ln,'Net salary payable'); END IF;
    IF (v_mpf_e + v_mpf_r) > 0 THEN v_ln:=v_ln+1; INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo) VALUES(e_id,acc_mpf_pay,0,v_mpf_e + v_mpf_r,v_emp_venue,v_ln,'MPF payable'); END IF;

    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO v_total_d, v_total_c FROM public.journal_lines WHERE entry_id=e_id;
    v_imb := ROUND(v_total_d - v_total_c, 2);
    IF v_imb<>0 AND acc_suspense IS NOT NULL THEN
      v_ln:=v_ln+1;
      IF v_imb>0 THEN INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo) VALUES(e_id,acc_suspense,0,v_imb,v_emp_venue,v_ln,'Δ');
      ELSE INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo) VALUES(e_id,acc_suspense,-v_imb,0,v_emp_venue,v_ln,'Δ'); END IF;
    END IF;

    IF (SELECT COUNT(*) FROM public.journal_lines WHERE entry_id=e_id) < 2 THEN
      DELETE FROM public.journal_entries WHERE id=e_id;
    ELSE
      UPDATE public.journal_entries SET status='posted', posted_at=now() WHERE id=e_id;
      UPDATE public.hr_payroll SET accrual_journal_entry_id = e_id WHERE id = ANY(r.payroll_ids);
      cnt := cnt+1;
    END IF;
  END LOOP;

  INSERT INTO public.ledger_audit_log(event_type,user_id,user_display_name,amount,status,notes)
    VALUES('payroll_accrual_posted',v_uid,v_uname,cnt,'success','Posted '||cnt||' accrual entries for '||p_year||'-'||LPAD(p_month::text,2,'0'));

  RETURN jsonb_build_object('already_posted', false, 'entries_created', cnt);
END;
$function$;