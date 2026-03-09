
DROP POLICY "Authenticated users can manage leave ledger" ON public.hr_leave_ledger;

CREATE POLICY "Authenticated users can read leave ledger"
  ON public.hr_leave_ledger FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert leave ledger"
  ON public.hr_leave_ledger FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY "Authenticated users can update leave ledger"
  ON public.hr_leave_ledger FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY "Authenticated users can delete leave ledger"
  ON public.hr_leave_ledger FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'manager'))
  );
