ALTER TABLE public.product_master
  ADD COLUMN IF NOT EXISTS stock_uom text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS stock_qty numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cost_per_stock_unit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes text DEFAULT '';