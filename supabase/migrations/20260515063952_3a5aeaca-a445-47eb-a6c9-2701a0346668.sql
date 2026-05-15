ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS invoice_rounding_mode TEXT NOT NULL DEFAULT 'sum_then_round';

ALTER TABLE public.suppliers
  DROP CONSTRAINT IF EXISTS suppliers_invoice_rounding_mode_check;

ALTER TABLE public.suppliers
  ADD CONSTRAINT suppliers_invoice_rounding_mode_check
  CHECK (invoice_rounding_mode IN ('sum_then_round', 'round_then_sum', 'integer'));

UPDATE public.suppliers
   SET invoice_rounding_mode = 'round_then_sum'
 WHERE lower(name) LIKE '%vegfresh%' AND invoice_rounding_mode = 'sum_then_round';

UPDATE public.suppliers
   SET invoice_rounding_mode = 'integer'
 WHERE lower(name) LIKE '%beverage world%' AND invoice_rounding_mode = 'sum_then_round';