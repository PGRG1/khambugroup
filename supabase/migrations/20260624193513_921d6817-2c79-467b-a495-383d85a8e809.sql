ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS has_disputes      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS disputed_amount   numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS void_reason       text,
  ADD COLUMN IF NOT EXISTS voided_at         timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by         uuid;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check
  CHECK (status = ANY (ARRAY['pending','verified','approved','paid','unpaid',
                             'overdue','cancelled','disputed','voided']));