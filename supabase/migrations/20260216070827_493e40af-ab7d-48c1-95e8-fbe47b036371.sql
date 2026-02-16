
-- Add item_code and weight columns to invoice_line_items
ALTER TABLE public.invoice_line_items
  ADD COLUMN item_code text DEFAULT '',
  ADD COLUMN weight numeric DEFAULT null;
