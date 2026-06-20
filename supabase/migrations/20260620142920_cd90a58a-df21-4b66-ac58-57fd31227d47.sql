-- 1. Register the existing Sales Reconciliation Suspense account as the 'suspense' mapping
INSERT INTO public.account_mapping_rules (rule_type, match_key, account_id, notes)
SELECT 'suspense', '__default__', '1c76af94-472f-4559-adfb-6a3850138121'::uuid, 'Auto-balancing account for sales journal imbalances'
WHERE NOT EXISTS (SELECT 1 FROM public.account_mapping_rules WHERE rule_type='suspense');

-- 2. Patch rebuild_journal_from_operations to:
--    a. Handle positive discounts (refunds) as credits to sales_discount
--    b. Handle negative card_tips correctly (debit when negative)
--    c. Always pick up suspense via either explicit mapping OR fallback to account name
CREATE OR REPLACE FUNCTION public.rebuild_journal_from_operations()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  acc_sales uuid; acc_svc uuid; acc_disc uuid; acc_tips uuid;
  acc_cash uuid; acc_clearing uuid; acc_pm uuid; acc_suspense uuid;
  acc_ap uuid; acc_pay_cash uuid;
  acc_proc_fee_default uuid; acc_bank_fee_default uuid;
  acc_fee uuid; acc_bank uuid;
  acc_inv_disc uuid; acc_inv_refund uuid;
  e_id uuid; r record; cnt int := 0; v_ln int;
  v_method text; v_amt numeric;
  v_total_debits numeric; v_total_credits numeric; v_imbalance numeric;
  v_methods text[] := ARRAY['visa','mastercard','amex','union_pay','jcb','alipay','wechat','payme'];
  v_labels jsonb := '{"visa":"Visa","mastercard":"Mastercard","amex":"Amex","union_pay":"UnionPay","jcb":"JCB","alipay":"Alipay","wechat":"WeChat","payme":"PayMe","cash":"Cash"}'::jsonb;
  inv record; line record;
  v_inv_unmapped int;
  v_ap_amount numeric;
  v_inv_disc numeric;
  v_inv_disc_acct uuid;
  sb record; bf record; sl record;
  v_proc_fee numeric; v_xfer_fee numeric;
  v_uid uuid := auth.uid();
  v_uname text;
  v_bank_amt numeric;
  v_pm_key text;
  v_gross numeric;
  v_entry_status text;
  v_mapping_status text;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not authorized: admin role required';
  END IF;

  SELECT display_name INTO v_uname FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  INSERT INTO public.ledger_audit_log (event_type, user_id, user_display_name, status, notes)
    VALUES ('ledger_rebuild_start', v_uid, v_uname, 'in_progress',
            'Rebuilding journal from operations (drafts only; posted entries preserved)');

  UPDATE public.payment_settlement_batches b
     SET clearing_journal_entry_id = NULL
   WHERE b.clearing_journal_entry_id IN (
     SELECT id FROM public.journal_entries
      WHERE source_type='settlement_clearing'
        AND status = 'draft'
        AND COALESCE(manually_adjusted,false)=false
   );
  DELETE FROM public.journal_lines
    WHERE entry_id IN (
      SELECT id FROM public.journal_entries
       WHERE source_type IN ('sales_summary','invoice','invoice_payment','settlement_clearing','bank_txn')
         AND status = 'draft'
         AND COALESCE(manually_adjusted,false)=false
    );
  DELETE FROM public.journal_entries
    WHERE source_type IN ('sales_summary','invoice','invoice_payment','settlement_clearing','bank_txn')
      AND status = 'draft'
      AND COALESCE(manually_adjusted,false)=false;

  SELECT account_id INTO acc_suspense FROM public.account_mapping_rules WHERE rule_type='suspense' LIMIT 1;
  IF acc_suspense IS NULL THEN
    SELECT id INTO acc_suspense FROM public.chart_of_accounts WHERE name ILIKE '%suspense%' LIMIT 1;
  END IF;
  SELECT account_id INTO acc_ap       FROM public.account_mapping_rules WHERE rule_type='accounts_payable' LIMIT 1;
  SELECT account_id INTO acc_pay_cash FROM public.account_mapping_rules WHERE rule_type='cash_payment_clearing' LIMIT 1;
  SELECT account_id INTO acc_proc_fee_default FROM public.account_mapping_rules WHERE rule_type='processor_fee_default' LIMIT 1;
  SELECT account_id INTO acc_bank_fee_default FROM public.account_mapping_rules WHERE rule_type='bank_transfer_fee_default' LIMIT 1;
  SELECT account_id INTO acc_inv_disc   FROM public.account_mapping_rules WHERE rule_type='invoice_discount' LIMIT 1;
  SELECT account_id INTO acc_inv_refund FROM public.account_mapping_rules WHERE rule_type='invoice_refund' LIMIT 1;

  -- ===== SALES SUMMARIES =====
  FOR r IN
    SELECT s.date::date AS entry_date, s.venue,
           ROUND(COALESCE(SUM(s.subtotal),0)::numeric, 2)        AS subtotal,
           ROUND(COALESCE(SUM(s.service_charge),0)::numeric, 2)  AS service_charge,
           ROUND(COALESCE(SUM(s.discount),0)::numeric, 2)        AS discount,
           ROUND(COALESCE(SUM(s.card_tips),0)::numeric, 2)       AS card_tips,
           ROUND(COALESCE(SUM(s.cash),0)::numeric,2)       AS m_cash,
           ROUND(COALESCE(SUM(s.visa),0)::numeric,2)       AS m_visa,
           ROUND(COALESCE(SUM(s.mastercard),0)::numeric,2) AS m_mastercard,
           ROUND(COALESCE(SUM(s.amex),0)::numeric,2)       AS m_amex,
           ROUND(COALESCE(SUM(s.union_pay),0)::numeric,2)  AS m_union_pay,
           ROUND(COALESCE(SUM(s.jcb),0)::numeric,2)        AS m_jcb,
           ROUND(COALESCE(SUM(s.alipay),0)::numeric,2)     AS m_alipay,
           ROUND(COALESCE(SUM(s.wechat),0)::numeric,2)     AS m_wechat,
           ROUND(COALESCE(SUM(s.payme),0)::numeric,2)      AS m_payme
    FROM public.sales_records s
    GROUP BY s.date::date, s.venue
    HAVING COALESCE(SUM(s.subtotal),0)+COALESCE(SUM(s.service_charge),0)+COALESCE(SUM(s.discount),0)+COALESCE(SUM(s.card_tips),0) <> 0
  LOOP
    IF EXISTS (SELECT 1 FROM public.journal_entries
               WHERE source_type='sales_summary'
                 AND source_id = r.entry_date::text||'__'||r.venue
                 AND (manually_adjusted = true OR status = 'posted')) THEN
      CONTINUE;
    END IF;

    SELECT account_id INTO acc_sales FROM public.account_mapping_rules WHERE rule_type='sales_revenue'  AND match_key=r.venue LIMIT 1;
    SELECT account_id INTO acc_svc   FROM public.account_mapping_rules WHERE rule_type='service_charge' AND match_key=r.venue LIMIT 1;
    SELECT account_id INTO acc_disc  FROM public.account_mapping_rules WHERE rule_type='sales_discount' AND match_key=r.venue LIMIT 1;
    SELECT account_id INTO acc_tips  FROM public.account_mapping_rules WHERE rule_type='tips_payable'   AND match_key=r.venue LIMIT 1;

    acc_cash := NULL;
    SELECT account_id INTO acc_cash FROM public.account_mapping_rules
      WHERE rule_type='cash_on_hand' AND match_key=r.venue LIMIT 1;
    IF acc_cash IS NULL THEN
      SELECT account_id INTO acc_cash FROM public.account_mapping_rules
        WHERE rule_type='cash_clearing' AND match_key=r.venue LIMIT 1;
    END IF;
    IF acc_cash IS NULL THEN
      SELECT account_id INTO acc_cash FROM public.account_mapping_rules
        WHERE rule_type='sales_payment_method' AND match_key='cash__'||r.venue LIMIT 1;
    END IF;
    IF acc_cash IS NULL THEN
      SELECT id INTO acc_cash FROM public.chart_of_accounts WHERE code='1020' LIMIT 1;
    END IF;

    acc_clearing := NULL;
    SELECT account_id INTO acc_clearing FROM public.account_mapping_rules
      WHERE rule_type='payment_settlement_clearing' AND match_key=r.venue LIMIT 1;

    v_mapping_status := 'mapped';
    IF acc_clearing IS NULL OR acc_sales IS NULL OR acc_svc IS NULL OR acc_cash IS NULL THEN
      v_mapping_status := 'missing';
    END IF;

    INSERT INTO public.journal_entries (entry_date,memo,source_type,source_id,venue,status)
      VALUES (r.entry_date,'Sales summary — '||r.venue,'sales_summary',
              r.entry_date::text||'__'||r.venue,r.venue,'draft')
      RETURNING id INTO e_id;
    v_ln := 0;

    -- Cash (sign-aware)
    IF r.m_cash <> 0 AND acc_cash IS NOT NULL THEN
      v_ln := v_ln+1;
      INSERT INTO public.journal_lines
        (entry_id,account_id,debit,credit,venue,line_no,memo,
         payment_method,source_amount,mapping_rule_type,mapping_match_key,mapping_status)
      VALUES (e_id, acc_cash,
              CASE WHEN r.m_cash>0 THEN r.m_cash ELSE 0 END,
              CASE WHEN r.m_cash<0 THEN ABS(r.m_cash) ELSE 0 END,
              r.venue, v_ln, 'Cash',
              'cash', r.m_cash, 'cash_on_hand', r.venue, 'mapped');
    END IF;

    -- Each non-cash method -> Payment Settlement Clearing
    FOREACH v_method IN ARRAY v_methods LOOP
      v_amt := CASE v_method
                 WHEN 'visa'       THEN r.m_visa
                 WHEN 'mastercard' THEN r.m_mastercard
                 WHEN 'amex'       THEN r.m_amex
                 WHEN 'union_pay'  THEN r.m_union_pay
                 WHEN 'jcb'        THEN r.m_jcb
                 WHEN 'alipay'     THEN r.m_alipay
                 WHEN 'wechat'     THEN r.m_wechat
                 WHEN 'payme'      THEN r.m_payme
                 ELSE 0
               END;
      IF v_amt IS NOT NULL AND v_amt <> 0 AND acc_clearing IS NOT NULL THEN
        v_ln := v_ln+1;
        INSERT INTO public.journal_lines
          (entry_id,account_id,debit,credit,venue,line_no,memo,
           payment_method,source_amount,mapping_rule_type,mapping_match_key,mapping_status)
        VALUES (e_id, acc_clearing,
                CASE WHEN v_amt>0 THEN v_amt ELSE 0 END,
                CASE WHEN v_amt<0 THEN ABS(v_amt) ELSE 0 END,
                r.venue, v_ln,
                COALESCE(v_labels->>v_method, v_method),
                v_method, v_amt,
                'payment_settlement_clearing', r.venue, 'mapped');
      END IF;
    END LOOP;

    -- Discount (sign-aware: negative discount = DR expense; positive = CR)
    IF r.discount <> 0 AND acc_disc IS NOT NULL THEN
      v_ln := v_ln+1;
      INSERT INTO public.journal_lines
        (entry_id,account_id,debit,credit,venue,line_no,memo,
         source_amount,mapping_rule_type,mapping_match_key,mapping_status)
      VALUES (e_id, acc_disc,
              CASE WHEN r.discount<0 THEN ABS(r.discount) ELSE 0 END,
              CASE WHEN r.discount>0 THEN r.discount ELSE 0 END,
              r.venue, v_ln,'Sales discount',
              r.discount,'sales_discount',r.venue,'mapped');
    END IF;

    -- Sales (sign-aware)
    IF r.subtotal <> 0 AND acc_sales IS NOT NULL THEN
      v_ln := v_ln+1;
      INSERT INTO public.journal_lines
        (entry_id,account_id,debit,credit,venue,line_no,memo,
         source_amount,mapping_rule_type,mapping_match_key,mapping_status)
      VALUES (e_id, acc_sales,
              CASE WHEN r.subtotal<0 THEN ABS(r.subtotal) ELSE 0 END,
              CASE WHEN r.subtotal>0 THEN r.subtotal ELSE 0 END,
              r.venue, v_ln,'Net sales',
              r.subtotal,'sales_revenue',r.venue,'mapped');
    END IF;

    -- Service charge (sign-aware)
    IF r.service_charge <> 0 AND acc_svc IS NOT NULL THEN
      v_ln := v_ln+1;
      INSERT INTO public.journal_lines
        (entry_id,account_id,debit,credit,venue,line_no,memo,
         source_amount,mapping_rule_type,mapping_match_key,mapping_status)
      VALUES (e_id, acc_svc,
              CASE WHEN r.service_charge<0 THEN ABS(r.service_charge) ELSE 0 END,
              CASE WHEN r.service_charge>0 THEN r.service_charge ELSE 0 END,
              r.venue, v_ln,'Service charge',
              r.service_charge,'service_charge',r.venue,'mapped');
    END IF;

    -- Card tips (sign-aware)
    IF r.card_tips <> 0 AND acc_tips IS NOT NULL THEN
      v_ln := v_ln+1;
      INSERT INTO public.journal_lines
        (entry_id,account_id,debit,credit,venue,line_no,memo,
         source_amount,mapping_rule_type,mapping_match_key,mapping_status)
      VALUES (e_id, acc_tips,
              CASE WHEN r.card_tips<0 THEN ABS(r.card_tips) ELSE 0 END,
              CASE WHEN r.card_tips>0 THEN r.card_tips ELSE 0 END,
              r.venue, v_ln,'Card tips',
              r.card_tips,'tips_payable',r.venue,'mapped');
    END IF;

    -- Auto-balance via suspense if needed
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO v_total_debits,v_total_credits FROM public.journal_lines WHERE entry_id=e_id;
    v_imbalance := ROUND(v_total_debits - v_total_credits,2);
    IF v_imbalance <> 0 THEN
      IF acc_suspense IS NULL THEN
        SELECT id INTO acc_suspense FROM public.chart_of_accounts WHERE name ILIKE '%suspense%' LIMIT 1;
      END IF;
      IF acc_suspense IS NOT NULL THEN
        v_ln := v_ln+1;
        IF v_imbalance > 0 THEN
          INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo,mapping_rule_type,mapping_status)
            VALUES (e_id,acc_suspense,0,v_imbalance,r.venue,v_ln,'Sales variance (auto-balance)','suspense','missing');
        ELSE
          INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo,mapping_rule_type,mapping_status)
            VALUES (e_id,acc_suspense,-v_imbalance,0,r.venue,v_ln,'Sales variance (auto-balance)','suspense','missing');
        END IF;
        v_mapping_status := 'missing';
      ELSE
        -- Can't balance; keep as draft and skip posting
        v_mapping_status := 'missing';
      END IF;
    END IF;

    -- Re-check balance; if still unbalanced (no suspense available), drop the entry rather than failing
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO v_total_debits,v_total_credits FROM public.journal_lines WHERE entry_id=e_id;
    IF ROUND(v_total_debits - v_total_credits,2) <> 0 THEN
      DELETE FROM public.journal_lines WHERE entry_id=e_id;
      DELETE FROM public.journal_entries WHERE id=e_id;
      CONTINUE;
    END IF;

    IF (SELECT COUNT(*) FROM public.journal_lines WHERE entry_id=e_id) < 2 THEN
      DELETE FROM public.journal_entries WHERE id=e_id;
    ELSE
      v_entry_status := CASE WHEN v_mapping_status='missing' THEN 'draft' ELSE 'posted' END;
      UPDATE public.journal_entries
         SET status = v_entry_status,
             memo  = 'Sales summary — '||r.venue||
                     CASE WHEN v_mapping_status='missing' THEN ' (needs review)' ELSE '' END
       WHERE id = e_id;
      cnt := cnt+1;
    END IF;
  END LOOP;

  -- Re-invoke the rest of the original rebuild (invoices, payments, settlements, bank) unchanged
  PERFORM public._rebuild_journal_invoices_and_bank();

  INSERT INTO public.ledger_audit_log (event_type, user_id, user_display_name, status, notes)
    VALUES ('ledger_rebuild_done', v_uid, v_uname, 'success',
            'Rebuilt '||cnt||' sales summary entries');

  RETURN jsonb_build_object('ok', true, 'sales_entries', cnt);
END;
$function$;