
-- Create forecast_approvers table (flexible: multiple users can be approvers)
CREATE TABLE public.forecast_approvers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.forecast_approvers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view approvers"
ON public.forecast_approvers FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Admins can insert approvers"
ON public.forecast_approvers FOR INSERT
TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete approvers"
ON public.forecast_approvers FOR DELETE
TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Create forecasts table
CREATE TABLE public.forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue text NOT NULL,
  date text NOT NULL,
  day text NOT NULL,
  forecasted_customers integer NOT NULL DEFAULT 0,
  forecasted_avg_spend numeric NOT NULL DEFAULT 0,
  forecasted_gross_sales numeric NOT NULL DEFAULT 0,
  forecasted_service_charge numeric NOT NULL DEFAULT 0,
  forecasted_total_sales numeric NOT NULL DEFAULT 0,
  forecast_notes text NOT NULL DEFAULT '',
  post_event_notes text NOT NULL DEFAULT '',
  pending_post_event_notes text,
  comment text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  submitted_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.forecasts ADD CONSTRAINT forecasts_venue_date_unique UNIQUE(venue, date);
ALTER TABLE public.forecasts ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read forecasts
CREATE POLICY "Authenticated can read forecasts"
ON public.forecasts FOR SELECT
TO authenticated USING (true);

-- Managers, admins, and approvers can insert forecasts
CREATE POLICY "Managers and approvers can insert forecasts"
ON public.forecasts FOR INSERT
TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.forecast_approvers WHERE user_id = auth.uid())
);

-- All authenticated can update (field-level restrictions in app code)
CREATE POLICY "Authenticated can update forecasts"
ON public.forecasts FOR UPDATE
TO authenticated USING (true);

-- Only admins can delete
CREATE POLICY "Admins can delete forecasts"
ON public.forecasts FOR DELETE
TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Auto-update updated_at
CREATE TRIGGER update_forecasts_updated_at
BEFORE UPDATE ON public.forecasts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add anjanarai4@gmail.com as a forecast approver
INSERT INTO public.forecast_approvers (user_id)
SELECT id FROM auth.users WHERE email = 'anjanarai4@gmail.com'
ON CONFLICT DO NOTHING;
