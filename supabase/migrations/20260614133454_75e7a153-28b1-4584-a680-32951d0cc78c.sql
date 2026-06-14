
-- Per-target framing: absolute HK$ ceiling, or % of revenue
ALTER TABLE public.kpi_targets
  ADD COLUMN IF NOT EXISTS target_mode text NOT NULL DEFAULT 'absolute';

ALTER TABLE public.kpi_targets
  DROP CONSTRAINT IF EXISTS kpi_targets_target_mode_check;
ALTER TABLE public.kpi_targets
  ADD CONSTRAINT kpi_targets_target_mode_check
  CHECK (target_mode IN ('absolute','ratio_of_revenue'));

-- Seed 3 monthly cost KPI cards (idempotent on kpi_type)
INSERT INTO public.kpi_cards (kpi_name, kpi_category, kpi_type, unit, description, active)
SELECT 'Food Cost',      'cost', 'monthly_food_cost',      'currency', 'Monthly food spend pulled from invoices (level1 = Food).',      true
WHERE NOT EXISTS (SELECT 1 FROM public.kpi_cards WHERE kpi_type = 'monthly_food_cost');

INSERT INTO public.kpi_cards (kpi_name, kpi_category, kpi_type, unit, description, active)
SELECT 'Beverage Cost',  'cost', 'monthly_beverage_cost',  'currency', 'Monthly beverage spend pulled from invoices (level1 = Beverages).', true
WHERE NOT EXISTS (SELECT 1 FROM public.kpi_cards WHERE kpi_type = 'monthly_beverage_cost');

INSERT INTO public.kpi_cards (kpi_name, kpi_category, kpi_type, unit, description, active)
SELECT 'Supplies Cost', 'cost', 'monthly_supplies_cost', 'currency', 'Monthly supplies spend pulled from invoices (level1 = Supplies).', true
WHERE NOT EXISTS (SELECT 1 FROM public.kpi_cards WHERE kpi_type = 'monthly_supplies_cost');
