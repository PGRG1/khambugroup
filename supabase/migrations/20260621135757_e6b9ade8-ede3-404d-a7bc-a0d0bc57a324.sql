
-- 1. Allow platform_admin role and let a user hold both a tenant role and platform_admin
ALTER TABLE public.tenant_members DROP CONSTRAINT IF EXISTS tenant_members_role_check;
ALTER TABLE public.tenant_members ADD CONSTRAINT tenant_members_role_check
  CHECK (role = ANY (ARRAY['super_admin','platform_admin','tenant_admin','member']));

ALTER TABLE public.tenant_members DROP CONSTRAINT IF EXISTS tenant_members_tenant_id_user_id_key;
ALTER TABLE public.tenant_members
  ADD CONSTRAINT tenant_members_tenant_user_role_key UNIQUE (tenant_id, user_id, role);

-- 2. Helper functions
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE user_id = _user_id AND role IN ('platform_admin','super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE user_id = _user_id AND role IN ('super_admin','platform_admin')
  );
$$;

-- 3. Per-tenant uniqueness conversions
ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS venues_name_key;
ALTER TABLE public.venues ADD CONSTRAINT venues_tenant_name_key UNIQUE (tenant_id, name);

ALTER TABLE public.venues_config DROP CONSTRAINT IF EXISTS venues_config_pkey;
ALTER TABLE public.venues_config ADD CONSTRAINT venues_config_pkey PRIMARY KEY (tenant_id, name);

ALTER TABLE public.page_visibility DROP CONSTRAINT IF EXISTS page_visibility_page_key_key;
ALTER TABLE public.page_visibility
  ADD CONSTRAINT page_visibility_tenant_page_key_key UNIQUE (tenant_id, page_key);

ALTER TABLE public.app_config DROP CONSTRAINT IF EXISTS app_config_pkey;
ALTER TABLE public.app_config ADD CONSTRAINT app_config_pkey PRIMARY KEY (tenant_id, key);

ALTER TABLE public.chart_of_accounts DROP CONSTRAINT IF EXISTS chart_of_accounts_code_key;
ALTER TABLE public.chart_of_accounts
  ADD CONSTRAINT chart_of_accounts_tenant_code_key UNIQUE (tenant_id, code);

ALTER TABLE public.accounting_categories DROP CONSTRAINT IF EXISTS accounting_categories_name_key;
ALTER TABLE public.accounting_categories
  ADD CONSTRAINT accounting_categories_tenant_name_key UNIQUE (tenant_id, name);

ALTER TABLE public.expense_categories DROP CONSTRAINT IF EXISTS expense_categories_name_key;
ALTER TABLE public.expense_categories
  ADD CONSTRAINT expense_categories_tenant_name_key UNIQUE (tenant_id, name);

-- 4. Tenants policies: platform admins can list & create new client tenants
DROP POLICY IF EXISTS "tenants editable by super admin" ON public.tenants;
DROP POLICY IF EXISTS "tenants visible to members" ON public.tenants;
DROP POLICY IF EXISTS "tenants visible to platform admins or members" ON public.tenants;
DROP POLICY IF EXISTS "tenants writable by platform admin" ON public.tenants;

CREATE POLICY "tenants visible to platform admins or members"
  ON public.tenants FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_tenant_member(id, auth.uid()));

CREATE POLICY "tenants writable by platform admin"
  ON public.tenants FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- 5. tenant_members: platform admins can seed the very first membership for a new tenant
DROP POLICY IF EXISTS "tenant members writable by platform admin" ON public.tenant_members;
CREATE POLICY "tenant members writable by platform admin"
  ON public.tenant_members FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
