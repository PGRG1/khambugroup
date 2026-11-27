-- A client's Level 1 categories with the group and SKU prefix from Bani's master list. The master table itself stays
-- readable only by Bani; members of the client read just their own Level 1 defaults through this function.
CREATE OR REPLACE FUNCTION public.client_level1_defaults(p_tenant uuid)
RETURNS TABLE(name text, default_group text, code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pc.name, cm.default_group, cm.code
    FROM public.product_categories pc
    JOIN public.category_master cm ON cm.id = pc.master_id
   WHERE pc.tenant_id = p_tenant AND pc.level = 1
     AND (public.user_has_tenant(auth.uid(), p_tenant) OR public.is_platform_admin(auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.client_level1_defaults(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_level1_defaults(uuid) TO authenticated;
