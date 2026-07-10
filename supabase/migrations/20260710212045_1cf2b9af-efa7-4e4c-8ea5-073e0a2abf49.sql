
-- Fix post_expense_bill and post_vendor_statement to use correct column names
DROP FUNCTION IF EXISTS public.post_expense_bill(uuid);

CREATE OR REPLACE FUNCTION public.post_expense_bill(p_bill_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill public.expense_bills%ROWTYPE;
  v_je_id uuid;
  v_tenant uuid;
  v_ap_account uuid;
  v_unmapped int;
  v_alloc_total numeric;
  v_actor uuid := auth.uid();
BEGIN
  SELECT * INTO v_bill FROM public.expense_bills WHERE id = p_bill_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bill % not found', p_bill_id; END IF;
  IF v_bill.approval_status = 'posted' THEN
    RETURN v_bill.journal_entry_id;
  END IF;
  IF v_bill.approval_status NOT IN ('approved','draft','pending_review') THEN
    RAISE EXCEPTION 'Bill % is % and cannot be posted', p_bill_id, v_bill.approval_status;
  END IF;

  v_tenant := v_bill.tenant_id;

  SELECT count(*) INTO v_unmapped
  FROM public.expense_bill_allocations
  WHERE bill_id = p_bill_id AND (account_id IS NULL OR expense_category IS NULL OR trim(expense_category) = '');
  IF v_unmapped > 0 THEN
    RAISE EXCEPTION 'Bill has % allocation line(s) missing a category or GL account. Fix them before posting.', v_unmapped;
  END IF;

  SELECT COALESCE(sum(amount),0) INTO v_alloc_total FROM public.expense_bill_allocations WHERE bill_id = p_bill_id;
  IF abs(v_alloc_total - COALESCE(v_bill.subtotal,0)) > 0.01
     AND abs(v_alloc_total - (COALESCE(v_bill.total_amount,0) - COALESCE(v_bill.tax_amount,0))) > 0.01 THEN
    RAISE EXCEPTION 'Allocations (%) do not match bill subtotal (%)', v_alloc_total, v_bill.subtotal;
  END IF;

  SELECT id INTO v_ap_account
  FROM public.chart_of_accounts
  WHERE tenant_id = v_tenant AND (code = '2000' OR lower(name) LIKE '%accounts payable%')
  ORDER BY code
  LIMIT 1;
  IF v_ap_account IS NULL THEN
    RAISE EXCEPTION 'Accounts Payable account not found. Add one to Chart of Accounts (code 2000).';
  END IF;

  INSERT INTO public.journal_entries (tenant_id, entry_date, memo, source_type, source_id, created_by, status, posted_at)
  VALUES (v_tenant, v_bill.bill_date,
          'Bill: ' || COALESCE(v_bill.vendor_name,'') || ' ' || COALESCE(v_bill.bill_number,''),
          'expense_bill', v_bill.id, v_actor, 'posted', now())
  RETURNING id INTO v_je_id;

  INSERT INTO public.journal_lines (tenant_id, entry_id, account_id, debit, credit, memo, venue, line_no)
  SELECT v_tenant, v_je_id, a.account_id, a.amount, 0,
         COALESCE(a.notes, a.expense_category), a.venue, a.line_no
  FROM public.expense_bill_allocations a
  WHERE a.bill_id = p_bill_id
  ORDER BY a.line_no;

  INSERT INTO public.journal_lines (tenant_id, entry_id, account_id, debit, credit, memo, line_no)
  VALUES (v_tenant, v_je_id, v_ap_account, 0, v_bill.total_amount, 'AP: ' || COALESCE(v_bill.vendor_name,''), 999);

  UPDATE public.expense_bills
     SET approval_status = 'posted', posted_at = now(), posted_by = v_actor, journal_entry_id = v_je_id
   WHERE id = p_bill_id;

  INSERT INTO public.expense_bill_audit (bill_id, event_type, actor_id, details, tenant_id)
  VALUES (p_bill_id, 'posted', v_actor, jsonb_build_object('journal_entry_id', v_je_id), v_tenant);

  RETURN v_je_id;
END;
$$;

DROP FUNCTION IF EXISTS public.post_vendor_statement(uuid);

CREATE OR REPLACE FUNCTION public.post_vendor_statement(p_statement_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stmt public.expense_vendor_statements%ROWTYPE;
  v_je_id uuid;
  v_ap uuid;
  v_late_expense uuid;
  v_default_expense uuid;
  v_actor uuid := auth.uid();
BEGIN
  SELECT * INTO v_stmt FROM public.expense_vendor_statements WHERE id = p_statement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Statement % not found', p_statement_id; END IF;
  IF v_stmt.approval_status = 'posted' THEN RETURN v_stmt.posted_journal_entry_id; END IF;

  IF COALESCE(v_stmt.current_period_charges,0) = 0 AND COALESCE(v_stmt.late_fees,0) = 0 THEN
    RAISE EXCEPTION 'Statement has zero current-period charges and no late fees; nothing to post.';
  END IF;

  SELECT id INTO v_ap FROM public.chart_of_accounts
  WHERE tenant_id = v_stmt.tenant_id AND (code = '2000' OR lower(name) LIKE '%accounts payable%')
  ORDER BY code LIMIT 1;
  IF v_ap IS NULL THEN RAISE EXCEPTION 'Accounts Payable account not found (code 2000).'; END IF;

  SELECT id INTO v_default_expense FROM public.chart_of_accounts
  WHERE tenant_id = v_stmt.tenant_id AND account_type = 'expense'
  ORDER BY code LIMIT 1;
  IF v_default_expense IS NULL THEN RAISE EXCEPTION 'No expense account found in Chart of Accounts.'; END IF;

  SELECT id INTO v_late_expense FROM public.chart_of_accounts
  WHERE tenant_id = v_stmt.tenant_id AND (lower(name) LIKE '%late%fee%' OR lower(name) LIKE '%interest%expense%')
  ORDER BY code LIMIT 1;
  v_late_expense := COALESCE(v_late_expense, v_default_expense);

  INSERT INTO public.journal_entries (tenant_id, entry_date, memo, source_type, source_id, created_by, status, posted_at)
  VALUES (v_stmt.tenant_id, v_stmt.statement_date,
          'Vendor statement: ' || COALESCE(v_stmt.vendor_name,''),
          'vendor_statement', v_stmt.id, v_actor, 'posted', now())
  RETURNING id INTO v_je_id;

  IF COALESCE(v_stmt.current_period_charges,0) <> 0 THEN
    INSERT INTO public.journal_lines (tenant_id, entry_id, account_id, debit, credit, memo, line_no)
    VALUES (v_stmt.tenant_id, v_je_id, v_default_expense, v_stmt.current_period_charges, 0,
            'Current charges: ' || COALESCE(v_stmt.vendor_name,''), 1);
  END IF;
  IF COALESCE(v_stmt.late_fees,0) <> 0 THEN
    INSERT INTO public.journal_lines (tenant_id, entry_id, account_id, debit, credit, memo, line_no)
    VALUES (v_stmt.tenant_id, v_je_id, v_late_expense, v_stmt.late_fees, 0,
            'Late fees: ' || COALESCE(v_stmt.vendor_name,''), 2);
  END IF;

  INSERT INTO public.journal_lines (tenant_id, entry_id, account_id, debit, credit, memo, line_no)
  VALUES (v_stmt.tenant_id, v_je_id, v_ap, 0,
          COALESCE(v_stmt.current_period_charges,0) + COALESCE(v_stmt.late_fees,0),
          'AP: ' || COALESCE(v_stmt.vendor_name,''), 999);

  UPDATE public.expense_vendor_statements
     SET approval_status = 'posted', posted_journal_entry_id = v_je_id
   WHERE id = p_statement_id;

  RETURN v_je_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_expense_bill(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_vendor_statement(uuid) TO authenticated;
