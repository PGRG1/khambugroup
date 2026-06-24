ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS dispute_resolution text
  CHECK (dispute_resolution IN ('credit_note','qty_received','resolved'));