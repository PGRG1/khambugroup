
-- Seed three Daily Trading KPI cards (idempotent)
INSERT INTO public.kpi_cards (kpi_name, kpi_category, kpi_type, unit, description, active)
SELECT 'Daily Revenue', 'daily_trading', 'daily_revenue', 'currency', 'Total daily revenue (subtotal + service charge) from sales_data', true
WHERE NOT EXISTS (SELECT 1 FROM public.kpi_cards WHERE kpi_type = 'daily_revenue');

INSERT INTO public.kpi_cards (kpi_name, kpi_category, kpi_type, unit, description, active)
SELECT 'Daily Guests', 'daily_trading', 'daily_guests', 'number', 'Total daily guests from sales_data', true
WHERE NOT EXISTS (SELECT 1 FROM public.kpi_cards WHERE kpi_type = 'daily_guests');

INSERT INTO public.kpi_cards (kpi_name, kpi_category, kpi_type, unit, description, active)
SELECT 'Daily Cheques', 'daily_trading', 'daily_cheques', 'number', 'Total daily cheques (orders) from sales_data', true
WHERE NOT EXISTS (SELECT 1 FROM public.kpi_cards WHERE kpi_type = 'daily_cheques');

-- KPI bundles
CREATE TABLE IF NOT EXISTS public.kpi_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.kpi_bundles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.kpi_bundles TO authenticated;
GRANT ALL ON public.kpi_bundles TO service_role;

ALTER TABLE public.kpi_bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read kpi_bundles" ON public.kpi_bundles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage kpi_bundles" ON public.kpi_bundles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER kpi_bundles_updated_at BEFORE UPDATE ON public.kpi_bundles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.kpi_bundle_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id uuid NOT NULL REFERENCES public.kpi_bundles(id) ON DELETE CASCADE,
  kpi_card_id uuid NOT NULL REFERENCES public.kpi_cards(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bundle_id, kpi_card_id)
);

GRANT SELECT ON public.kpi_bundle_cards TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.kpi_bundle_cards TO authenticated;
GRANT ALL ON public.kpi_bundle_cards TO service_role;

ALTER TABLE public.kpi_bundle_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read kpi_bundle_cards" ON public.kpi_bundle_cards
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage kpi_bundle_cards" ON public.kpi_bundle_cards
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Seed Daily Trading bundle and its members
INSERT INTO public.kpi_bundles (name, description)
SELECT 'Daily Trading', 'Daily Revenue, Guests and Cheques auto-pulled from sales data'
WHERE NOT EXISTS (SELECT 1 FROM public.kpi_bundles WHERE name = 'Daily Trading');

INSERT INTO public.kpi_bundle_cards (bundle_id, kpi_card_id, sort_order)
SELECT b.id, c.id,
  CASE c.kpi_type WHEN 'daily_revenue' THEN 1 WHEN 'daily_guests' THEN 2 WHEN 'daily_cheques' THEN 3 ELSE 99 END
FROM public.kpi_bundles b
CROSS JOIN public.kpi_cards c
WHERE b.name = 'Daily Trading'
  AND c.kpi_type IN ('daily_revenue','daily_guests','daily_cheques')
ON CONFLICT (bundle_id, kpi_card_id) DO NOTHING;
