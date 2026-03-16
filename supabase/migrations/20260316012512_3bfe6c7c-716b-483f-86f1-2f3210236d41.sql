
ALTER TABLE public.product_master
  ADD COLUMN IF NOT EXISTS purchase_unit text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS purchase_unit_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_unit_type text NOT NULL DEFAULT 'gms',
  ADD COLUMN IF NOT EXISTS base_unit_qty numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cost_per_base_unit numeric NOT NULL DEFAULT 0;

-- Backfill existing rows
UPDATE public.product_master
SET
  purchase_unit = unit,
  purchase_unit_cost = unit_cost,
  base_unit_qty = 1,
  cost_per_base_unit = unit_cost
WHERE purchase_unit = '' OR purchase_unit_cost = 0;
