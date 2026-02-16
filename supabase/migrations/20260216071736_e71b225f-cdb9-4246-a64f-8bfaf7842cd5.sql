
-- Add pack_size column for tracking weight per pack, ml per bottle, grams per unit, etc.
ALTER TABLE public.invoice_line_items
  ADD COLUMN pack_size text DEFAULT '';
