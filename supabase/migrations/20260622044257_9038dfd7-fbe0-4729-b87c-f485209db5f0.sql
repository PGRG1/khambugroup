CREATE SEQUENCE IF NOT EXISTS sc_number_seq START 1;

CREATE TABLE public.stock_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_locations TO authenticated;
GRANT ALL ON public.stock_locations TO service_role;
ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_locations select" ON public.stock_locations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock_locations write" ON public.stock_locations
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));

CREATE TABLE public.stock_count_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_number text NOT NULL UNIQUE DEFAULT
    'SC-' || to_char(now(),'YYYYMMDD') || '-' ||
    lpad(nextval('sc_number_seq')::text,4,'0'),
  venue text NOT NULL,
  count_date date NOT NULL DEFAULT CURRENT_DATE,
  count_type text NOT NULL DEFAULT 'full'
    CHECK (count_type IN ('full','category','spot')),
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','pending_review','approved')),
  reference_mode text NOT NULL DEFAULT 'last_count'
    CHECK (reference_mode IN ('last_count','none','expected')),
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_count_sessions TO authenticated;
GRANT ALL ON public.stock_count_sessions TO service_role;
ALTER TABLE public.stock_count_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_count_sessions select" ON public.stock_count_sessions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock_count_sessions write" ON public.stock_count_sessions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));
CREATE TRIGGER trg_stock_count_sessions_updated_at
  BEFORE UPDATE ON public.stock_count_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.stock_count_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.stock_count_sessions(id) ON DELETE CASCADE,
  product_master_id uuid NOT NULL REFERENCES public.product_master(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  last_count_qty numeric DEFAULT NULL,
  counted_qty numeric DEFAULT NULL,
  unit text NOT NULL DEFAULT 'each',
  unit_cost numeric NOT NULL DEFAULT 0,
  notes text,
  counted_by uuid REFERENCES auth.users(id),
  counted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, product_master_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_count_items TO authenticated;
GRANT ALL ON public.stock_count_items TO service_role;
ALTER TABLE public.stock_count_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stock_count_items select" ON public.stock_count_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "stock_count_items write" ON public.stock_count_items
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));
CREATE TRIGGER trg_stock_count_items_updated_at
  BEFORE UPDATE ON public.stock_count_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Authenticated read stock_count_reference_mode"
ON public.app_config FOR SELECT TO authenticated
USING (key = 'stock_count_reference_mode');