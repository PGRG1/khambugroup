CREATE OR REPLACE FUNCTION public.log_supplier_container_return(p_tenant uuid,p_supplier uuid,p_product uuid,p_venue text,p_date date,p_qty numeric,p_cost numeric,p_request uuid) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); prod public.product_master%ROWTYPE; grn uuid; reference text:='RETURN-'||p_request::text;
BEGIN
 IF uid IS NULL OR NOT (public.is_super_admin(uid) OR public.user_has_tenant(uid,p_tenant)) OR NOT (public.has_role(uid,'admin') OR public.has_role(uid,'manager')) THEN RAISE EXCEPTION 'Receiving access required'; END IF;
 IF EXISTS(SELECT 1 FROM public.user_access_control WHERE tenant_id=p_tenant AND user_id=uid AND status='disabled') THEN RAISE EXCEPTION 'Account disabled'; END IF;
 IF p_request IS NULL OR p_qty IS NULL OR p_qty<=0 OR p_qty<>trunc(p_qty) OR p_cost IS NULL OR p_cost<0 OR p_cost<>round(p_cost,2) OR p_date IS NULL OR p_date>(now() AT TIME ZONE 'Asia/Hong_Kong')::date THEN RAISE EXCEPTION 'Enter a valid date, whole container quantity and refund value'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=p_supplier AND tenant_id=p_tenant) OR NOT EXISTS(SELECT 1 FROM public.venues WHERE tenant_id=p_tenant AND name=p_venue AND is_active=true) THEN RAISE EXCEPTION 'Supplier or venue unavailable'; END IF;
 SELECT * INTO prod FROM public.product_master WHERE id=p_product AND tenant_id=p_tenant AND financial_treatment LIKE 'Asset%';
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.grn_items i JOIN public.goods_received_notes g ON g.id=i.grn_id WHERE i.product_master_id=p_product AND i.tenant_id=p_tenant AND g.tenant_id=p_tenant AND g.supplier_id=p_supplier AND g.status IN ('confirmed','disputed')) THEN RAISE EXCEPTION 'Choose a received deposit container for this supplier'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(reference,0));
 SELECT id INTO grn FROM public.goods_received_notes WHERE grn_number=reference AND tenant_id=p_tenant AND supplier_id=p_supplier;
 IF FOUND THEN RETURN grn; END IF;
 INSERT INTO public.goods_received_notes(tenant_id,grn_number,supplier_id,venue,status,received_date,received_by,notes) VALUES(p_tenant,reference,p_supplier,p_venue,'confirmed',p_date,uid,'Returned empties confirmed in Supplier Accounts; no invoice or payment created') RETURNING id INTO grn;
 INSERT INTO public.grn_items(tenant_id,grn_id,product_master_id,description,quantity_received,accepted_qty,unit,unit_cost,receiving_note) VALUES(p_tenant,grn,p_product,COALESCE(to_jsonb(prod)->>'name',to_jsonb(prod)->>'internal_product_name','Returned container'),-p_qty,-p_qty,COALESCE(prod.unit,'Each'),p_cost,'Returned empties');
 RETURN grn;
END $$;
REVOKE ALL ON FUNCTION public.log_supplier_container_return(uuid,uuid,uuid,text,date,numeric,numeric,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.log_supplier_container_return(uuid,uuid,uuid,text,date,numeric,numeric,uuid) TO authenticated;