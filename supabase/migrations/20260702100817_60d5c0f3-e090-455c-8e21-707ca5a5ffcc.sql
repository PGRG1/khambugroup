
DO $$
DECLARE
  v_khambu constant uuid := '00000000-0000-0000-0000-00000000beef';
  t text;
  tables text[] := ARRAY['purchase_orders','purchase_order_items','hr_departments','hr_leave_types','hr_leave_requests','hr_leave_balances','hr_payroll'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE', t);
    EXECUTE format('UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL', t, v_khambu);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(tenant_id)', t||'_tenant_id_idx', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Drop legacy + residual policies
DROP POLICY IF EXISTS "Authenticated can view purchase orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "Admins/managers can manage purchase orders" ON public.purchase_orders;
DROP POLICY IF EXISTS "tenant_select" ON public.purchase_orders;
DROP POLICY IF EXISTS "tenant_write" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_tenant_select" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_tenant_all" ON public.purchase_orders;

DROP POLICY IF EXISTS "Authenticated can view PO items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "Admins/managers can manage PO items" ON public.purchase_order_items;
DROP POLICY IF EXISTS "tenant_select" ON public.purchase_order_items;
DROP POLICY IF EXISTS "tenant_write" ON public.purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_tenant_select" ON public.purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_tenant_all" ON public.purchase_order_items;

DROP POLICY IF EXISTS "Authenticated can read departments" ON public.hr_departments;
DROP POLICY IF EXISTS "Admins/managers can manage departments" ON public.hr_departments;
DROP POLICY IF EXISTS "tenant_select" ON public.hr_departments;
DROP POLICY IF EXISTS "tenant_write" ON public.hr_departments;
DROP POLICY IF EXISTS "hr_departments_tenant_select" ON public.hr_departments;
DROP POLICY IF EXISTS "hr_departments_tenant_all" ON public.hr_departments;

DROP POLICY IF EXISTS "Authenticated can read leave types" ON public.hr_leave_types;
DROP POLICY IF EXISTS "Admins/managers can manage leave types" ON public.hr_leave_types;
DROP POLICY IF EXISTS "tenant_select" ON public.hr_leave_types;
DROP POLICY IF EXISTS "tenant_write" ON public.hr_leave_types;
DROP POLICY IF EXISTS "hr_leave_types_tenant_select" ON public.hr_leave_types;
DROP POLICY IF EXISTS "hr_leave_types_tenant_all" ON public.hr_leave_types;

DROP POLICY IF EXISTS "Authenticated can read leave requests" ON public.hr_leave_requests;
DROP POLICY IF EXISTS "Admins/managers can manage leave requests" ON public.hr_leave_requests;
DROP POLICY IF EXISTS "Admins/managers can read leave requests" ON public.hr_leave_requests;
DROP POLICY IF EXISTS "tenant_select" ON public.hr_leave_requests;
DROP POLICY IF EXISTS "tenant_write" ON public.hr_leave_requests;
DROP POLICY IF EXISTS "hr_leave_requests_tenant_select" ON public.hr_leave_requests;
DROP POLICY IF EXISTS "hr_leave_requests_tenant_all" ON public.hr_leave_requests;

DROP POLICY IF EXISTS "Authenticated can read leave balances" ON public.hr_leave_balances;
DROP POLICY IF EXISTS "Admins/managers can manage leave balances" ON public.hr_leave_balances;
DROP POLICY IF EXISTS "Admins/managers can read leave balances" ON public.hr_leave_balances;
DROP POLICY IF EXISTS "tenant_select" ON public.hr_leave_balances;
DROP POLICY IF EXISTS "tenant_write" ON public.hr_leave_balances;
DROP POLICY IF EXISTS "hr_leave_balances_tenant_select" ON public.hr_leave_balances;
DROP POLICY IF EXISTS "hr_leave_balances_tenant_all" ON public.hr_leave_balances;

DROP POLICY IF EXISTS "Authenticated can read payroll" ON public.hr_payroll;
DROP POLICY IF EXISTS "Admins/managers can manage payroll" ON public.hr_payroll;
DROP POLICY IF EXISTS "Admins/managers can read payroll" ON public.hr_payroll;
DROP POLICY IF EXISTS "Admin/manager read batches" ON public.hr_payroll;
DROP POLICY IF EXISTS "Admin write batches" ON public.hr_payroll;
DROP POLICY IF EXISTS "tenant_select" ON public.hr_payroll;
DROP POLICY IF EXISTS "tenant_write" ON public.hr_payroll;
DROP POLICY IF EXISTS "hr_payroll_tenant_select" ON public.hr_payroll;
DROP POLICY IF EXISTS "hr_payroll_tenant_all" ON public.hr_payroll;

-- Create tenant-scoped policies + grants
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['purchase_orders','purchase_order_items','hr_departments','hr_leave_types','hr_leave_requests','hr_leave_balances','hr_payroll'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR SELECT
        USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
    $f$, t||'_tenant_select', t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I
        FOR ALL
        USING (
          (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
          AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
        )
        WITH CHECK (
          (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
          AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
        )
    $f$, t||'_tenant_all', t);

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
