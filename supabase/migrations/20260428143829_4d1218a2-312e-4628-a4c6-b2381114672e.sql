-- 0. Loosen rule_type check to include 'tips_payable'
ALTER TABLE public.account_mapping_rules DROP CONSTRAINT IF EXISTS account_mapping_rules_rule_type_check;
ALTER TABLE public.account_mapping_rules ADD CONSTRAINT account_mapping_rules_rule_type_check
  CHECK (rule_type IN (
    'sales_revenue','service_charge','sales_cash','sales_payment_method','sales_discount',
    'tips_payable',
    'payment_method_cash','invoice_expense','accounts_payable',
    'payroll_salary_expense','payroll_mpf_expense','salary_payable','mpf_payable',
    'manual_income','manual_expense','opening_equity','processor_fees'
  ));

-- 1. Wipe existing journal + mappings + COA
DELETE FROM public.journal_lines;
DELETE FROM public.journal_entries;
DELETE FROM public.account_mapping_rules;
DELETE FROM public.chart_of_accounts;

-- 2. Reseed Chart of Accounts (Revenue-focused, multi-venue)
INSERT INTO public.chart_of_accounts (code, name, account_type, normal_side, is_cash, sort_order) VALUES
  ('1020', 'Cash on Hand', 'asset', 'debit', true, 10),
  ('1210', 'Merchant Receivable – Visa', 'asset', 'debit', false, 21),
  ('1220', 'Merchant Receivable – Mastercard', 'asset', 'debit', false, 22),
  ('1230', 'Merchant Receivable – Amex', 'asset', 'debit', false, 23),
  ('1240', 'Merchant Receivable – UnionPay', 'asset', 'debit', false, 24),
  ('1250', 'Merchant Receivable – JCB', 'asset', 'debit', false, 25),
  ('1260', 'Merchant Receivable – Alipay', 'asset', 'debit', false, 26),
  ('1270', 'Merchant Receivable – WeChat', 'asset', 'debit', false, 27),
  ('1280', 'Merchant Receivable – PayMe', 'asset', 'debit', false, 28),
  ('2010', 'Accounts Payable', 'liability', 'credit', false, 30),
  ('2030', 'MPF Payable', 'liability', 'credit', false, 31),
  ('2040', 'Salary Payable', 'liability', 'credit', false, 32),
  ('2110', 'Tips Payable – Assembly', 'liability', 'credit', false, 41),
  ('2120', 'Tips Payable – Caliente', 'liability', 'credit', false, 42),
  ('2130', 'Tips Payable – Hanabi', 'liability', 'credit', false, 43),
  ('2140', 'Tips Payable – Events', 'liability', 'credit', false, 44),
  ('3010', 'Owner Equity', 'equity', 'credit', false, 50),
  ('3900', 'Retained Earnings', 'equity', 'credit', false, 51),
  ('4010', 'Sales – Assembly', 'revenue', 'credit', false, 61),
  ('4020', 'Sales – Caliente', 'revenue', 'credit', false, 62),
  ('4030', 'Sales – Hanabi', 'revenue', 'credit', false, 63),
  ('4040', 'Sales – Events', 'revenue', 'credit', false, 64),
  ('4110', 'Service Charge – Assembly', 'revenue', 'credit', false, 71),
  ('4120', 'Service Charge – Caliente', 'revenue', 'credit', false, 72),
  ('4130', 'Service Charge – Hanabi', 'revenue', 'credit', false, 73),
  ('4140', 'Service Charge – Events', 'revenue', 'credit', false, 74),
  ('4210', 'Sales Discounts – Assembly', 'revenue', 'debit', false, 81),
  ('4220', 'Sales Discounts – Caliente', 'revenue', 'debit', false, 82),
  ('4230', 'Sales Discounts – Hanabi', 'revenue', 'debit', false, 83),
  ('4240', 'Sales Discounts – Events', 'revenue', 'debit', false, 84),
  ('5000', 'Cost of Goods Sold', 'cogs', 'debit', false, 90),
  ('6010', 'Salaries Expense', 'opex', 'debit', false, 91),
  ('6020', 'MPF Expense', 'opex', 'debit', false, 92),
  ('6090', 'Other OpEx', 'opex', 'debit', false, 99);

