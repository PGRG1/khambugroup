
-- ============================================================
-- 1. STANDARD PRODUCTS (canonical, supplier-agnostic)
-- ============================================================
CREATE TABLE public.standard_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',          -- Food / Drinks / Other
  sub_category TEXT,
  base_unit TEXT NOT NULL DEFAULT 'each',           -- bottle / ml / g / kg / each
  reorder_level NUMERIC DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.standard_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read standard_products"
  ON public.standard_products FOR SELECT USING (true);

CREATE POLICY "Authorized can manage standard_products"
  ON public.standard_products FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_standard_products_updated_at
  BEFORE UPDATE ON public.standard_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. PRODUCT PACK CONVERSIONS
-- ============================================================
CREATE TABLE public.product_pack_conversions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  standard_product_id UUID NOT NULL REFERENCES public.standard_products(id) ON DELETE CASCADE,
  from_unit TEXT NOT NULL,            -- e.g., "case"
  to_unit TEXT NOT NULL,              -- e.g., "bottle"
  conversion_factor NUMERIC NOT NULL DEFAULT 1,  -- 1 case = 12 bottles
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.product_pack_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read pack_conversions"
  ON public.product_pack_conversions FOR SELECT USING (true);

CREATE POLICY "Authorized can manage pack_conversions"
  ON public.product_pack_conversions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- ============================================================
-- 3. SUPPLIER ITEM MAPPINGS
-- ============================================================
CREATE TABLE public.supplier_item_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  supplier_item_name TEXT NOT NULL,
  supplier_sku TEXT,
  standard_product_id UUID NOT NULL REFERENCES public.standard_products(id) ON DELETE CASCADE,
  purchase_unit TEXT NOT NULL DEFAULT 'each',    -- case / box / bottle / kg / each
  quantity_per_unit NUMERIC NOT NULL DEFAULT 1,  -- conversion factor to base unit
  default_unit_price NUMERIC DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_item_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read supplier_item_mappings"
  ON public.supplier_item_mappings FOR SELECT USING (true);

CREATE POLICY "Authorized can manage supplier_item_mappings"
  ON public.supplier_item_mappings FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER update_supplier_item_mappings_updated_at
  BEFORE UPDATE ON public.supplier_item_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 4. ALTER SUPPLIERS – add payment terms
-- ============================================================
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT 'COD';

-- ============================================================
-- 5. ALTER INVOICES – payables tracking
-- ============================================================
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS received_date DATE,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_balance NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS dispute_notes TEXT;

-- ============================================================
-- 6. INVOICE PAYMENTS (partial payments)
-- ============================================================
CREATE TABLE public.invoice_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read invoice_payments"
  ON public.invoice_payments FOR SELECT USING (true);

CREATE POLICY "Authorized can manage invoice_payments"
  ON public.invoice_payments FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

-- ============================================================
-- 7. ALTER INVOICE LINE ITEMS – link to standard product
-- ============================================================
ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS standard_product_id UUID REFERENCES public.standard_products(id);

-- ============================================================
-- 8. ALTER INVENTORY ITEMS – link to standard product
-- ============================================================
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS standard_product_id UUID REFERENCES public.standard_products(id);
