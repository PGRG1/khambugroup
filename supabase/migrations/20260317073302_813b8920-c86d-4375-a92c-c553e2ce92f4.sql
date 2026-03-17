-- Create product_suppliers table
CREATE TABLE public.product_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_master_id uuid NOT NULL REFERENCES public.product_master(id) ON DELETE CASCADE,
  supplier text NOT NULL DEFAULT '',
  external_sku text NOT NULL DEFAULT '',
  supplier_product_name text NOT NULL DEFAULT '',
  purchase_unit text NOT NULL DEFAULT '',
  purchase_unit_cost numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_master_id, supplier)
);

-- RLS
ALTER TABLE public.product_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read product_suppliers"
  ON public.product_suppliers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authorized can manage product_suppliers"
  ON public.product_suppliers FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_product_suppliers_updated_at
  BEFORE UPDATE ON public.product_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migrate existing supplier data from product_master into product_suppliers
INSERT INTO public.product_suppliers (product_master_id, supplier, external_sku, supplier_product_name, purchase_unit, purchase_unit_cost, status)
SELECT id, supplier, external_sku, supplier_product_name, purchase_unit, purchase_unit_cost, status
FROM public.product_master
WHERE supplier IS NOT NULL AND supplier != '';