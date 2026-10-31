CREATE OR REPLACE FUNCTION public.approve_supplier_account_matches(p_tenant uuid, p_supplier uuid, p_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r jsonb; pay public.payments%ROWTYPE; inv public.invoices%ROWTYPE; used numeric; available numeric; amt numeric; cnt integer:=0; uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL OR NOT (public.is_super_admin(uid) OR public.user_has_tenant(uid,p_tenant)) THEN RAISE EXCEPTION 'Supplier account access required'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_access_control WHERE tenant_id=p_tenant AND user_id=uid AND status='disabled') THEN RAISE EXCEPTION 'Account disabled'; END IF;
 IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)=0 OR jsonb_array_length(p_rows)>1000 THEN RAISE EXCEPTION 'Choose valid invoice matches'; END IF;
 PERFORM id FROM public.payments WHERE tenant_id=p_tenant AND supplier_id=p_supplier AND id IN(SELECT (x->>'payment_id')::uuid FROM jsonb_array_elements(p_rows) x) ORDER BY id FOR UPDATE;
 PERFORM id FROM public.invoices WHERE tenant_id=p_tenant AND supplier_id=p_supplier AND id IN(SELECT (x->>'invoice_id')::uuid FROM jsonb_array_elements(p_rows) x) ORDER BY id FOR UPDATE;
 FOR r IN SELECT x FROM jsonb_array_elements(p_rows) x LOOP
  SELECT * INTO pay FROM public.payments WHERE id=(r->>'payment_id')::uuid AND tenant_id=p_tenant AND supplier_id=p_supplier;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment no longer available'; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id=(r->>'invoice_id')::uuid AND tenant_id=p_tenant AND supplier_id=p_supplier;
  IF NOT FOUND OR inv.review_status<>'Approved' OR COALESCE(inv.payment_status,'')='voided' OR inv.invoice_date>pay.payment_date THEN RAISE EXCEPTION 'Invoice no longer eligible'; END IF;
  SELECT COALESCE(SUM(amount_allocated),0) INTO used FROM public.payment_allocations WHERE tenant_id=p_tenant AND payment_id=pay.id;
  available:=GREATEST(0,inv.total_amount-COALESCE(inv.amount_paid,0)-COALESCE(inv.held_amount,0));
  amt:=(r->>'amount')::numeric;
  IF amt IS NULL OR amt<=0 OR amt<>round(amt,2) OR amt>available OR amt>pay.amount-used THEN RAISE EXCEPTION 'Balances changed; reopen Check matches'; END IF;
  IF abs((pay.amount-used)-(r->>'payment_remaining')::numeric)>0.01 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) x WHERE x->>'payment_id'=r->>'payment_id' AND x<>r) THEN RAISE EXCEPTION 'Payment changed; reopen Check matches'; END IF;
  INSERT INTO public.payment_allocations(tenant_id,payment_id,invoice_id,amount_allocated) VALUES(p_tenant,pay.id,inv.id,amt);
  cnt:=cnt+1;
 END LOOP;
 RETURN cnt;
END $$;
REVOKE ALL ON FUNCTION public.approve_supplier_account_matches(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_supplier_account_matches(uuid,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_supplier_account_due_dates(p_tenant uuid,p_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r jsonb; uid uuid:=auth.uid(); days integer; invoice_ids uuid[]; n integer; cnt integer:=0;
BEGIN
 IF uid IS NULL OR NOT (public.is_super_admin(uid) OR public.user_has_tenant(uid,p_tenant)) OR NOT (public.has_role(uid,'admin') OR public.has_role(uid,'manager')) THEN RAISE EXCEPTION 'Invoice editing access required'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_access_control WHERE tenant_id=p_tenant AND user_id=uid AND status='disabled') THEN RAISE EXCEPTION 'Account disabled'; END IF;
 IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)=0 OR jsonb_array_length(p_rows)>1000 THEN RAISE EXCEPTION 'Choose valid supplier terms'; END IF;
 FOR r IN SELECT x FROM jsonb_array_elements(p_rows) x LOOP
  days:=(r->>'days')::integer;
  IF days IS NULL OR days<0 OR days>3650 OR (r->>'days')::numeric<>days THEN RAISE EXCEPTION 'Enter whole payment-term days from 0 to 3650'; END IF;
  SELECT array_agg(x::uuid) INTO invoice_ids FROM jsonb_array_elements_text(r->'invoice_ids') x;
  IF invoice_ids IS NULL OR cardinality(invoice_ids)>5000 THEN RAISE EXCEPTION 'Choose valid invoices'; END IF;
  UPDATE public.invoices SET due_date=invoice_date+days WHERE tenant_id=p_tenant AND supplier_id=(r->>'supplier_id')::uuid AND id=ANY(invoice_ids) AND due_date IS NULL AND review_status IN('Approved','Disputed') AND COALESCE(payment_status,'')<>'voided' AND GREATEST(0,total_amount-COALESCE(amount_paid,0)-COALESCE(held_amount,0))>0;
  GET DIAGNOSTICS n=ROW_COUNT; cnt:=cnt+n;
 END LOOP;
 RETURN cnt;
END $$;
REVOKE ALL ON FUNCTION public.approve_supplier_account_due_dates(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_supplier_account_due_dates(uuid,jsonb) TO authenticated;