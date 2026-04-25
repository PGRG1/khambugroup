
ALTER TABLE public.account_mapping_rules DROP CONSTRAINT IF EXISTS account_mapping_rules_rule_type_check;
ALTER TABLE public.account_mapping_rules ADD CONSTRAINT account_mapping_rules_rule_type_check
  CHECK (rule_type = ANY (ARRAY[
    'sales_revenue','service_charge','sales_cash','payment_method_cash',
    'invoice_expense','accounts_payable',
    'payroll_salary_expense','payroll_mpf_expense','salary_payable','mpf_payable',
    'manual_income','manual_expense','opening_equity',
    'sales_payment_method','processor_fees','merchant_receivable'
  ]));

INSERT INTO public.chart_of_accounts (code, name, account_type, normal_side, is_cash, sort_order, description)
VALUES
  ('1210', 'Merchant Receivable - Visa',        'asset',   'debit',  false, 121, 'Cash due from Visa processor (T+2)'),
  ('1211', 'Merchant Receivable - Mastercard',  'asset',   'debit',  false, 122, 'Cash due from Mastercard processor (T+2)'),
  ('1212', 'Merchant Receivable - Amex',        'asset',   'debit',  false, 123, 'Cash due from Amex processor (T+2)'),
  ('1213', 'Merchant Receivable - UnionPay',    'asset',   'debit',  false, 124, 'Cash due from UnionPay processor (T+2)'),
  ('1214', 'Merchant Receivable - JCB',         'asset',   'debit',  false, 125, 'Cash due from JCB processor (T+2)'),
  ('1215', 'Merchant Receivable - Alipay',      'asset',   'debit',  false, 126, 'Cash due from Alipay processor (T+2)'),
  ('1216', 'Merchant Receivable - WeChat Pay',  'asset',   'debit',  false, 127, 'Cash due from WeChat processor (T+2)'),
  ('1217', 'Merchant Receivable - PayMe',       'asset',   'debit',  false, 128, 'Cash due from PayMe processor (T+2)'),
  ('5910', 'Payment Processing Fees',           'opex',    'debit',  false, 591, 'Fees charged by payment processors on settlement')
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  cash_acct uuid;
  v record;
BEGIN
  SELECT account_id INTO cash_acct FROM public.account_mapping_rules
    WHERE rule_type='sales_cash' AND match_key='' LIMIT 1;

  FOR v IN
    SELECT * FROM (VALUES
      ('cash',       cash_acct),
      ('visa',       (SELECT id FROM public.chart_of_accounts WHERE code='1210')),
      ('mastercard', (SELECT id FROM public.chart_of_accounts WHERE code='1211')),
      ('amex',       (SELECT id FROM public.chart_of_accounts WHERE code='1212')),
      ('union_pay',  (SELECT id FROM public.chart_of_accounts WHERE code='1213')),
      ('jcb',        (SELECT id FROM public.chart_of_accounts WHERE code='1214')),
      ('alipay',     (SELECT id FROM public.chart_of_accounts WHERE code='1215')),
      ('wechat',     (SELECT id FROM public.chart_of_accounts WHERE code='1216')),
      ('payme',      (SELECT id FROM public.chart_of_accounts WHERE code='1217'))
    ) AS t(method, acct)
  LOOP
    IF v.acct IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.account_mapping_rules WHERE rule_type='sales_payment_method' AND match_key=v.method
    ) THEN
      INSERT INTO public.account_mapping_rules (rule_type, match_key, account_id, notes)
      VALUES ('sales_payment_method', v.method, v.acct, 'Auto-seeded');
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.account_mapping_rules WHERE rule_type='processor_fees' AND match_key='') THEN
    INSERT INTO public.account_mapping_rules (rule_type, match_key, account_id, notes)
    SELECT 'processor_fees', '', id, 'Default fee account'
    FROM public.chart_of_accounts WHERE code='5910';
  END IF;
END $$;

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
  acc_manual_inc uuid;
  acc_manual_exp uuid;
  acc_opening_eq uuid;
  acc_cash_default uuid;
  acc_method uuid;
  e_id uuid;
  r record;
  cnt int := 0;
  v_opening_balance numeric;
  v_opening_date date;
  v_total numeric;
  v_svc numeric;
  v_rev numeric;
  v_lines_total numeric;
  v_diff numeric;
  v_methods_total numeric;
  v_ln int;
  pm_record record;
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
  SELECT account_id INTO acc_manual_inc FROM public.account_mapping_rules WHERE rule_type='manual_income' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_manual_exp FROM public.account_mapping_rules WHERE rule_type='manual_expense' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_opening_eq FROM public.account_mapping_rules WHERE rule_type='opening_equity' AND match_key='' LIMIT 1;
  SELECT account_id INTO acc_cash_default FROM public.account_mapping_rules WHERE rule_type='payment_method_cash' AND match_key='' LIMIT 1;
  IF acc_cash_default IS NULL THEN acc_cash_default := acc_sales_cash; END IF;

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

    v_total := r.total;
    v_svc := LEAST(r.svc, v_total);
    v_rev := v_total - v_svc;

    INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status)
      VALUES (r.d, 'Sales — '||r.venue, 'sales', r.d::text||'|'||r.venue, r.venue, 'draft')
      RETURNING id INTO e_id;

    v_ln := 0;
    v_methods_total := 0;

    FOR pm_record IN
      SELECT method, amt FROM (VALUES
        ('cash',       r.m_cash),
        ('visa',       r.m_visa),
        ('mastercard', r.m_mastercard),
        ('amex',       r.m_amex),
        ('union_pay',  r.m_unionpay),
        ('jcb',        r.m_jcb),
        ('alipay',     r.m_alipay),
        ('wechat',     r.m_wechat),
        ('payme',      r.m_payme)
      ) AS t(method, amt)
      WHERE amt > 0
    LOOP
      SELECT account_id INTO acc_method FROM public.account_mapping_rules
        WHERE rule_type='sales_payment_method' AND match_key=pm_record.method LIMIT 1;
      IF acc_method IS NULL THEN
        acc_method := acc_sales_cash;
      END IF;
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
        VALUES (e_id, acc_method, pm_record.amt, 0, r.venue, v_ln, pm_record.method);
      v_methods_total := v_methods_total + pm_record.amt;
    END LOOP;

    v_diff := v_total - v_methods_total;
    IF v_diff > 0 THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
        VALUES (e_id, acc_sales_cash, v_diff, 0, r.venue, v_ln, 'unallocated');
    ELSIF v_diff < 0 THEN
      UPDATE public.journal_lines SET debit = debit + v_diff
        WHERE id = (SELECT id FROM public.journal_lines WHERE entry_id = e_id ORDER BY line_no DESC LIMIT 1);
    END IF;

    v_ln := v_ln + 1;
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no)
      VALUES (e_id, acc_sales_default, 0, v_rev, r.venue, v_ln);

    IF v_svc > 0 AND acc_service IS NOT NULL THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no)
        VALUES (e_id, acc_service, 0, v_svc, r.venue, v_ln);
    END IF;

    UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
    cnt := cnt + 1;
  END LOOP;

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
