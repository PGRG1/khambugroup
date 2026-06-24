
ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS accepted_price NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS price_disputed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_free_unit_line BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES public.item_supplier_deals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_deal_id
  ON public.invoice_line_items (deal_id) WHERE deal_id IS NOT NULL;
