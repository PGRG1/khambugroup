-- Accounting categories (P&L COGS, OpEx, Balance Sheet, etc.)
CREATE TABLE public.accounting_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  statement TEXT NOT NULL DEFAULT 'P&L',
  category_group TEXT NOT NULL DEFAULT 'COGS',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name)
);

ALTER TABLE public.accounting_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read accounting_categories"
  ON public.accounting_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized can manage accounting_categories"
  ON public.accounting_categories FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER trg_accounting_categories_updated
  BEFORE UPDATE ON public.accounting_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- UOM options (standardized units of measure)
CREATE TABLE public.uom_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  uom_type TEXT NOT NULL DEFAULT 'base',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code, uom_type)
);

ALTER TABLE public.uom_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read uom_options"
  ON public.uom_options FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized can manage uom_options"
  ON public.uom_options FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE TRIGGER trg_uom_options_updated
  BEFORE UPDATE ON public.uom_options
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add accounting_category to product_master and product_suppliers
ALTER TABLE public.product_master
  ADD COLUMN accounting_category TEXT NOT NULL DEFAULT '';

ALTER TABLE public.product_suppliers
  ADD COLUMN accounting_category TEXT NOT NULL DEFAULT '';

-- Seed accounting categories
INSERT INTO public.accounting_categories (name, statement, category_group, sort_order) VALUES
  ('COGS - Food', 'P&L', 'COGS', 10),
  ('COGS - Beverage', 'P&L', 'COGS', 20),
  ('COGS - Other', 'P&L', 'COGS', 30),
  ('OpEx - Cleaning & Sanitation', 'P&L', 'OpEx', 100),
  ('OpEx - Smallwares & Kitchen Tools', 'P&L', 'OpEx', 110),
  ('OpEx - Packaging & Disposables', 'P&L', 'OpEx', 120),
  ('OpEx - Office Supplies', 'P&L', 'OpEx', 130),
  ('OpEx - Repairs & Maintenance', 'P&L', 'OpEx', 140),
  ('OpEx - Utilities', 'P&L', 'OpEx', 150),
  ('OpEx - Marketing', 'P&L', 'OpEx', 160),
  ('OpEx - Other', 'P&L', 'OpEx', 200),
  ('Balance Sheet - Inventory', 'Balance Sheet', 'Asset', 300),
  ('Balance Sheet - Equipment', 'Balance Sheet', 'Asset', 310),
  ('Balance Sheet - Prepaid Expenses', 'Balance Sheet', 'Asset', 320);

-- Seed UOM options
INSERT INTO public.uom_options (code, label, uom_type, sort_order) VALUES
  -- Base / weight & volume
  ('g', 'Grams (g)', 'base', 10),
  ('kg', 'Kilograms (kg)', 'base', 20),
  ('mg', 'Milligrams (mg)', 'base', 30),
  ('ml', 'Millilitres (ml)', 'base', 40),
  ('L', 'Litres (L)', 'base', 50),
  ('cl', 'Centilitres (cl)', 'base', 60),
  ('each', 'Each', 'base', 70),
  ('piece', 'Piece', 'base', 80),
  -- Stock UOM
  ('Bottle', 'Bottle', 'stock', 100),
  ('Can', 'Can', 'stock', 110),
  ('Pack', 'Pack', 'stock', 120),
  ('Bag', 'Bag', 'stock', 130),
  ('Box', 'Box', 'stock', 140),
  ('Tray', 'Tray', 'stock', 150),
  ('Jar', 'Jar', 'stock', 160),
  ('Pouch', 'Pouch', 'stock', 170),
  ('Tin', 'Tin', 'stock', 180),
  ('Bunch', 'Bunch', 'stock', 190),
  ('Loaf', 'Loaf', 'stock', 200),
  ('Roll', 'Roll', 'stock', 210),
  -- Purchase UOM
  ('Case', 'Case', 'purchase', 300),
  ('Carton', 'Carton', 'purchase', 310),
  ('Pallet', 'Pallet', 'purchase', 320),
  ('Crate', 'Crate', 'purchase', 330),
  ('Drum', 'Drum', 'purchase', 340),
  ('Sack', 'Sack', 'purchase', 350),
  ('Keg', 'Keg', 'purchase', 360);
