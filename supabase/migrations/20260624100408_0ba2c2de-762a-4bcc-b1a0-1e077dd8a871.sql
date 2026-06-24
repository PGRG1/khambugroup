ALTER TABLE public.product_master
  ADD COLUMN IF NOT EXISTS purchase_yield numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS cooking_yield  numeric NOT NULL DEFAULT 100;