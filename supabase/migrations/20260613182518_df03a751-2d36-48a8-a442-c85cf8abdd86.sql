
-- 1. bank_audit_trail: restrict SELECT to admin/manager
DROP POLICY IF EXISTS "Authenticated can read bank_audit_trail" ON public.bank_audit_trail;
CREATE POLICY "Admins and managers can read bank_audit_trail"
  ON public.bank_audit_trail FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- 2. ledger_audit_log: restrict SELECT to admin/manager
DROP POLICY IF EXISTS "Authenticated can read ledger audit" ON public.ledger_audit_log;
CREATE POLICY "Admins and managers can read ledger audit"
  ON public.ledger_audit_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- 3. HR reference tables: require authentication (not public)
DROP POLICY IF EXISTS "Authenticated can read holidays" ON public.hr_holidays;
CREATE POLICY "Authenticated can read holidays"
  ON public.hr_holidays FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read leave types" ON public.hr_leave_types;
CREATE POLICY "Authenticated can read leave types"
  ON public.hr_leave_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read departments" ON public.hr_departments;
CREATE POLICY "Authenticated can read departments"
  ON public.hr_departments FOR SELECT TO authenticated USING (true);

-- 4. Remove NULL-assignment bypass on KPI access
DROP POLICY IF EXISTS "Users read own kpi_assignments" ON public.kpi_assignments;
CREATE POLICY "Users read own kpi_assignments"
  ON public.kpi_assignments FOR SELECT TO authenticated
  USING (assigned_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.user_owns_kpi(_user_id uuid, _kpi_card_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kpi_assignments
    WHERE kpi_card_id = _kpi_card_id
      AND active = true
      AND assigned_user_id = _user_id
  );
$$;
