CREATE OR REPLACE FUNCTION public.save_purchasing_budgets(p_tenant_id uuid, p_venue_id uuid, p_month date, p_amounts jsonb, p_note text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_category text; v_amount numeric; v_old numeric; v_mode text; v_user uuid := auth.uid();
BEGIN
 IF v_user IS NULL OR NOT (public.user_has_tenant(v_user, p_tenant_id) OR public.is_super_admin(v_user)) OR NOT public.has_role(v_user, 'admin'::public.app_role) THEN RAISE EXCEPTION 'Only tenant admins can save budgets' USING ERRCODE = '42501'; END IF;
 IF p_month IS NULL OR p_month <> date_trunc('month', p_month)::date OR jsonb_typeof(p_amounts) IS DISTINCT FROM 'object' OR length(coalesce(p_note,'')) > 500 THEN RAISE EXCEPTION 'Invalid budget input'; END IF;
 SELECT value #>> '{}' INTO v_mode FROM public.app_config WHERE tenant_id = p_tenant_id AND key = 'purchasing_mode';
 IF coalesce(v_mode,'by_venue') <> 'central' AND p_venue_id IS NULL THEN RAISE EXCEPTION 'Choose exactly one venue for per-venue budgets'; END IF;
 IF v_mode = 'central' AND p_venue_id IS NOT NULL THEN RAISE EXCEPTION 'Central budgets must use whole-group scope'; END IF;
 IF p_venue_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.venues WHERE id = p_venue_id AND tenant_id = p_tenant_id) THEN RAISE EXCEPTION 'Venue does not belong to this tenant'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || coalesce(p_venue_id::text,'group') || p_month::text, 0));
 FOR v_category, v_amount IN SELECT key, value::numeric FROM jsonb_each_text(p_amounts) ORDER BY key LOOP
  IF v_amount IS NULL OR v_amount < 0 OR v_amount::text IN ('NaN','Infinity','-Infinity') OR NOT EXISTS (SELECT 1 FROM public.product_categories WHERE tenant_id = p_tenant_id AND name = v_category AND level = 1 AND is_active AND lower(name) NOT LIKE '%deposit%' AND lower(name) NOT LIKE '%adjustement%' AND lower(name) NOT LIKE '%adjustment%') THEN RAISE EXCEPTION 'Invalid budget category or amount: %', v_category; END IF;
  v_old := NULL;
  SELECT amount INTO v_old FROM public.purchasing_budgets WHERE tenant_id = p_tenant_id AND venue_id IS NOT DISTINCT FROM p_venue_id AND month = p_month AND category = v_category FOR UPDATE;
  IF v_old IS NOT DISTINCT FROM v_amount THEN CONTINUE; END IF;
  INSERT INTO public.purchasing_budgets(tenant_id,venue_id,month,category,amount,updated_by,updated_at) VALUES(p_tenant_id,p_venue_id,p_month,v_category,v_amount,v_user,now()) ON CONFLICT (tenant_id,venue_id,month,category) DO UPDATE SET amount = excluded.amount, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  INSERT INTO public.purchasing_budget_changes(tenant_id,venue_id,month,category,old_amount,new_amount,reason,changed_by) VALUES(p_tenant_id,p_venue_id,p_month,v_category,v_old,v_amount,nullif(trim(p_note),''),v_user);
 END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.save_purchasing_budgets(uuid,uuid,date,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_purchasing_budgets(uuid,uuid,date,jsonb,text) TO authenticated;