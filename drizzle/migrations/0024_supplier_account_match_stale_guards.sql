CREATE OR REPLACE FUNCTION public.approve_supplier_account_matches(p_tenant uuid, p_supplier uuid, p_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r jsonb; pay public.payments%ROWTYPE; inv public.invoices%ROWTYPE; used numeric; available numeric; amt numeric; cnt integer:=0; uid uuid:=auth.uid();
BEGIN
 IF uid IS NULL OR NOT (public.is_super_admin(uid) OR public.user_has_tenant(uid,p_tenant)) THEN RAISE EXCEPTION 'Supplier account access required'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_access_control WHERE tenant_id=p_tenant AND user_id=uid AND status='disabled') THEN RAISE EXCEPTION 'Account disabled'; END IF;
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)=0 OR jsonb_array_length(p_rows)>1000 THEN RAISE EXCEPTION 'Choose valid invoice matches'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) x GROUP BY x->>'payment_id',x->>'invoice_id' HAVING COUNT(*)>1) THEN RAISE EXCEPTION 'Duplicate invoice matches'; END IF;
 PERFORM id FROM public.payments WHERE tenant_id=p_tenant AND supplier_id=p_supplier AND id IN(SELECT (x->>'payment_id')::uuid FROM jsonb_array_elements(p_rows) x) ORDER BY id FOR UPDATE;
 PERFORM id FROM public.invoices WHERE tenant_id=p_tenant AND supplier_id=p_supplier AND id IN(SELECT (x->>'invoice_id')::uuid FROM jsonb_array_elements(p_rows) x) ORDER BY id FOR UPDATE;
 FOR r IN SELECT x FROM jsonb_array_elements(p_rows) x LOOP
  SELECT * INTO pay FROM public.payments WHERE id=(r->>'payment_id')::uuid AND tenant_id=p_tenant AND supplier_id=p_supplier;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment no longer available'; END IF;
  SELECT * INTO inv FROM public.invoices WHERE id=(r->>'invoice_id')::uuid AND tenant_id=p_tenant AND supplier_id=p_supplier;
  IF NOT FOUND OR inv.review_status IS DISTINCT FROM 'Approved' OR COALESCE(inv.payment_status,'')='voided' OR inv.invoice_date>pay.payment_date THEN RAISE EXCEPTION 'Invoice no longer eligible'; END IF;
  SELECT COALESCE(SUM(amount_allocated),0) INTO used FROM public.payment_allocations WHERE payment_id=pay.id;
  available:=GREATEST(0,inv.total_amount-COALESCE(inv.amount_paid,0)-COALESCE(inv.held_amount,0));
  IF r->>'payment_remaining' IS NULL OR r->>'invoice_open' IS NULL OR abs((pay.amount-used)-(r->>'payment_remaining')::numeric)>0.005 OR abs(available-(r->>'invoice_open')::numeric)>0.005 THEN RAISE EXCEPTION 'Balances changed; reopen Check matches'; END IF;
  amt:=(r->>'amount')::numeric;
  IF amt IS NULL OR amt<=0 OR amt<>round(amt,2) THEN RAISE EXCEPTION 'Invalid match amount'; END IF;
  IF (SELECT SUM((x->>'amount')::numeric) FROM jsonb_array_elements(p_rows) x WHERE x->>'payment_id'=r->>'payment_id')>pay.amount-used OR (SELECT SUM((x->>'amount')::numeric) FROM jsonb_array_elements(p_rows) x WHERE x->>'invoice_id'=r->>'invoice_id')>available THEN RAISE EXCEPTION 'Matches exceed the available balance'; END IF;
 END LOOP;
 INSERT INTO public.payment_allocations(tenant_id,payment_id,invoice_id,amount_allocated) SELECT p_tenant,(x->>'payment_id')::uuid,(x->>'invoice_id')::uuid,(x->>'amount')::numeric FROM jsonb_array_elements(p_rows) x;
 GET DIAGNOSTICS cnt=ROW_COUNT;
 RETURN cnt;
END $$;
REVOKE ALL ON FUNCTION public.approve_supplier_account_matches(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_supplier_account_matches(uuid,uuid,jsonb) TO authenticated;