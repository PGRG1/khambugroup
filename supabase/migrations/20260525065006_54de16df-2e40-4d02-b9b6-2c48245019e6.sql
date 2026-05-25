
-- Add new payable workflow columns
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS scheduled_payment_date date,
  ADD COLUMN IF NOT EXISTS bank_match_status text NOT NULL DEFAULT 'not_ready';

ALTER TABLE public.invoice_payments
  ADD COLUMN IF NOT EXISTS bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bank_transaction_id uuid REFERENCES public.bank_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS match_status text NOT NULL DEFAULT 'awaiting_bank_match',
  ADD COLUMN IF NOT EXISTS reference text NOT NULL DEFAULT '';

-- Validation triggers (not CHECK constraints, per project rules)
CREATE OR REPLACE FUNCTION public.validate_invoice_payable_statuses()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.payment_status IS NOT NULL AND NEW.payment_status NOT IN (
    'unpaid','scheduled','partially_paid','paid','overdue','credit_note_applied','voided'
  ) THEN
    RAISE EXCEPTION 'Invalid payment_status: %', NEW.payment_status;
  END IF;
  IF NEW.bank_match_status IS NOT NULL AND NEW.bank_match_status NOT IN (
    'not_ready','awaiting_bank_match','matched','possible_match','needs_review'
  ) THEN
    RAISE EXCEPTION 'Invalid bank_match_status: %', NEW.bank_match_status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_invoice_payable_statuses ON public.invoices;
CREATE TRIGGER trg_validate_invoice_payable_statuses
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_payable_statuses();

CREATE OR REPLACE FUNCTION public.validate_invoice_payment_match_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.match_status IS NOT NULL AND NEW.match_status NOT IN (
    'not_ready','awaiting_bank_match','matched','possible_match','needs_review'
  ) THEN
    RAISE EXCEPTION 'Invalid match_status: %', NEW.match_status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_invoice_payment_match_status ON public.invoice_payments;
CREATE TRIGGER trg_validate_invoice_payment_match_status
  BEFORE INSERT OR UPDATE ON public.invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_payment_match_status();

-- Backfill bank_match_status on invoices
UPDATE public.invoices
SET bank_match_status = CASE
  WHEN payment_status = 'paid' THEN 'awaiting_bank_match'
  ELSE 'not_ready'
END
WHERE bank_match_status = 'not_ready';

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_invoices_review_status ON public.invoices(review_status);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON public.invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_bank_account ON public.invoice_payments(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_bank_txn ON public.invoice_payments(bank_transaction_id);
