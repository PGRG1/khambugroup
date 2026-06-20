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

    -- Discount: sign-aware (negative discount = DR; positive = CR)
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

    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO v_total_debits,v_total_credits FROM public.journal_lines WHERE entry_id=e_id;
    v_imbalance := ROUND(v_total_debits - v_total_credits,2);
    IF v_imbalance <> 0 AND acc_suspense IS NOT NULL THEN
      v_ln := v_ln+1;
      IF v_imbalance > 0 THEN
        INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo,mapping_rule_type,mapping_status)
          VALUES (e_id,acc_suspense,0,v_imbalance,r.venue,v_ln,'Sales variance (auto-balance)','suspense','missing');
      ELSE
        INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo,mapping_rule_type,mapping_status)
          VALUES (e_id,acc_suspense,-v_imbalance,0,r.venue,v_ln,'Sales variance (auto-balance)','suspense','missing');
      END IF;
      v_mapping_status := 'missing';
    END IF;

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

  -- ===== INVOICES =====
  IF acc_ap IS NOT NULL THEN
    FOR inv IN
      SELECT i.id, i.invoice_date, i.venue, i.invoice_number, i.supplier_id,
             ROUND(i.total_amount::numeric,2) AS total_amount,
             ROUND(COALESCE(i.discount,0)::numeric,2) AS discount,
             COALESCE(i.discount_type,'discount') AS discount_type,
             COALESCE(s.name,'') AS supplier_name
      FROM public.invoices i LEFT JOIN public.suppliers s ON s.id = i.supplier_id WHERE i.status IN ('paid','unpaid')
    LOOP
      IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source_type='invoice' AND source_id=inv.id::text AND (manually_adjusted=true OR status='posted')) THEN CONTINUE; END IF;
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

      v_inv_disc := COALESCE(inv.discount,0);
      IF v_inv_disc <> 0 THEN
        v_inv_disc_acct := CASE WHEN inv.discount_type = 'refund' THEN acc_inv_refund ELSE acc_inv_disc END;
        IF v_inv_disc_acct IS NOT NULL THEN
          v_ln := v_ln+1;
          IF v_inv_disc > 0 THEN
            INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo)
            VALUES (e_id, v_inv_disc_acct, 0, ABS(v_inv_disc), inv.venue, v_ln,
                    CASE WHEN inv.discount_type='refund' THEN 'Supplier refund' ELSE 'Purchase discount' END);
          ELSE
            INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo)
            VALUES (e_id, v_inv_disc_acct, ABS(v_inv_disc), 0, inv.venue, v_ln,
                    CASE WHEN inv.discount_type='refund' THEN 'Supplier refund reversal' ELSE 'Purchase discount reversal' END);
          END IF;
        END IF;
      END IF;

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
      SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO v_total_debits,v_total_credits FROM public.journal_lines WHERE entry_id=e_id;
      IF ROUND(v_total_debits - v_total_credits,2) <> 0 THEN
        DELETE FROM public.journal_lines WHERE entry_id=e_id;
        DELETE FROM public.journal_entries WHERE id=e_id;
        CONTINUE;
      END IF;
      IF (SELECT COUNT(*) FROM public.journal_lines WHERE entry_id=e_id) < 2 THEN
        DELETE FROM public.journal_entries WHERE id=e_id;
      ELSE
        UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
        cnt := cnt+1;
      END IF;
    END LOOP;

    -- ===== INVOICE PAYMENTS =====
    FOR r IN
      SELECT p.id, p.payment_date, ROUND(p.amount::numeric,2) AS amount, p.payment_method, i.venue, i.invoice_number, COALESCE(s.name,'') AS supplier_name
      FROM public.invoice_payments p LEFT JOIN public.invoices i ON i.id=p.invoice_id LEFT JOIN public.suppliers s ON s.id=i.supplier_id WHERE p.amount<>0
    LOOP
      IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source_type='invoice_payment' AND source_id=r.id::text AND (manually_adjusted=true OR status='posted')) THEN CONTINUE; END IF;
      INSERT INTO public.journal_entries (entry_date,memo,source_type,source_id,venue,status)
        VALUES (r.payment_date,'Payment for '||COALESCE(r.invoice_number,'')||' — '||r.supplier_name,'invoice_payment',r.id::text,r.venue,'draft') RETURNING id INTO e_id;
      v_ln := 0;
      v_ln := v_ln+1;
      IF r.amount > 0 THEN
        INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_ap,r.amount,0,r.venue,v_ln,'AP settle');
      ELSE
        INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_ap,0,ABS(r.amount),r.venue,v_ln,'AP settle reversal');
      END IF;
      IF r.payment_method='cash' AND acc_pay_cash IS NOT NULL THEN
        v_ln := v_ln+1;
        IF r.amount > 0 THEN
          INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_pay_cash,0,r.amount,r.venue,v_ln,'Cash payment');
        ELSE
          INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_pay_cash,ABS(r.amount),0,r.venue,v_ln,'Cash payment reversal');
        END IF;
      ELSE
        acc_bank := NULL;
        SELECT account_id INTO acc_bank FROM public.account_mapping_rules
          WHERE rule_type='bank_payment_clearing' AND (match_key=r.payment_method OR match_key='')
          ORDER BY (match_key=r.payment_method) DESC LIMIT 1;
        IF acc_bank IS NOT NULL THEN
          v_ln := v_ln+1;
          IF r.amount > 0 THEN
            INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_bank,0,r.amount,r.venue,v_ln,'Bank payment');
          ELSE
            INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_bank,ABS(r.amount),0,r.venue,v_ln,'Bank payment reversal');
          END IF;
        ELSIF acc_suspense IS NOT NULL THEN
          v_ln := v_ln+1;
          IF r.amount > 0 THEN
            INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_suspense,0,r.amount,r.venue,v_ln,'Unmapped bank payment');
          ELSE
            INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_suspense,ABS(r.amount),0,r.venue,v_ln,'Unmapped bank payment reversal');
          END IF;
        END IF;
      END IF;
      SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO v_total_debits,v_total_credits FROM public.journal_lines WHERE entry_id=e_id;
      IF ROUND(v_total_debits - v_total_credits,2) <> 0 THEN
        DELETE FROM public.journal_lines WHERE entry_id=e_id;
        DELETE FROM public.journal_entries WHERE id=e_id;
        CONTINUE;
      END IF;
      IF (SELECT COUNT(*) FROM public.journal_lines WHERE entry_id=e_id) < 2 THEN
        DELETE FROM public.journal_entries WHERE id=e_id;
      ELSE
        UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
        cnt := cnt+1;
      END IF;
    END LOOP;
  END IF;

  -- ===== SETTLEMENT CLEARING =====
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
      WHERE source_type='settlement_clearing' AND source_id = sb.id::text AND (manually_adjusted = true OR status='posted')
    ) THEN CONTINUE; END IF;

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
                'Zero-value settlement batch '||sb.id::text);
      CONTINUE;
    END IF;

    acc_clearing := NULL;
    SELECT account_id INTO acc_clearing FROM public.account_mapping_rules
      WHERE rule_type='payment_settlement_clearing' AND match_key=sb.merchant_venue LIMIT 1;

    INSERT INTO public.journal_entries (entry_date,memo,source_type,source_id,venue,status)
      VALUES (sb.settlement_date,
              'Settlement clearing — '||sb.proc_name||' / '||COALESCE(sb.merchant_name,''),
              'settlement_clearing', sb.id::text, sb.merchant_venue, 'draft')
      RETURNING id INTO e_id;
    v_ln := 0;

    acc_bank := NULL;
    SELECT linked_gl_account_id INTO acc_bank FROM public.bank_accounts WHERE id = sb.bank_acc_id;
    IF acc_bank IS NOT NULL AND v_bank_amt > 0 THEN
      v_ln := v_ln+1;
      INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo)
      VALUES (e_id, acc_bank, v_bank_amt, 0, sb.merchant_venue, v_ln, 'Bank settlement received');
    END IF;

    IF v_proc_fee > 0 THEN
      acc_fee := COALESCE(sb.fee_account_id, acc_proc_fee_default);
      IF acc_fee IS NOT NULL THEN
        v_ln := v_ln+1;
        INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo)
        VALUES (e_id, acc_fee, v_proc_fee, 0, sb.merchant_venue, v_ln, sb.proc_name||' processing fee');
      END IF;
    END IF;
    IF v_xfer_fee > 0 AND acc_bank_fee_default IS NOT NULL THEN
      v_ln := v_ln+1;
      INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo)
      VALUES (e_id, acc_bank_fee_default, v_xfer_fee, 0, sb.merchant_venue, v_ln, 'Bank transfer fee');
    END IF;

    IF acc_clearing IS NOT NULL THEN
      FOR sl IN
        SELECT l.gross_amount AS amount, l.payment_type AS payment_method
        FROM public.payment_settlement_lines l
        WHERE l.batch_id = sb.id
      LOOP
        v_pm_key := lower(COALESCE(sl.payment_method,''));
        v_pm_key := regexp_replace(v_pm_key, '_foreign$', '');
        IF v_pm_key = '' OR sl.amount = 0 THEN CONTINUE; END IF;
        v_ln := v_ln+1;
        IF ROUND(sl.amount::numeric,2) > 0 THEN
          INSERT INTO public.journal_lines
            (entry_id,account_id,debit,credit,venue,line_no,memo,
             payment_method,source_amount,mapping_rule_type,mapping_match_key,mapping_status)
          VALUES (e_id, acc_clearing, 0, ROUND(sl.amount::numeric,2),
                  sb.merchant_venue, v_ln,
                  COALESCE(v_labels->>v_pm_key, v_pm_key)||' clearing',
                  v_pm_key, sl.amount, 'payment_settlement_clearing', sb.merchant_venue, 'mapped');
        ELSE
          INSERT INTO public.journal_lines
            (entry_id,account_id,debit,credit,venue,line_no,memo,
             payment_method,source_amount,mapping_rule_type,mapping_match_key,mapping_status)
          VALUES (e_id, acc_clearing, ABS(ROUND(sl.amount::numeric,2)), 0,
                  sb.merchant_venue, v_ln,
                  COALESCE(v_labels->>v_pm_key, v_pm_key)||' clearing reversal',
                  v_pm_key, sl.amount, 'payment_settlement_clearing', sb.merchant_venue, 'mapped');
        END IF;
      END LOOP;
    END IF;

    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO v_total_debits,v_total_credits FROM public.journal_lines WHERE entry_id=e_id;
    v_imbalance := ROUND(v_total_debits - v_total_credits,2);
    IF v_imbalance <> 0 AND acc_suspense IS NOT NULL THEN
      v_ln := v_ln+1;
      IF v_imbalance > 0 THEN INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_suspense,0,v_imbalance,sb.merchant_venue,v_ln,'Δ');
      ELSE INSERT INTO public.journal_lines (entry_id,account_id,debit,credit,venue,line_no,memo) VALUES (e_id,acc_suspense,-v_imbalance,0,sb.merchant_venue,v_ln,'Δ'); END IF;
    END IF;
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO v_total_debits,v_total_credits FROM public.journal_lines WHERE entry_id=e_id;
    IF ROUND(v_total_debits - v_total_credits,2) <> 0 THEN
      DELETE FROM public.journal_lines WHERE entry_id=e_id;
      DELETE FROM public.journal_entries WHERE id=e_id;
      CONTINUE;
    END IF;
    IF (SELECT COUNT(*) FROM public.journal_lines WHERE entry_id=e_id) < 2 THEN
      DELETE FROM public.journal_entries WHERE id=e_id;
    ELSE
      UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
      UPDATE public.payment_settlement_batches SET clearing_journal_entry_id=e_id WHERE id=sb.id;
      cnt := cnt+1;
    END IF;
  END LOOP;

  -- ===== UNCLASSIFIED BANK TXNS =====
  FOR bf IN
    SELECT bt.id, bt.txn_date, bt.description, bt.money_in, bt.money_out, bt.bank_account_id,
           ba.linked_gl_account_id AS bank_acct,
           bt.suggested_category AS suggested_account_id
    FROM public.bank_transactions bt
    LEFT JOIN public.bank_accounts ba ON ba.id = bt.bank_account_id
    WHERE bt.status IN ('classified','approved')
      AND bt.matched_record_id IS NULL
      AND bt.journal_entry_id IS NULL
  LOOP
    IF bf.bank_acct IS NULL THEN CONTINUE; END IF;
    IF bf.suggested_account_id IS NULL THEN CONTINUE; END IF;
    INSERT INTO public.journal_entries (entry_date,memo,source_type,source_id,venue,status)
      VALUES (bf.txn_date, 'Bank txn — '||LEFT(COALESCE(bf.description,''),60), 'bank_txn', bf.id::text, NULL, 'draft')
      RETURNING id INTO e_id;
    v_ln := 0;
    IF COALESCE(bf.money_in,0) > 0 THEN
      v_ln:=v_ln+1; INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,line_no,memo) VALUES (e_id, bf.bank_acct, ROUND(bf.money_in::numeric,2), 0, v_ln, 'Bank in');
      v_ln:=v_ln+1; INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,line_no,memo) VALUES (e_id, bf.suggested_account_id::uuid, 0, ROUND(bf.money_in::numeric,2), v_ln, 'Classified');
    ELSIF COALESCE(bf.money_out,0) > 0 THEN
      v_ln:=v_ln+1; INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,line_no,memo) VALUES (e_id, bf.suggested_account_id::uuid, ROUND(bf.money_out::numeric,2), 0, v_ln, 'Classified');
      v_ln:=v_ln+1; INSERT INTO public.journal_lines(entry_id,account_id,debit,credit,line_no,memo) VALUES (e_id, bf.bank_acct, 0, ROUND(bf.money_out::numeric,2), v_ln, 'Bank out');
    END IF;
    IF (SELECT COUNT(*) FROM public.journal_lines WHERE entry_id=e_id) < 2 THEN
      DELETE FROM public.journal_entries WHERE id=e_id;
    ELSE
      UPDATE public.journal_entries SET status='posted' WHERE id=e_id;
      UPDATE public.bank_transactions SET journal_entry_id=e_id WHERE id=bf.id;
      cnt := cnt+1;
    END IF;
  END LOOP;

  INSERT INTO public.ledger_audit_log (event_type, user_id, user_display_name, status, notes)
    VALUES ('ledger_rebuild_complete', v_uid, v_uname, 'success', 'Rebuilt '||cnt::text||' journal entries');

  RETURN jsonb_build_object('success', true, 'entries_created', cnt, 'entries_posted', cnt);
END;
$function$;