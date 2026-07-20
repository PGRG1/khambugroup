
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
  v_period_label text;
  v_month_name text;
  acc_sal_pay uuid; acc_mpf_pay uuid; acc_suspense uuid;
  acc_sal_exp uuid; acc_mpf_exp uuid;
  e_id uuid;
  v_ln int := 0;
  v_total_d numeric; v_total_c numeric; v_imb numeric;
  r record;
  v_all_ids uuid[] := ARRAY[]::uuid[];
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
  v_period_label := p_year||'-'||LPAD(p_month::text,2,'0');
  v_month_name := to_char(make_date(p_year,p_month,1), 'FMMonth YYYY');

  SELECT display_name INTO v_uname FROM public.profiles WHERE user_id=v_uid LIMIT 1;
  SELECT account_id INTO acc_sal_pay FROM public.account_mapping_rules WHERE rule_type='salary_payable' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_mpf_pay FROM public.account_mapping_rules WHERE rule_type='mpf_payable' AND match_key='' LIMIT 1;
  IF acc_sal_pay IS NULL THEN SELECT id INTO acc_sal_pay FROM public.chart_of_accounts WHERE code='2040' LIMIT 1; END IF;
  IF acc_mpf_pay IS NULL THEN SELECT id INTO acc_mpf_pay FROM public.chart_of_accounts WHERE code='2030' LIMIT 1; END IF;
  SELECT id INTO acc_suspense FROM public.chart_of_accounts WHERE code='1900' LIMIT 1;

  IF acc_sal_pay IS NULL OR acc_mpf_pay IS NULL THEN
    RAISE EXCEPTION 'Missing Salary Payable / MPF Payable account. Configure under Finance → Mappings → Payroll.';
  END IF;

  -- Create ONE consolidated entry for the whole month.
  INSERT INTO public.journal_entries(entry_date, memo, source_type, source_id, venue, status, created_by)
    VALUES (v_accrual_date,
            'Payroll accrual — '||v_month_name,
            'payroll_accrual',
            v_period_label,
            NULL, 'draft', v_uid)
    RETURNING id INTO e_id;

  -- Aggregate per REAL venue (resolved via hr_employees.venue_id → venues.name;
  -- fallback to legacy free-text ONLY when it matches a real venue; else 'Unassigned').
  FOR r IN
    WITH resolved AS (
      SELECT p.id AS pid,
             COALESCE(
               v1.name,
               (SELECT v2.name FROM public.venues v2
                 WHERE v2.tenant_id = e.tenant_id
                   AND lower(v2.name) = lower(NULLIF(e.venue,''))
                 LIMIT 1),
               'Unassigned'
             ) AS venue_name,
             COALESCE(p.actual_base_salary, p.forecast_base_salary, 0)
               + COALESCE(p.actual_overtime, 0)
               + COALESCE(p.actual_bonus, 0)
               + COALESCE(p.annual_leave_pay, 0)
               - COALESCE(p.unpaid_leave_deduction, 0)
               + COALESCE(p.adjustments_override, 0) AS gross_row,
             COALESCE(p.mpf_employee, LEAST(COALESCE(p.actual_total,p.gross_salary,0)*MPF_RATE,MPF_CAP)) AS mpf_e_row,
             COALESCE(p.mpf_employer, LEAST(COALESCE(p.actual_total,p.gross_salary,0)*MPF_RATE,MPF_CAP)) AS mpf_r_row
        FROM public.hr_payroll p
        LEFT JOIN public.hr_employees e ON e.id = p.employee_id
        LEFT JOIN public.venues v1 ON v1.id = e.venue_id
       WHERE p.year=p_year AND p.month=p_month
    )
    SELECT venue_name,
           ROUND(SUM(gross_row)::numeric, 2) AS gross,
           ROUND(SUM(mpf_e_row)::numeric, 2) AS mpf_e,
           ROUND(SUM(mpf_r_row)::numeric, 2) AS mpf_r,
           array_agg(pid) AS payroll_ids
      FROM resolved
     GROUP BY venue_name
     HAVING SUM(gross_row) <> 0 OR SUM(mpf_r_row) <> 0 OR SUM(mpf_e_row) <> 0
     ORDER BY (venue_name = 'Unassigned'), venue_name
  LOOP
    v_all_ids := v_all_ids || r.payroll_ids;

    -- Per-venue expense account overrides (real venue name as match_key; 'Unassigned' → global default).
    acc_sal_exp := NULL; acc_mpf_exp := NULL;
    IF r.venue_name <> 'Unassigned' THEN
      SELECT account_id INTO acc_sal_exp FROM public.account_mapping_rules
        WHERE rule_type IN ('payroll_salary_expense','salary_expense') AND match_key=r.venue_name LIMIT 1;
      SELECT account_id INTO acc_mpf_exp FROM public.account_mapping_rules
        WHERE rule_type IN ('payroll_mpf_expense','mpf_expense') AND match_key=r.venue_name LIMIT 1;
    END IF;
    IF acc_sal_exp IS NULL THEN
      SELECT account_id INTO acc_sal_exp FROM public.account_mapping_rules
        WHERE rule_type IN ('payroll_salary_expense','salary_expense') AND match_key='' LIMIT 1;
    END IF;
    IF acc_sal_exp IS NULL THEN SELECT id INTO acc_sal_exp FROM public.chart_of_accounts WHERE code='6010' LIMIT 1; END IF;
    IF acc_mpf_exp IS NULL THEN
      SELECT account_id INTO acc_mpf_exp FROM public.account_mapping_rules
        WHERE rule_type IN ('payroll_mpf_expense','mpf_expense') AND match_key='' LIMIT 1;
    END IF;
    IF acc_mpf_exp IS NULL THEN SELECT id INTO acc_mpf_exp FROM public.chart_of_accounts WHERE code='6020' LIMIT 1; END IF;

    IF acc_sal_exp IS NULL OR acc_mpf_exp IS NULL THEN
      RAISE EXCEPTION 'Missing Salaries Expense (6010) / MPF Expense (6020) accounts in Chart of Accounts.';
    END IF;

    IF r.gross > 0 THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo)
        VALUES (e_id, acc_sal_exp, r.gross, 0, r.venue_name, v_ln, 'Gross salary — '||r.venue_name);
    END IF;
    IF r.mpf_r > 0 THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo)
        VALUES (e_id, acc_mpf_exp, r.mpf_r, 0, r.venue_name, v_ln, 'MPF employer — '||r.venue_name);
    END IF;
    IF (r.gross - r.mpf_e) > 0 THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo)
        VALUES (e_id, acc_sal_pay, 0, r.gross - r.mpf_e, r.venue_name, v_ln, 'Net salary payable — '||r.venue_name);
    END IF;
    IF (r.mpf_e + r.mpf_r) > 0 THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo)
        VALUES (e_id, acc_mpf_pay, 0, r.mpf_e + r.mpf_r, r.venue_name, v_ln, 'MPF payable — '||r.venue_name);
    END IF;
  END LOOP;

  -- Single suspense plug across the whole consolidated entry.
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
    INTO v_total_d, v_total_c
    FROM public.journal_lines WHERE entry_id=e_id;
  v_imb := ROUND(v_total_d - v_total_c, 2);
  IF v_imb <> 0 AND acc_suspense IS NOT NULL THEN
    v_ln := v_ln + 1;
    IF v_imb > 0 THEN
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo)
        VALUES (e_id, acc_suspense, 0, v_imb, NULL, v_ln, 'Rounding Δ');
    ELSE
      INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,venue,line_no,memo)
        VALUES (e_id, acc_suspense, -v_imb, 0, NULL, v_ln, 'Rounding Δ');
    END IF;
  END IF;

  IF (SELECT COUNT(*) FROM public.journal_lines WHERE entry_id=e_id) < 2 THEN
    DELETE FROM public.journal_entries WHERE id=e_id;
    INSERT INTO public.ledger_audit_log(event_type,user_id,user_display_name,amount,status,notes)
      VALUES('payroll_accrual_posted',v_uid,v_uname,0,'success','No payroll rows to accrue for '||v_period_label);
    RETURN jsonb_build_object('already_posted', false, 'entries_created', 0);
  END IF;

  UPDATE public.journal_entries SET status='posted', posted_at=now() WHERE id=e_id;

  UPDATE public.hr_payroll
     SET accrual_journal_entry_id = e_id
   WHERE year = p_year AND month = p_month
     AND id = ANY(v_all_ids);

  INSERT INTO public.ledger_audit_log(event_type,user_id,user_display_name,amount,status,notes)
    VALUES('payroll_accrual_posted',v_uid,v_uname,1,'success','Posted consolidated payroll accrual for '||v_period_label);

  RETURN jsonb_build_object('already_posted', false, 'entries_created', 1);
END;
$function$;
