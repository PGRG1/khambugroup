CREATE OR REPLACE FUNCTION public.post_invoice_payment(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_uname text;
  p record;
  v_tenant uuid;
  acc_ap uuid;
  acc_bank uuid;
  acc_cn_clearing uuid;
  v_alloc_total numeric := 0;
  v_credit_total numeric := 0;
  v_cash_amount numeric;
  cash_entry uuid;
  cn_entry uuid;
  v_ln int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authorized: not signed in'; END IF;

  SELECT * INTO p FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  v_tenant := p.tenant_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Payment has no tenant_id'; END IF;

  IF NOT public.is_platform_admin() AND NOT EXISTS (
    SELECT 1 FROM public.tenant_members WHERE user_id = v_uid AND tenant_id = v_tenant
  ) THEN
    RAISE EXCEPTION 'Not authorized: caller is not a member of tenant %', v_tenant;
  END IF;

  IF p.journal_entry_id IS NOT NULL THEN
    RETURN jsonb_build_object('status','already_posted','journal_entry_id', p.journal_entry_id);
  END IF;

  SELECT COALESCE(SUM(amount_allocated),0), COALESCE(SUM(credit_note_amount_applied),0)
    INTO v_alloc_total, v_credit_total
    FROM public.payment_allocations
   WHERE payment_id = p_payment_id AND tenant_id = v_tenant;

  v_cash_amount := ROUND(COALESCE(p.amount,0)::numeric, 2);

  SELECT account_id INTO acc_ap FROM public.account_mapping_rules
    WHERE tenant_id = v_tenant AND rule_type = 'accounts_payable' LIMIT 1;
  IF acc_ap IS NULL THEN RAISE EXCEPTION 'Missing mapping rule: accounts_payable'; END IF;

  IF p.paid_from_account_id IS NOT NULL THEN
    SELECT linked_gl_account_id INTO acc_bank
      FROM public.bank_accounts WHERE id = p.paid_from_account_id AND tenant_id = v_tenant;
  END IF;
  IF acc_bank IS NULL AND p.payment_method IS NOT NULL THEN
    SELECT account_id INTO acc_bank FROM public.account_mapping_rules
      WHERE tenant_id = v_tenant AND rule_type = 'payment_method_cash'
        AND lower(btrim(match_key)) = lower(btrim(p.payment_method)) LIMIT 1;
  END IF;
  -- Default (blank match_key) cash/bank mapping catches Cash / Other / TBC.
  IF acc_bank IS NULL THEN
    SELECT account_id INTO acc_bank FROM public.account_mapping_rules
      WHERE tenant_id = v_tenant AND rule_type = 'payment_method_cash'
        AND COALESCE(btrim(match_key),'') = '' LIMIT 1;
  END IF;
  IF acc_bank IS NULL AND v_cash_amount > 0.005 THEN
    RAISE EXCEPTION 'No bank / cash account resolved (bank_account.linked_gl_account_id or payment_method_cash mapping required)';
  END IF;

  SELECT display_name INTO v_uname FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  IF v_cash_amount > 0.005 THEN
    INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, status, tenant_id, created_by, posted_at)
    VALUES (
      p.payment_date,
      'AP payment · '||COALESCE(p.reference_number, p.cheque_number, p.payment_method, p.id::text),
      'invoice_payment', p_payment_id::text, 'posted', v_tenant, v_uid, now()
    ) RETURNING id INTO cash_entry;

    v_ln := 1;
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no, memo, tenant_id)
    VALUES (cash_entry, acc_ap, v_cash_amount, 0, v_ln, 'AP settled', v_tenant);
    v_ln := v_ln + 1;
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no, memo, tenant_id)
    VALUES (cash_entry, acc_bank, 0, v_cash_amount, v_ln, COALESCE(p.payment_method,'Bank')||' outflow', v_tenant);

    UPDATE public.payments SET journal_entry_id = cash_entry WHERE id = p_payment_id;
  END IF;

  IF v_credit_total > 0.005 THEN
    SELECT account_id INTO acc_cn_clearing FROM public.account_mapping_rules
      WHERE tenant_id = v_tenant AND rule_type = 'credit_note_clearing' LIMIT 1;
    IF acc_cn_clearing IS NULL THEN acc_cn_clearing := acc_ap; END IF;

    INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, status, tenant_id, created_by, posted_at)
    VALUES (
      p.payment_date, 'Credit note applied on AP payment '||p_payment_id::text,
      'credit_note_application', p_payment_id::text, 'posted', v_tenant, v_uid, now()
    ) RETURNING id INTO cn_entry;

    v_ln := 1;
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no, memo, tenant_id)
    VALUES (cn_entry, acc_ap, v_credit_total, 0, v_ln, 'AP cleared by credit note', v_tenant);
    v_ln := v_ln + 1;
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, line_no, memo, tenant_id)
    VALUES (cn_entry, acc_cn_clearing, 0, v_credit_total, v_ln, 'Credit note consumed', v_tenant);

    UPDATE public.payment_allocations
       SET credit_note_journal_entry_id = cn_entry
     WHERE payment_id = p_payment_id AND tenant_id = v_tenant
       AND COALESCE(credit_note_amount_applied,0) > 0;

    UPDATE public.credit_notes cn
       SET journal_entry_id = cn_entry
      FROM public.payment_allocations a
     WHERE a.payment_id = p_payment_id AND a.credit_note_id = cn.id
       AND cn.tenant_id = v_tenant
       AND cn.journal_entry_id IS NULL;
  END IF;

  INSERT INTO public.ledger_audit_log (event_type, user_id, user_display_name, journal_entry_id, status, notes, tenant_id, amount)
  VALUES ('invoice_payment_posted', v_uid, v_uname, cash_entry, 'success',
          'Posted AP payment '||p_payment_id::text||' · cash '||v_cash_amount||' · credit '||v_credit_total,
          v_tenant, v_cash_amount + v_credit_total);

  RETURN jsonb_build_object('status','posted', 'cash_entry_id', cash_entry, 'credit_note_entry_id', cn_entry,
                            'cash_amount', v_cash_amount, 'credit_amount', v_credit_total);
END;
$function$;