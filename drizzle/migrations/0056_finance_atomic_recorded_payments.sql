CREATE OR REPLACE FUNCTION public.finance_record_owed_payment(p_tenant uuid,p_date date,p_method text,p_account uuid,p_amount numeric,p_reference text,p_items jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); x jsonb; c jsonb; sid uuid; amt numeric; cred numeric; due numeric; inv public.invoices; bill public.expense_bills; pay public.hr_payroll; claim public.staff_reimbursements; cn public.credit_notes; bank public.bank_accounts; j uuid; pid uuid; bid uuid; acc uuid; result jsonb:='[]'; allocs jsonb; g record; ref text:=coalesce(p_reference,'');
BEGIN
IF uid IS NULL OR NOT public.has_role(uid,'admin') OR NOT (public.user_has_tenant(uid,p_tenant) OR public.is_super_admin(uid)) THEN RAISE EXCEPTION 'Finance access required';END IF;
IF EXISTS(SELECT 1 FROM public.user_access_control WHERE tenant_id=p_tenant AND user_id=uid AND status='disabled') THEN RAISE EXCEPTION 'Account disabled';END IF;
IF p_date IS NULL OR p_method NOT IN('bank_transfer','cash','cheque') OR p_amount IS NULL OR p_amount<0 OR p_amount<>round(p_amount,2) OR p_amount>100000000 THEN RAISE EXCEPTION 'Enter valid payment details';END IF;
IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)=0 OR jsonb_array_length(p_items)>200 THEN RAISE EXCEPTION 'Select up to 200 items';END IF;
IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) a GROUP BY a->>'source',a->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Duplicate selected items';END IF;
IF length(ref)>500 THEN RAISE EXCEPTION 'Reference too long';END IF;
PERFORM public.finance_assert_open(p_tenant,p_date);PERFORM pg_advisory_xact_lock(hashtextextended('finance-payments:'||p_tenant::text,0));
IF p_amount>0 AND p_method<>'cash' THEN SELECT * INTO bank FROM public.bank_accounts WHERE id=p_account AND tenant_id=p_tenant AND is_active;IF NOT FOUND OR bank.linked_gl_account_id IS NULL THEN RAISE EXCEPTION 'Choose an account linked to the books';END IF;END IF;
FOR x IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'source',value->>'id' LOOP
sid:=(x->>'id')::uuid;amt:=(x->>'amount')::numeric;cred:=0;
IF amt IS NULL OR amt<0 OR amt<>round(amt,2) THEN RAISE EXCEPTION 'Invalid allocation';END IF;
IF jsonb_typeof(x->'credits') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid credits';END IF;
IF x->>'source'='supplier' THEN
SELECT * INTO inv FROM public.invoices WHERE id=sid AND tenant_id=p_tenant FOR UPDATE;
IF NOT FOUND OR inv.review_status IS DISTINCT FROM 'Approved' OR coalesce(inv.payment_status,'')='voided' OR inv.invoice_date>p_date THEN RAISE EXCEPTION 'Supplier invoice is not eligible';END IF;
due:=greatest(0,inv.total_amount-coalesce(inv.amount_paid,0)-coalesce(inv.held_amount,0));
FOR c IN SELECT value FROM jsonb_array_elements(x->'credits') LOOP
SELECT * INTO cn FROM public.credit_notes WHERE id=(c->>'id')::uuid AND tenant_id=p_tenant AND supplier_id=inv.supplier_id FOR UPDATE;
IF NOT FOUND OR cn.status<>'approved' OR cn.credit_note_date>p_date OR (c->>'amount')::numeric<=0 OR (c->>'amount')::numeric<>round((c->>'amount')::numeric,2) THEN RAISE EXCEPTION 'Credit is not eligible';END IF;
IF (SELECT coalesce(sum((cc->>'amount')::numeric),0) FROM jsonb_array_elements(p_items) ii CROSS JOIN LATERAL jsonb_array_elements(ii->'credits') cc WHERE cc->>'id'=c->>'id')>cn.remaining_balance THEN RAISE EXCEPTION 'Credit balance changed';END IF;
cred:=cred+(c->>'amount')::numeric;END LOOP;
ELSIF x->>'source'='bill' THEN
SELECT * INTO bill FROM public.expense_bills WHERE id=sid AND tenant_id=p_tenant FOR UPDATE;
IF NOT FOUND OR bill.approval_status<>'posted' OR bill.bill_date>p_date OR NOT EXISTS(SELECT 1 FROM public.journal_entries WHERE id=bill.journal_entry_id AND tenant_id=p_tenant AND status='posted') THEN RAISE EXCEPTION 'Bill must be booked first';END IF;due:=greatest(0,bill.total_amount-bill.paid_amount);
ELSIF x->>'source' IN('salary','mpf') THEN
SELECT * INTO pay FROM public.hr_payroll WHERE id=sid AND tenant_id=p_tenant FOR UPDATE;
IF NOT FOUND OR pay.accrual_journal_entry_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.journal_entries WHERE id=pay.accrual_journal_entry_id AND tenant_id=p_tenant AND status='posted') THEN RAISE EXCEPTION 'Payroll must be approved and booked first';END IF;
due:=CASE WHEN x->>'source'='salary' THEN greatest(0,pay.net_salary-coalesce(pay.salary_paid_amount,0)) ELSE greatest(0,pay.mpf_employee+pay.mpf_employer-coalesce(pay.mpf_paid_amount,0)) END;
ELSIF x->>'source'='staff' THEN
SELECT * INTO claim FROM public.staff_reimbursements WHERE id=sid AND tenant_id=p_tenant FOR UPDATE;
IF NOT FOUND OR claim.approval_status<>'approved' OR claim.status<>'owing' OR NOT EXISTS(SELECT 1 FROM public.journal_entries WHERE id=claim.journal_entry_id AND tenant_id=p_tenant AND status='posted') THEN RAISE EXCEPTION 'Claim must be approved first';END IF;due:=claim.amount;
IF amt>0 AND amt<>due THEN RAISE EXCEPTION 'Staff claims must be recorded in full';END IF;
ELSE RAISE EXCEPTION 'Unsupported payable';END IF;
IF x->>'source'<>'supplier' AND jsonb_array_length(x->'credits')>0 THEN RAISE EXCEPTION 'Credit applies only to supplier invoices';END IF;
IF amt+cred>due OR amt+cred<=0 THEN RAISE EXCEPTION 'Selected balance changed or empty allocation';END IF;
END LOOP;
IF (SELECT sum((a->>'amount')::numeric) FROM jsonb_array_elements(p_items) a) IS DISTINCT FROM p_amount THEN RAISE EXCEPTION 'Amount must equal selected allocations';END IF;
FOR g IN SELECT i.supplier_id,sum((x->>'amount')::numeric) cash FROM jsonb_array_elements(p_items) x JOIN public.invoices i ON i.id=(x->>'id')::uuid AND i.tenant_id=p_tenant WHERE x->>'source'='supplier' GROUP BY i.supplier_id LOOP
allocs:='[]';
FOR x IN SELECT value FROM jsonb_array_elements(p_items) a WHERE a->>'source'='supplier' AND EXISTS(SELECT 1 FROM public.invoices WHERE id=(a->>'id')::uuid AND tenant_id=p_tenant AND supplier_id=g.supplier_id) LOOP
IF jsonb_array_length(x->'credits')=0 THEN allocs:=allocs||jsonb_build_array(jsonb_build_object('invoice_id',x->>'id','amount_allocated',(x->>'amount')::numeric));ELSE
FOR c IN SELECT value FROM jsonb_array_elements(x->'credits') LOOP allocs:=allocs||jsonb_build_array(jsonb_build_object('invoice_id',x->>'id','amount_allocated',CASE WHEN c=(x->'credits'->0) THEN (x->>'amount')::numeric ELSE 0 END,'credit_note_id',c->>'id','credit_note_amount_applied',(c->>'amount')::numeric));END LOOP;END IF;END LOOP;
pid:=public.record_payment_with_receipts(p_tenant,jsonb_build_object('payment_date',p_date,'amount',g.cash,'payment_method',CASE WHEN g.cash=0 THEN 'Credit Note' WHEN p_method='bank_transfer' THEN 'Bank Transfer' WHEN p_method='cheque' THEN 'Cheque' ELSE 'Cash' END,'paid_from_account_id',p_account,'supplier_id',g.supplier_id,'reference_number',ref,'cheque_number',CASE WHEN p_method='cheque' THEN ref ELSE '' END,'match_status',CASE WHEN g.cash=0 THEN 'not_required' ELSE 'awaiting_bank_match' END),allocs,'[]');
UPDATE public.payment_allocations SET tenant_id=p_tenant WHERE payment_id=pid;PERFORM public.post_invoice_payment(pid);result:=result||jsonb_build_array(jsonb_build_object('source','supplier','id',pid));END LOOP;
FOR x IN SELECT value FROM jsonb_array_elements(p_items) WHERE value->>'source'='bill' LOOP
INSERT INTO public.expense_bill_payments(tenant_id,bill_id,payment_date,amount,payment_method,bank_account_id,reference,created_by) VALUES(p_tenant,(x->>'id')::uuid,p_date,(x->>'amount')::numeric,p_method,p_account,ref,uid) RETURNING id INTO pid;PERFORM public.post_expense_bill_payment(pid);result:=result||jsonb_build_array(jsonb_build_object('source','bill','id',pid));END LOOP;
FOR g IN SELECT p.year,p.month,x->>'source' kind,sum((x->>'amount')::numeric) total FROM jsonb_array_elements(p_items) x JOIN public.hr_payroll p ON p.id=(x->>'id')::uuid AND p.tenant_id=p_tenant WHERE x->>'source' IN('salary','mpf') GROUP BY p.year,p.month,x->>'source' LOOP
INSERT INTO public.hr_payroll_payment_batches(tenant_id,period_year,period_month,payment_kind,payment_date,payment_method,bank_account_id,total_amount,notes,created_by) VALUES(p_tenant,g.year,g.month,g.kind,p_date,CASE WHEN p_method='cheque' THEN 'other' ELSE p_method END,p_account,g.total,ref,uid) RETURNING id INTO bid;
INSERT INTO public.hr_payroll_payment_batch_lines(tenant_id,batch_id,payroll_id,employee_id,amount,kind) SELECT p_tenant,bid,p.id,p.employee_id,(x->>'amount')::numeric,g.kind FROM jsonb_array_elements(p_items) x JOIN public.hr_payroll p ON p.id=(x->>'id')::uuid AND p.tenant_id=p_tenant WHERE x->>'source'=g.kind AND p.year=g.year AND p.month=g.month;PERFORM public.post_payroll_payment_batch(bid);result:=result||jsonb_build_array(jsonb_build_object('source',g.kind,'id',bid));END LOOP;
FOR x IN SELECT value FROM jsonb_array_elements(p_items) WHERE value->>'source'='staff' LOOP
SELECT * INTO claim FROM public.staff_reimbursements WHERE id=(x->>'id')::uuid AND tenant_id=p_tenant;
SELECT id INTO acc FROM public.chart_of_accounts WHERE tenant_id=p_tenant AND name='Staff Reimbursements Payable' ORDER BY code LIMIT 1;IF acc IS NULL OR p_method='cash' OR bank.linked_gl_account_id IS NULL THEN RAISE EXCEPTION 'Record cash-box staff claims from Staff claims; bank account required here';END IF;
INSERT INTO public.journal_entries(tenant_id,entry_date,memo,source_type,source_id,status,posted_at,created_by) VALUES(p_tenant,p_date,'Staff reimbursement paid — '||claim.claimant_name,'staff_reimbursement_payment',claim.id,'posted',now(),uid) RETURNING id INTO j;
INSERT INTO public.journal_lines(tenant_id,entry_id,account_id,debit,credit,line_no,memo) VALUES(p_tenant,j,acc,claim.amount,0,1,'Settling '||claim.claimant_name),(p_tenant,j,bank.linked_gl_account_id,0,claim.amount,2,'Paid from '||bank.account_name);
UPDATE public.staff_reimbursements SET status='paid',paid_date=p_date,paid_from='bank',paid_from_bank_account_id=p_account,payment_journal_entry_id=j WHERE id=claim.id AND tenant_id=p_tenant;result:=result||jsonb_build_array(jsonb_build_object('source','staff','id',claim.id));END LOOP;
INSERT INTO public.audit_log(tenant_id,user_id,action,entity_type,details) VALUES(p_tenant,uid,'record_payment','finance',jsonb_build_object('date',p_date,'amount',p_amount,'items',p_items,'records',result,'reference',ref));RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.finance_record_owed_payment(uuid,date,text,uuid,numeric,text,jsonb) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.finance_record_owed_payment(uuid,date,text,uuid,numeric,text,jsonb) TO authenticated;