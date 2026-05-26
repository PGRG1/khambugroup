
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS ai_suggestions jsonb,
  ADD COLUMN IF NOT EXISTS ai_anomaly jsonb,
  ADD COLUMN IF NOT EXISTS ai_extract_meta jsonb;

ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS ai_suggestion jsonb,
  ADD COLUMN IF NOT EXISTS normalized_unit_cost numeric,
  ADD COLUMN IF NOT EXISTS pack_size_norm text,
  ADD COLUMN IF NOT EXISTS unit_norm text;

CREATE INDEX IF NOT EXISTS idx_invoices_ai_anomaly_gin ON public.invoices USING gin (ai_anomaly);
CREATE INDEX IF NOT EXISTS idx_line_items_supplier_product
  ON public.invoice_line_items (product_master_id)
  WHERE product_master_id IS NOT NULL;
