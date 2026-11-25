-- The Items Master, supplier item entries and account rules are the pre-approved list:
-- only approvers change them (Bani, the business admin, or Approve on Purchasing / Finance for
-- items; Bani, the business admin or Approve on Finance for accounts). Everyone in the business
-- still reads them. Server functions (SECURITY DEFINER) keep their own checks.

CREATE OR REPLACE FUNCTION public.can_edit_item_list(t uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_platform_admin(auth.uid())
    OR public.is_super_admin(auth.uid())
    OR (public.user_has_tenant(auth.uid(), t) AND (
      public.is_tenant_admin(t, auth.uid())
      OR COALESCE(public.access_level(t, 'purchasing'), 0) >= 3
      OR COALESCE(public.access_level(t, 'finance'), 0) >= 3))
  );
$function$;

CREATE OR REPLACE FUNCTION public.can_edit_account_rules(t uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_platform_admin(auth.uid())
    OR public.is_super_admin(auth.uid())
    OR (public.user_has_tenant(auth.uid(), t) AND (
      public.is_tenant_admin(t, auth.uid())
      OR COALESCE(public.access_level(t, 'finance'), 0) >= 3))
  );
$function$;

REVOKE ALL ON FUNCTION public.can_edit_item_list(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_account_rules(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_item_list(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_account_rules(uuid) TO authenticated;

DO $$
DECLARE tbl text; fn text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['product_master', 'product_suppliers', 'account_mapping_rules'] LOOP
    fn := CASE WHEN tbl = 'account_mapping_rules' THEN 'can_edit_account_rules' ELSE 'can_edit_item_list' END;
    EXECUTE format('DROP POLICY IF EXISTS tenant_write ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS approver_insert ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS approver_update ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS approver_delete ON public.%I', tbl);
    EXECUTE format('CREATE POLICY approver_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.%I(tenant_id))', tbl, fn);
    EXECUTE format('CREATE POLICY approver_update ON public.%I FOR UPDATE TO authenticated USING (public.%I(tenant_id)) WITH CHECK (public.%I(tenant_id))', tbl, fn, fn);
    EXECUTE format('CREATE POLICY approver_delete ON public.%I FOR DELETE TO authenticated USING (public.%I(tenant_id))', tbl, fn);
  END LOOP;
END $$;

-- Before booking: which linked items could not go into the books, with the same rules as the
-- journal rebuild (_hold_purchase_invoice): item missing, no group, or no account for the venue.
CREATE OR REPLACE FUNCTION public.purchase_items_not_bookable(p_tenant uuid, p_venue text, p_products uuid[])
RETURNS TABLE(product_id uuid, problem text, category text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.user_has_tenant(auth.uid(), p_tenant) OR public.is_platform_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF coalesce(array_length(p_products, 1), 0) > 500 THEN RAISE EXCEPTION 'Too many items'; END IF;
  RETURN QUERY
  SELECT ids.id,
         CASE WHEN pm.id IS NULL THEN 'item'
              WHEN coalesce(pm.financial_treatment, '') = '' THEN 'group'
              ELSE 'account' END,
         coalesce(nullif(pm.level1_category, ''), '')
    FROM (SELECT DISTINCT unnest(p_products) AS id) ids
    LEFT JOIN public.product_master pm ON pm.id = ids.id AND pm.tenant_id = p_tenant
    LEFT JOIN LATERAL (SELECT r.account_id FROM public.account_mapping_rules r WHERE r.tenant_id = p_tenant AND (
        (r.rule_type = 'procurement_category_venue' AND r.match_key = COALESCE(pm.financial_treatment,'')||'__'||COALESCE(pm.level1_category,'')||'__'||COALESCE(p_venue,''))
        OR (r.rule_type = 'procurement_category' AND r.match_key = COALESCE(pm.financial_treatment,'')||'__'||COALESCE(pm.level1_category,'')))
      ORDER BY (r.rule_type = 'procurement_category_venue') DESC LIMIT 1) amr ON true
   WHERE pm.id IS NULL OR coalesce(pm.financial_treatment, '') = '' OR COALESCE(pm.default_coa_account_id, amr.account_id) IS NULL;
END $function$;

REVOKE ALL ON FUNCTION public.purchase_items_not_bookable(uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_items_not_bookable(uuid, text, uuid[]) TO authenticated;