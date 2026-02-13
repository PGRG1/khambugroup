
-- Drop the overly permissive update policy
DROP POLICY "Authenticated can update forecasts" ON public.forecasts;

-- More restrictive: only managers, admins, approvers, or the original submitter can update
CREATE POLICY "Authorized users can update forecasts"
ON public.forecasts FOR UPDATE
TO authenticated USING (
  public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.forecast_approvers WHERE user_id = auth.uid())
  OR submitted_by = auth.uid()
);
