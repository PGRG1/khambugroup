ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS grn_id uuid REFERENCES public.goods_received_notes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_grn_id ON public.invoices(grn_id);

ALTER TABLE public.grn_items
  ADD COLUMN IF NOT EXISTS accepted_qty numeric,
  ADD COLUMN IF NOT EXISTS qty_difference numeric,
  ADD COLUMN IF NOT EXISTS receiving_reason text,
  ADD COLUMN IF NOT EXISTS receiving_note text;