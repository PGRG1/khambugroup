-- 1) Normalize existing card_tips values to negative (mirror discount convention)
UPDATE public.sales_records SET card_tips = -ABS(card_tips) WHERE card_tips > 0;

-- 2) Update the journal rebuild function to tolerate either sign by using ABS()
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
  acc_suspense uuid;
  e_id uuid;
  r record;
  cnt int := 0;
  v_ln int;
  v_method text;
  v_amt numeric;
  v_total_debits numeric;
  v_total_credits numeric;
  v_imbalance numeric;
  v_methods text[] := ARRAY['visa','mastercard','amex','union_pay','jcb','alipay','wechat','payme'];
  v_labels jsonb := '{"visa":"Visa","mastercard":"Mastercard","amex":"Amex","union_pay":"UnionPay","jcb":"JCB","alipay":"Alipay","wechat":"WeChat","payme":"PayMe"}'::jsonb;
BEGIN
  DELETE FROM public.journal_entries WHERE source_type <> 'manual';

  SELECT id INTO acc_suspense FROM public.chart_of_accounts WHERE code='1900' LIMIT 1;

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
        SELECT account_id INTO acc_pm FROM public.account_mapping_rules
          WHERE rule_type='sales_payment_method' AND match_key=v_method LIMIT 1;
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

    -- Card tips: use ABS() so it works whether tips are stored positive or negative
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

  RETURN jsonb_build_object('entries_created', cnt);
END;
$function$;

-- 3) Re-run the rebuild so the trial balance immediately reflects normalized tips
SELECT public.rebuild_journal_from_operations();