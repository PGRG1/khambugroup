
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'hr_employees','hr_departments','hr_attendance','hr_shifts','hr_holidays',
    'hr_leave_types','hr_leave_balances','hr_leave_ledger','hr_leave_requests',
    'hr_employee_history','hr_payroll','hr_payroll_payment_batches','hr_payroll_payment_batch_lines',
    'alert_rules','alert_events','audit_log','push_subscriptions',
    'app_config','venues_config','page_visibility','user_access_control','user_page_permissions'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid DEFAULT %L', t, '00000000-0000-0000-0000-00000000beef');
    EXECUTE format('UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL', t, '00000000-0000-0000-0000-00000000beef');
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT', t, t || '_tenant_id_fkey');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', t || '_tenant_idx', t);
    EXECUTE format('DROP TRIGGER IF EXISTS set_tenant_id_default ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_tenant_id_default BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_default()', t);
  END LOOP;
END $$;

-- Re-key user_page_permissions to (user_id, tenant_id, page_key)
ALTER TABLE public.user_page_permissions
  DROP CONSTRAINT IF EXISTS user_page_permissions_user_id_page_key_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='user_page_permissions_user_tenant_page_key'
  ) THEN
    ALTER TABLE public.user_page_permissions
      ADD CONSTRAINT user_page_permissions_user_tenant_page_key
      UNIQUE (user_id, tenant_id, page_key);
  END IF;
END $$;

-- Update the onboarding trigger
CREATE OR REPLACE FUNCTION public.handle_new_user_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := '00000000-0000-0000-0000-00000000beef';
BEGIN
  INSERT INTO public.user_access_control (user_id, tenant_id)
  VALUES (NEW.id, v_tenant)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.user_page_permissions (user_id, tenant_id, page_key)
  VALUES
    (NEW.id, v_tenant, 'revenue'),
    (NEW.id, v_tenant, 'forecast'),
    (NEW.id, v_tenant, 'data'),
    (NEW.id, v_tenant, 'activity-log'),
    (NEW.id, v_tenant, 'pl-report'),
    (NEW.id, v_tenant, 'invoices'),
    (NEW.id, v_tenant, 'inventory'),
    (NEW.id, v_tenant, 'notifications'),
    (NEW.id, v_tenant, 'kpis'),
    (NEW.id, v_tenant, 'kpi-management'),
    (NEW.id, v_tenant, 'bills-expenses')
  ON CONFLICT (user_id, tenant_id, page_key) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Drop old policies
DO $$
DECLARE
  r record; t text;
  tbls text[] := ARRAY[
    'hr_employees','hr_departments','hr_attendance','hr_shifts','hr_holidays',
    'hr_leave_types','hr_leave_balances','hr_leave_ledger','hr_leave_requests',
    'hr_employee_history','hr_payroll','hr_payroll_payment_batches','hr_payroll_payment_batch_lines',
    'alert_rules','alert_events','audit_log','push_subscriptions',
    'app_config','venues_config','page_visibility','user_access_control','user_page_permissions'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- Tenant-only HR / platform tables
DO $$
DECLARE
  t text;
  tenant_only text[] := ARRAY[
    'hr_departments','hr_attendance','hr_shifts','hr_holidays',
    'hr_leave_types','hr_leave_balances','hr_leave_ledger','hr_leave_requests',
    'hr_employee_history','hr_payroll','hr_payroll_payment_batches','hr_payroll_payment_batch_lines',
    'alert_rules','alert_events','audit_log',
    'app_config','venues_config','page_visibility'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_only LOOP
    EXECUTE format($q$CREATE POLICY "tenant_select" ON public.%I FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))$q$, t);
    EXECUTE format($q$CREATE POLICY "tenant_write" ON public.%I FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id)) WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))$q$, t);
  END LOOP;
END $$;

-- hr_employees venue-scoped
CREATE POLICY "tenant_venue_select" ON public.hr_employees FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (public.user_has_tenant(auth.uid(), tenant_id) AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id))));
CREATE POLICY "tenant_venue_write" ON public.hr_employees FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (public.user_has_tenant(auth.uid(), tenant_id) AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id))))
  WITH CHECK (public.is_super_admin(auth.uid()) OR (public.user_has_tenant(auth.uid(), tenant_id) AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id))));

-- push_subscriptions: own subscriptions only, scoped to tenant
CREATE POLICY "own_select" ON public.push_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "own_write" ON public.push_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (user_id = auth.uid() AND public.user_has_tenant(auth.uid(), tenant_id));

-- user_access_control: user sees own row; tenant admins see all in their tenant
CREATE POLICY "self_or_admin_select" ON public.user_access_control FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR user_id = auth.uid()
    OR public.is_tenant_admin(tenant_id, auth.uid())
  );
CREATE POLICY "admin_write" ON public.user_access_control FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_admin(tenant_id, auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_tenant_admin(tenant_id, auth.uid()));

-- user_page_permissions: user sees own row; tenant admins manage
CREATE POLICY "self_or_admin_select" ON public.user_page_permissions FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (user_id = auth.uid() AND public.user_has_tenant(auth.uid(), tenant_id))
    OR public.is_tenant_admin(tenant_id, auth.uid())
  );
CREATE POLICY "admin_write" ON public.user_page_permissions FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_admin(tenant_id, auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.is_tenant_admin(tenant_id, auth.uid()));
