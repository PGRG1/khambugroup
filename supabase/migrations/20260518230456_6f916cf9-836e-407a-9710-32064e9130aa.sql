CREATE TABLE public.pl_structure_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('section','item','sum','spacer')),
  label text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  indent integer NOT NULL DEFAULT 0,
  is_bold boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pl_structure_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read pl_structure_rows"
  ON public.pl_structure_rows FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authorized can manage pl_structure_rows"
  ON public.pl_structure_rows FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));

CREATE TRIGGER trg_pl_structure_rows_updated_at
  BEFORE UPDATE ON public.pl_structure_rows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_pl_structure_rows_sort ON public.pl_structure_rows(sort_order);

-- Seed with current hardcoded structure (between Revenue and computed footer)
INSERT INTO public.pl_structure_rows (kind, label, sort_order, indent, is_bold) VALUES
  ('section', 'Cost of Goods Sold', 100, 0, false),
  ('item',    'Beverage Cost',      110, 1, false),
  ('item',    'Food Cost',          120, 1, false),
  ('sum',     'Total COGS',         130, 1, false),
  ('spacer',  '',                   140, 0, false),

  ('section', 'Rent & Related',     200, 0, false),
  ('item',    'Base Rental',        210, 1, false),
  ('item',    'Rental Share (-)',   220, 1, false),
  ('item',    'Government Fees',    230, 1, false),
  ('item',    'Management Fees',    240, 1, false),
  ('sum',     'Total Rent',         250, 1, false),
  ('spacer',  '',                   260, 0, false),

  ('section', 'Salaries',           300, 0, false),
  ('item',    'FTE Salary',         310, 1, false),
  ('item',    'FTE MPF',            320, 1, false),
  ('sum',     'Total FTE',          330, 1, false),
  ('item',    'PTE Salary',         340, 1, false),
  ('item',    'PTE MPF',            350, 1, false),
  ('sum',     'Total PTE',          360, 1, false),
  ('spacer',  '',                   370, 0, false),

  ('section', 'Utilities',          400, 0, false),
  ('item',    'Electricity',        410, 1, false),
  ('item',    'Water',              420, 1, false),
  ('item',    'HKT/PCCW',           430, 1, false),
  ('sum',     'Total Utilities',    440, 1, false),
  ('spacer',  '',                   450, 0, false),

  ('section', 'Other Operating Expenses', 500, 0, false),
  ('item',    'Card Processing Fees',     510, 1, false),
  ('item',    'Office Administration Fees', 520, 1, false),
  ('item',    'Other Expenses',           530, 1, false),
  ('item',    'Miscellaneous Expenses',   540, 1, false),
  ('sum',     'Total Other OpEx',         550, 1, false),
  ('spacer',  '',                         560, 0, false),

  ('section', 'Depreciation & Amortization', 600, 0, false),
  ('item',    'Depreciation',              610, 1, false),
  ('item',    'Amortization',              620, 1, false),
  ('sum',     'Total D&A',                 630, 1, false);