-- 3. Reseed default account_mapping_rules
WITH a AS (SELECT code, id FROM public.chart_of_accounts)
INSERT INTO public.account_mapping_rules (rule_type, match_key, account_id)
SELECT * FROM (VALUES
  ('sales_revenue', 'Assembly', (SELECT id FROM a WHERE code='4010')),
  ('sales_revenue', 'Caliente', (SELECT id FROM a WHERE code='4020')),
  ('sales_revenue', 'Hanabi',   (SELECT id FROM a WHERE code='4030')),
  ('sales_revenue', 'Events',   (SELECT id FROM a WHERE code='4040')),
  ('service_charge', 'Assembly', (SELECT id FROM a WHERE code='4110')),
  ('service_charge', 'Caliente', (SELECT id FROM a WHERE code='4120')),
  ('service_charge', 'Hanabi',   (SELECT id FROM a WHERE code='4130')),
  ('service_charge', 'Events',   (SELECT id FROM a WHERE code='4140')),
  ('sales_discount', 'Assembly', (SELECT id FROM a WHERE code='4210')),
  ('sales_discount', 'Caliente', (SELECT id FROM a WHERE code='4220')),
  ('sales_discount', 'Hanabi',   (SELECT id FROM a WHERE code='4230')),
  ('sales_discount', 'Events',   (SELECT id FROM a WHERE code='4240')),
  ('tips_payable', 'Assembly', (SELECT id FROM a WHERE code='2110')),
  ('tips_payable', 'Caliente', (SELECT id FROM a WHERE code='2120')),
  ('tips_payable', 'Hanabi',   (SELECT id FROM a WHERE code='2130')),
  ('tips_payable', 'Events',   (SELECT id FROM a WHERE code='2140')),
  ('sales_cash', '', (SELECT id FROM a WHERE code='1020')),
  ('sales_payment_method', 'cash',       (SELECT id FROM a WHERE code='1020')),
  ('sales_payment_method', 'visa',       (SELECT id FROM a WHERE code='1210')),
  ('sales_payment_method', 'mastercard', (SELECT id FROM a WHERE code='1220')),
  ('sales_payment_method', 'amex',       (SELECT id FROM a WHERE code='1230')),
  ('sales_payment_method', 'union_pay',  (SELECT id FROM a WHERE code='1240')),
  ('sales_payment_method', 'jcb',        (SELECT id FROM a WHERE code='1250')),
  ('sales_payment_method', 'alipay',     (SELECT id FROM a WHERE code='1260')),
  ('sales_payment_method', 'wechat',     (SELECT id FROM a WHERE code='1270')),
  ('sales_payment_method', 'payme',      (SELECT id FROM a WHERE code='1280')),
  ('accounts_payable',       '', (SELECT id FROM a WHERE code='2010')),
  ('payroll_salary_expense', '', (SELECT id FROM a WHERE code='6010')),
  ('payroll_mpf_expense',    '', (SELECT id FROM a WHERE code='6020')),
  ('salary_payable',         '', (SELECT id FROM a WHERE code='2040')),
  ('mpf_payable',            '', (SELECT id FROM a WHERE code='2030')),
  ('opening_equity',         '', (SELECT id FROM a WHERE code='3010')),
  ('payment_method_cash',    '', (SELECT id FROM a WHERE code='1020'))
) AS t(rule_type, match_key, account_id);

-- 4. Replace rebuild function: Sales only (with tips), invoice/payroll paused
CREATE OR REPLACE FUNCTION public.rebuild_journal_from_operations()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  acc_sales uuid;
  acc_svc uuid;
  acc_disc uuid;
  acc_tips uuid;
  acc_cash uuid;
  acc_pm uuid;
  e_id uuid;
  r record;
  cnt int := 0;
  v_ln int;
  v_method text;
  v_amt numeric;
  v_card_total numeric;
  v_tip_alloc numeric;
  v_tip_remaining numeric;
  v_methods text[] := ARRAY['visa','mastercard','amex','union_pay','jcb','alipay','wechat','payme'];
  v_labels jsonb := '{"visa":"Visa","mastercard":"Mastercard","amex":"Amex","union_pay":"UnionPay","jcb":"JCB","alipay":"Alipay","wechat":"WeChat","payme":"PayMe"}'::jsonb;
BEGIN
  DELETE FROM public.journal_entries WHERE source_type <> 'manual';

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
    SELECT account_id INTO acc_cash FROM public.account_mapping_rules
      WHERE rule_type='sales_payment_method' AND match_key='cash' LIMIT 1;
    IF acc_cash IS NULL THEN
      SELECT account_id INTO acc_cash FROM public.account_mapping_rules
        WHERE rule_type='sales_cash' AND match_key='' LIMIT 1;
    END IF;

    IF acc_sales IS NULL THEN CONTINUE; END IF;

    v_card_total := r.m_visa + r.m_mastercard + r.m_amex + r.m_unionpay + r.m_jcb + r.m_alipay + r.m_wechat + r.m_payme;

    INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status)
      VALUES (r.d, 'Sales — '||r.venue, 'sales', r.d::text||'|'||r.venue, r.venue, 'draft')
      RETURNING id INTO e_id;

    v_ln := 0;
    v_tip_remaining := r.tips;

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
        SELECT account_id INTO acc_pm FROM public.account_mapping_rules
          WHERE rule_type='sales_payment_method' AND match_key=v_method LIMIT 1;
        IF acc_pm IS NOT NULL THEN
          IF v_card_total > 0 AND r.tips > 0 THEN
            v_tip_alloc := ROUND((v_amt / v_card_total) * r.tips, 2);
            v_tip_remaining := v_tip_remaining - v_tip_alloc;
          ELSE
            v_tip_alloc := 0;
          END IF;
          v_ln := v_ln + 1;
          INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo)
            VALUES (e_id, acc_pm, v_amt + v_tip_alloc, 0, r.venue, v_ln,
                    COALESCE(v_labels->>v_method, v_method));
        END IF;
      END IF;
    END LOOP;

    IF r.tips > 0 AND v_tip_remaining <> 0 THEN
      UPDATE public.journal_lines
        SET debit = debit + v_tip_remaining
        WHERE id = (SELECT id FROM public.journal_lines WHERE entry_id = e_id ORDER BY line_no DESC LIMIT 1);
    END IF;

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

    IF r.tips > 0 AND acc_tips IS NOT NULL THEN
      v_ln := v_ln + 1;
      INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no)
        VALUES (e_id, acc_tips, 0, r.tips, r.venue, v_ln);
    END IF;

    UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
    cnt := cnt + 1;
  END LOOP;

  RETURN jsonb_build_object('entries_created', cnt);
END;
$function$;