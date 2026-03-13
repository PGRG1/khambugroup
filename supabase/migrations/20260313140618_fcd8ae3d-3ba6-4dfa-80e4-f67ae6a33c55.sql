
CREATE TABLE public.product_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_sku text NOT NULL UNIQUE,
  external_sku text NOT NULL DEFAULT '',
  internal_product_name text NOT NULL,
  supplier_product_name text NOT NULL DEFAULT '',
  level1_category text NOT NULL DEFAULT 'Other',
  level2_category text NOT NULL DEFAULT '',
  level3_category text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'each',
  unit_cost numeric NOT NULL DEFAULT 0,
  supplier text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.product_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read product_master" ON public.product_master
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized can manage product_master" ON public.product_master
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_product_master_updated_at
  BEFORE UPDATE ON public.product_master
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
