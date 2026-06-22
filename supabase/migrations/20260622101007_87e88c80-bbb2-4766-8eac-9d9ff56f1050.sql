ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS accepted_qty numeric,
  ADD COLUMN IF NOT EXISTS qty_difference numeric,
  ADD COLUMN IF NOT EXISTS receiving_reason text,
  ADD COLUMN IF NOT EXISTS receiving_note text;