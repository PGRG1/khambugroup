ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS discount_mode text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS discount_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_discount_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS header_discount_share numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_unit_cost numeric NOT NULL DEFAULT 0;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS discount_mode text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS discount_rate numeric NOT NULL DEFAULT 0;

UPDATE public.invoice_line_items
SET
  line_discount_amount = COALESCE(discount, 0),
  discount_mode = 'fixed',
  discount_rate = 0,
  header_discount_share = 0,
  net_unit_cost = CASE
    WHEN COALESCE(quantity, 0) > 0
      THEN (COALESCE(quantity, 0) * COALESCE(unit_price, 0) - COALESCE(discount, 0)) / quantity
    ELSE COALESCE(unit_price, 0)
  END
WHERE net_unit_cost = 0;