CREATE TABLE public.cashflow_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_balance numeric NOT NULL DEFAULT 0,
  opening_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text DEFAULT '',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.cashflow_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read cashflow_settings"
ON public.cashflow_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert cashflow_settings"
ON public.cashflow_settings FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update cashflow_settings"
ON public.cashflow_settings FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_cashflow_settings_updated_at
BEFORE UPDATE ON public.cashflow_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.cashflow_settings (opening_balance, opening_date, notes)
VALUES (0, CURRENT_DATE, 'Initial opening balance — please update');