
-- Expense categories (Food, Beverages, Utilities, etc.)
CREATE TABLE public.expense_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read categories" ON public.expense_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage categories" ON public.expense_categories FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')) WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- Suppliers
CREATE TABLE public.suppliers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read suppliers" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage suppliers" ON public.suppliers FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')) WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- Invoices (header)
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  venue TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'partial', 'cancelled')),
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  entered_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));
CREATE POLICY "Authorized can update invoices" ON public.invoices FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));
CREATE POLICY "Admins can delete invoices" ON public.invoices FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE INDEX idx_invoices_supplier ON public.invoices(supplier_id);
CREATE INDEX idx_invoices_venue ON public.invoices(venue);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_date ON public.invoices(invoice_date);

-- Invoice line items
CREATE TABLE public.invoice_line_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read line items" ON public.invoice_line_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can insert line items" ON public.invoice_line_items FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));
CREATE POLICY "Authorized can update line items" ON public.invoice_line_items FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));
CREATE POLICY "Admins can delete line items" ON public.invoice_line_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE INDEX idx_line_items_invoice ON public.invoice_line_items(invoice_id);
CREATE INDEX idx_line_items_category ON public.invoice_line_items(category_id);

-- Inventory items (master list)
CREATE TABLE public.inventory_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  unit_of_measure TEXT NOT NULL DEFAULT 'unit',
  par_level NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read inventory items" ON public.inventory_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can manage inventory items" ON public.inventory_items FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')) WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- Inventory periods (month-end counts per venue)
CREATE TABLE public.inventory_periods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue TEXT NOT NULL,
  period_label TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(venue, period_start, period_end)
);
ALTER TABLE public.inventory_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read periods" ON public.inventory_periods FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can manage periods" ON public.inventory_periods FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')) WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- Inventory counts (per item per period per venue)
CREATE TABLE public.inventory_counts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id UUID NOT NULL REFERENCES public.inventory_periods(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  venue TEXT NOT NULL,
  beginning_qty NUMERIC NOT NULL DEFAULT 0,
  purchases_qty NUMERIC NOT NULL DEFAULT 0,
  ending_qty NUMERIC NOT NULL DEFAULT 0,
  usage_qty NUMERIC GENERATED ALWAYS AS (beginning_qty + purchases_qty - ending_qty) STORED,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  total_usage_cost NUMERIC GENERATED ALWAYS AS ((beginning_qty + purchases_qty - ending_qty) * unit_cost) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(period_id, item_id, venue)
);
ALTER TABLE public.inventory_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read counts" ON public.inventory_counts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can manage counts" ON public.inventory_counts FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')) WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'));

-- Triggers for updated_at
CREATE TRIGGER update_expense_categories_updated_at BEFORE UPDATE ON public.expense_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_inventory_items_updated_at BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_inventory_periods_updated_at BEFORE UPDATE ON public.inventory_periods FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_inventory_counts_updated_at BEFORE UPDATE ON public.inventory_counts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default expense categories
INSERT INTO public.expense_categories (name, description) VALUES
  ('Food', 'Food ingredients and supplies'),
  ('Beverages', 'Alcoholic and non-alcoholic beverages'),
  ('Packaging', 'Takeaway containers, bags, etc.'),
  ('Cleaning', 'Cleaning supplies and chemicals'),
  ('Utilities', 'Electricity, water, gas, internet'),
  ('Equipment', 'Kitchen and bar equipment'),
  ('Other', 'Miscellaneous expenses');
