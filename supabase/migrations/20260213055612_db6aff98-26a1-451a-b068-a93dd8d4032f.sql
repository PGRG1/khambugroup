-- Allow forecast approvers (GM) to also delete forecasts
DROP POLICY IF EXISTS "Admins can delete forecasts" ON public.forecasts;

CREATE POLICY "Admins and approvers can delete forecasts"
ON public.forecasts
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM forecast_approvers WHERE forecast_approvers.user_id = auth.uid()
  )
);