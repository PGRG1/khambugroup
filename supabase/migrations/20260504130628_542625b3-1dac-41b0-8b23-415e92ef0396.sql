
-- 1. Widen venue CHECK constraint on sales_records
ALTER TABLE public.sales_records DROP CONSTRAINT IF EXISTS sales_records_venue_check;
ALTER TABLE public.sales_records ADD CONSTRAINT sales_records_venue_check
  CHECK (venue IN ('Assembly','Caliente','Hanabi','Events','Off-site / External'));

-- 2. revenue_sources
CREATE TABLE public.revenue_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.revenue_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read revenue_sources" ON public.revenue_sources
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can manage revenue_sources" ON public.revenue_sources
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));
CREATE TRIGGER trg_revenue_sources_updated_at BEFORE UPDATE ON public.revenue_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.revenue_sources (name, is_default, sort_order) VALUES
  ('Restaurant Sales', true, 1),
  ('Events', false, 2),
  ('Delivery', false, 3),
  ('Takeaway', false, 4),
  ('Catering', false, 5),
  ('Private Dining', false, 6),
  ('Pop-up / Stall', false, 7),
  ('Other', false, 8)
ON CONFLICT (name) DO NOTHING;

-- 3. venues_config
CREATE TABLE public.venues_config (
  name text PRIMARY KEY,
  display_label text NOT NULL,
  venue_type text NOT NULL CHECK (venue_type IN ('physical','external','legacy')),
  is_active boolean NOT NULL DEFAULT true,
  include_in_dashboard boolean NOT NULL DEFAULT true,
  include_in_forecasting boolean NOT NULL DEFAULT true,
  include_in_inventory boolean NOT NULL DEFAULT true,
  include_in_payroll boolean NOT NULL DEFAULT true,
  historical_only boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.venues_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read venues_config" ON public.venues_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can manage venues_config" ON public.venues_config
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));
CREATE TRIGGER trg_venues_config_updated_at BEFORE UPDATE ON public.venues_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.venues_config
  (name, display_label, venue_type, is_active, include_in_dashboard, include_in_forecasting, include_in_inventory, include_in_payroll, historical_only, sort_order)
VALUES
  ('Assembly','Assembly','physical',true,true,true,true,true,false,1),
  ('Caliente','Caliente','physical',true,true,true,true,true,false,2),
  ('Hanabi','Hanabi','physical',true,true,true,true,true,false,3),
  ('Off-site / External','Off-site / External','external',true,true,true,false,false,false,4),
  ('Events','Events (Legacy)','legacy',false,true,false,false,false,true,99)
ON CONFLICT (name) DO NOTHING;

-- 4. events
CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  event_type text NOT NULL DEFAULT 'In-Venue Event'
    CHECK (event_type IN ('In-Venue Event','External Stall','Pop-up','Catering','Private Dining','Corporate Event','Festival','Takeaway Booth','Other')),
  linked_venue text,
  external_location text,
  start_date date NOT NULL,
  end_date date NOT NULL,
  revenue_source_id uuid REFERENCES public.revenue_sources(id),
  service_period text,
  sales_channel text,
  expected_guests integer,
  forecast_avg_spend numeric,
  forecast_revenue numeric,
  actual_guests integer,
  actual_revenue numeric,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Planned'
    CHECK (status IN ('Planned','Active','Completed','Cancelled')),
  include_in_dashboard boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read events" ON public.events
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can manage events" ON public.events
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));
CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_events_start_date ON public.events(start_date);
CREATE INDEX idx_events_status ON public.events(status);

-- 5. Extend sales_records (all nullable, no defaults that mutate history)
ALTER TABLE public.sales_records
  ADD COLUMN IF NOT EXISTS revenue_source_id uuid REFERENCES public.revenue_sources(id),
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id),
  ADD COLUMN IF NOT EXISTS event_name text,
  ADD COLUMN IF NOT EXISTS external_location text,
  ADD COLUMN IF NOT EXISTS service_period text,
  ADD COLUMN IF NOT EXISTS sales_channel text;

-- 6. Extend forecasts
ALTER TABLE public.forecasts
  ADD COLUMN IF NOT EXISTS revenue_source_id uuid REFERENCES public.revenue_sources(id),
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id),
  ADD COLUMN IF NOT EXISTS external_location text,
  ADD COLUMN IF NOT EXISTS service_period text,
  ADD COLUMN IF NOT EXISTS sales_channel text;

-- 7. Backfill (only fills NULLs; no totals or venue values changed)
UPDATE public.sales_records
   SET revenue_source_id = (SELECT id FROM public.revenue_sources WHERE name='Restaurant Sales')
 WHERE revenue_source_id IS NULL
   AND venue IN ('Assembly','Caliente','Hanabi');

UPDATE public.sales_records
   SET revenue_source_id = (SELECT id FROM public.revenue_sources WHERE name='Events')
 WHERE revenue_source_id IS NULL
   AND venue = 'Events';
