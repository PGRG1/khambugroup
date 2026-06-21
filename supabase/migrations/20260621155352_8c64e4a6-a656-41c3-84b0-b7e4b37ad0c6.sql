
-- Sequence for PO numbers
CREATE SEQUENCE IF NOT EXISTS public.po_number_seq START 1;

-- Add reorder fields to product_master if not present
ALTER TABLE public.product_master
  ADD COLUMN IF NOT EXISTS min_stock_qty numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reorder_qty numeric DEFAULT NULL;

-- Function to generate PO number
CREATE OR REPLACE FUNCTION public.generate_po_number()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'PO-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('public.po_number_seq')::text, 4, '0');
$$;

-- purchase_orders table
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL UNIQUE DEFAULT public.generate_po_number(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  venue text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','sent','partial','received','cancelled')),
  requested_date date,
  expected_date date,
  notes text,
  total_amount numeric NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view purchase orders"
  ON public.purchase_orders FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins/managers can manage purchase orders"
  ON public.purchase_orders FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- purchase_order_items table
CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_master_id uuid NOT NULL REFERENCES public.product_master(id) ON DELETE RESTRICT,
  description text NOT NULL,
  quantity_ordered numeric NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'each',
  unit_price numeric NOT NULL DEFAULT 0,
  total numeric GENERATED ALWAYS AS (quantity_ordered * unit_price) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view PO items"
  ON public.purchase_order_items FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins/managers can manage PO items"
  ON public.purchase_order_items FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE INDEX idx_po_items_po_id ON public.purchase_order_items(po_id);
CREATE INDEX idx_purchase_orders_supplier ON public.purchase_orders(supplier_id);
CREATE INDEX idx_purchase_orders_status ON public.purchase_orders(status);
