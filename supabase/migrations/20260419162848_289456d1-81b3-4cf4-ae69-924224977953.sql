
CREATE TABLE public.revenue_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  target_amount NUMERIC NOT NULL DEFAULT 0,
  venues TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  notes TEXT DEFAULT '',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (year, month)
);

ALTER TABLE public.revenue_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read revenue targets"
ON public.revenue_targets
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authorized can insert revenue targets"
ON public.revenue_targets
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR EXISTS (SELECT 1 FROM public.forecast_approvers WHERE user_id = auth.uid())
);

CREATE POLICY "Authorized can update revenue targets"
ON public.revenue_targets
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manager'::app_role)
  OR EXISTS (SELECT 1 FROM public.forecast_approvers WHERE user_id = auth.uid())
);

CREATE POLICY "Admins can delete revenue targets"
ON public.revenue_targets
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_revenue_targets_updated_at
BEFORE UPDATE ON public.revenue_targets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
