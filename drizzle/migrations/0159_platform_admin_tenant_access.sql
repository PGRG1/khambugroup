CREATE OR REPLACE FUNCTION public.user_has_tenant(_user_id uuid, _tenant_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenant_members WHERE user_id = _user_id AND tenant_id = _tenant_id)
      OR public.is_super_admin(_user_id)
      OR public.is_platform_admin(_user_id);
$$;