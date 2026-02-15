
-- Table to store page visibility settings (admin-controlled)
CREATE TABLE public.page_visibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_key text NOT NULL UNIQUE,
  page_label text NOT NULL,
  visible_to_all boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.page_visibility ENABLE ROW LEVEL SECURITY;

-- Everyone can read visibility settings
CREATE POLICY "Anyone can read page visibility"
ON public.page_visibility FOR SELECT
TO authenticated
USING (true);

-- Only admins can update
CREATE POLICY "Admins can update page visibility"
ON public.page_visibility FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can insert
CREATE POLICY "Admins can insert page visibility"
ON public.page_visibility FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default pages (P&L hidden by default)
INSERT INTO public.page_visibility (page_key, page_label, visible_to_all) VALUES
  ('revenue', 'Revenue', true),
  ('forecast', 'Forecast vs Actual', true),
  ('data', 'Data', true),
  ('activity-log', 'Activity Log', true),
  ('pl-report', 'P&L Report', false);

-- Trigger for updated_at
CREATE TRIGGER update_page_visibility_updated_at
BEFORE UPDATE ON public.page_visibility
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
