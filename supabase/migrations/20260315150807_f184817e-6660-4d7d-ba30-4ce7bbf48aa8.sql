
-- 1. menu_items
CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT '',
  theoretical_cost numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read menu_items"
  ON public.menu_items FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authorized can manage menu_items"
  ON public.menu_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER update_menu_items_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. menu_item_ingredients
CREATE TABLE public.menu_item_ingredients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  product_master_id uuid REFERENCES public.product_master(id),
  sku text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  quantity_used numeric NOT NULL DEFAULT 0,
  unit_used text NOT NULL DEFAULT 'gms',
  reference_cost numeric NOT NULL DEFAULT 0,
  line_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.menu_item_ingredients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read menu_item_ingredients"
  ON public.menu_item_ingredients FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authorized can manage menu_item_ingredients"
  ON public.menu_item_ingredients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- 3. menu_item_pricing
CREATE TABLE public.menu_item_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  price_type text NOT NULL,
  selling_price numeric NOT NULL DEFAULT 0,
  gross_profit numeric NOT NULL DEFAULT 0,
  food_cost_pct numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.menu_item_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read menu_item_pricing"
  ON public.menu_item_pricing FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authorized can manage menu_item_pricing"
  ON public.menu_item_pricing FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
