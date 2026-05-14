-- HR tables: restrict SELECT to admins/managers
DROP POLICY IF EXISTS "Authenticated can read payroll" ON public.hr_payroll;
CREATE POLICY "Admins/managers can read payroll" ON public.hr_payroll
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Authenticated can read employees" ON public.hr_employees;
CREATE POLICY "Admins/managers can read employees" ON public.hr_employees
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Authenticated can read attendance" ON public.hr_attendance;
CREATE POLICY "Admins/managers can read attendance" ON public.hr_attendance
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Authenticated can read leave balances" ON public.hr_leave_balances;
CREATE POLICY "Admins/managers can read leave balances" ON public.hr_leave_balances
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Authenticated can read leave requests" ON public.hr_leave_requests;
CREATE POLICY "Admins/managers can read leave requests" ON public.hr_leave_requests
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Authenticated can read employee history" ON public.hr_employee_history;
CREATE POLICY "Admins/managers can read employee history" ON public.hr_employee_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Authenticated users can read leave ledger" ON public.hr_leave_ledger;
CREATE POLICY "Admins/managers can read leave ledger" ON public.hr_leave_ledger
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- hr_shifts: keep admin/manager but bind to authenticated role only
DROP POLICY IF EXISTS "Admins/managers can read shifts" ON public.hr_shifts;
CREATE POLICY "Admins/managers can read shifts" ON public.hr_shifts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Audit log: admins only
DROP POLICY IF EXISTS "Authenticated users can read audit logs" ON public.audit_log;
CREATE POLICY "Admins can read audit logs" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Procurement tables: require login (no anon)
DROP POLICY IF EXISTS "Authenticated can read supplier_item_mappings" ON public.supplier_item_mappings;
CREATE POLICY "Authenticated can read supplier_item_mappings" ON public.supplier_item_mappings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read standard_products" ON public.standard_products;
CREATE POLICY "Authenticated can read standard_products" ON public.standard_products
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read pack_conversions" ON public.product_pack_conversions;
CREATE POLICY "Authenticated can read pack_conversions" ON public.product_pack_conversions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read invoice_payments" ON public.invoice_payments;
CREATE POLICY "Authenticated can read invoice_payments" ON public.invoice_payments
  FOR SELECT TO authenticated USING (true);