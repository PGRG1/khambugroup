ALTER TABLE public.sales_receipt_intakes DROP CONSTRAINT IF EXISTS sales_receipt_intakes_status_check;
ALTER TABLE public.sales_receipt_intakes ADD CONSTRAINT sales_receipt_intakes_status_check CHECK (status IN ('needs_review','resolved','posted'));
ALTER TABLE public.sales_receipt_intakes ADD COLUMN IF NOT EXISTS posted_record_id uuid REFERENCES public.sales_records(id);
ALTER TABLE public.sales_receipt_intakes ADD COLUMN IF NOT EXISTS verification jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS sales_receipt_intakes_posted_record_uq ON public.sales_receipt_intakes(posted_record_id) WHERE posted_record_id IS NOT NULL;