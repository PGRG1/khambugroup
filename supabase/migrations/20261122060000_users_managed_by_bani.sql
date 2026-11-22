-- Who manages a client's users: Bani (default, for now) or the client's own admins.
-- Set per client on the control plane (tenants is writable by platform admins only).
-- While it is 'bani', only Bani platform/super admins can add, change or remove the client's users
-- and their page / venue access; the client can still see them.

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS users_managed_by text NOT NULL DEFAULT 'bani';
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_users_managed_by_check;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_users_managed_by_check CHECK (users_managed_by IN ('bani', 'client'));

CREATE OR REPLACE FUNCTION public.client_manages_users(t uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT COALESCE((SELECT users_managed_by = 'client' FROM public.tenants WHERE id = t), false) $$;
REVOKE ALL ON FUNCTION public.client_manages_users(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_manages_users(uuid) TO authenticated, service_role;

-- Memberships (platform admins keep their own policy "tenant members writable by platform admin").
DROP POLICY IF EXISTS "tenant members managed by tenant admin" ON public.tenant_members;
CREATE POLICY "tenant members managed by tenant admin" ON public.tenant_members FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (public.is_tenant_admin(tenant_id, auth.uid()) AND public.client_manages_users(tenant_id)))
  WITH CHECK (public.is_super_admin(auth.uid()) OR (public.is_tenant_admin(tenant_id, auth.uid()) AND public.client_manages_users(tenant_id)));

DROP POLICY IF EXISTS "admin_write" ON public.user_access_control;
CREATE POLICY "admin_write" ON public.user_access_control FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_platform_admin(auth.uid()) OR (public.is_tenant_admin(tenant_id, auth.uid()) AND public.client_manages_users(tenant_id)))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_platform_admin(auth.uid()) OR (public.is_tenant_admin(tenant_id, auth.uid()) AND public.client_manages_users(tenant_id)));

DROP POLICY IF EXISTS "admin_write" ON public.user_page_permissions;
CREATE POLICY "admin_write" ON public.user_page_permissions FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_platform_admin(auth.uid()) OR (public.is_tenant_admin(tenant_id, auth.uid()) AND public.client_manages_users(tenant_id)))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_platform_admin(auth.uid()) OR (public.is_tenant_admin(tenant_id, auth.uid()) AND public.client_manages_users(tenant_id)));

DROP POLICY IF EXISTS "user_venue_access_tenant_all" ON public.user_venue_access;
CREATE POLICY "user_venue_access_tenant_all" ON public.user_venue_access FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_platform_admin(auth.uid()) OR (public.user_has_tenant(auth.uid(), tenant_id) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) AND public.client_manages_users(tenant_id)))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_platform_admin(auth.uid()) OR (public.user_has_tenant(auth.uid(), tenant_id) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')) AND public.client_manages_users(tenant_id)));

-- Forecast approvers were writable by any member of the business; now the business's admins
-- (when they manage their users) or Bani.
DROP POLICY IF EXISTS "tenant_write" ON public.forecast_approvers;
CREATE POLICY "tenant_write" ON public.forecast_approvers FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_platform_admin(auth.uid()) OR (public.is_tenant_admin(tenant_id, auth.uid()) AND public.client_manages_users(tenant_id)))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_platform_admin(auth.uid()) OR (public.is_tenant_admin(tenant_id, auth.uid()) AND public.client_manages_users(tenant_id)));
