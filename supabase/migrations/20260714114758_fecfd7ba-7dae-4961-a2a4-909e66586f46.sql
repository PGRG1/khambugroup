
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS enforce_expense_sod boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.post_expense_bill(p_bill_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bill public.expense_bills%ROWTYPE;
  v_je_id uuid;
  v_tenant uuid;
  v_ap_account uuid;
  v_unmapped int;
  v_alloc_total numeric;
  v_actor uuid := auth.uid();
  v_enforce_sod boolean;
BEGIN
  SELECT * INTO v_bill FROM public.expense_bills WHERE id = p_bill_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bill % not found', p_bill_id; END IF;

  -- Idempotency: already posted
  IF v_bill.approval_status = 'posted' THEN
    RETURN v_bill.journal_entry_id;
  END IF;

  -- Approval gate: must be explicitly approved
  IF v_bill.approval_status <> 'approved' THEN
    RAISE EXCEPTION 'Bill must be approved before it can be posted (current status: %)', v_bill.approval_status;
  END IF;

  v_tenant := v_bill.tenant_id;

  -- Segregation of duties (four-eyes) — configurable per tenant
  SELECT COALESCE(enforce_expense_sod, false) INTO v_enforce_sod
  FROM public.tenants WHERE id = v_tenant;

  IF COALESCE(v_enforce_sod, false)
     AND v_actor IS NOT NULL
     AND v_bill.approved_by IS NOT NULL
     AND v_actor = v_bill.approved_by THEN
    RAISE EXCEPTION 'Segregation of duties: the bill was approved by you — a different user must post it.';
  END IF;

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
  VALUES (p_bill_id, 'posted', v_actor, jsonb_build_object('journal_entry_id', v_je_id, 'sod_enforced', COALESCE(v_enforce_sod,false)), v_tenant);

  RETURN v_je_id;
END;
$function$;
