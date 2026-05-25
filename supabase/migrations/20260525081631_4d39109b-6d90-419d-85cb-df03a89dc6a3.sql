
-- Credit notes table
CREATE TABLE IF NOT EXISTS public.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  credit_note_number text NOT NULL DEFAULT '',
  credit_note_date date NOT NULL DEFAULT CURRENT_DATE,
  original_amount numeric NOT NULL CHECK (original_amount > 0),
  remaining_balance numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'approved',
  venue text,
  notes text NOT NULL DEFAULT '',
  attachment_url text,
  source_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_supplier ON public.credit_notes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_status ON public.credit_notes(status);

ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read credit_notes" ON public.credit_notes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can manage credit_notes" ON public.credit_notes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));

CREATE OR REPLACE FUNCTION public.validate_credit_note_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('draft','approved','fully_applied','voided') THEN
    RAISE EXCEPTION 'Invalid credit_note status: %', NEW.status;
  END IF;
  IF NEW.remaining_balance < 0 THEN
    RAISE EXCEPTION 'credit_notes.remaining_balance cannot be negative';
  END IF;
  IF NEW.remaining_balance <= 0.001 AND NEW.status = 'approved' THEN
    NEW.status := 'fully_applied';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_credit_note ON public.credit_notes;
CREATE TRIGGER trg_validate_credit_note BEFORE INSERT OR UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.validate_credit_note_status();

CREATE TRIGGER trg_credit_notes_updated_at BEFORE UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Extend payment_allocations
ALTER TABLE public.payment_allocations
  ADD COLUMN IF NOT EXISTS credit_note_id uuid REFERENCES public.credit_notes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS credit_note_amount_applied numeric NOT NULL DEFAULT 0;

ALTER TABLE public.payment_allocations DROP CONSTRAINT IF EXISTS payment_allocations_amount_allocated_check;
ALTER TABLE public.payment_allocations
  ADD CONSTRAINT payment_allocations_amounts_check
  CHECK (amount_allocated >= 0 AND credit_note_amount_applied >= 0 AND (amount_allocated + credit_note_amount_applied) > 0);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_credit_note ON public.payment_allocations(credit_note_id);

-- Allow zero-cash payments (covered fully by credit note)
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_amount_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_amount_check CHECK (amount >= 0);

CREATE INDEX IF NOT EXISTS idx_payments_account_date ON public.payments(paid_from_account_id, payment_date);

-- Update validation: compare only cash portion against payments.amount
CREATE OR REPLACE FUNCTION public.validate_allocation_vs_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pay_amount numeric;
  total_alloc numeric;
BEGIN
  SELECT amount INTO pay_amount FROM public.payments WHERE id = NEW.payment_id;
  SELECT COALESCE(SUM(amount_allocated),0) INTO total_alloc
    FROM public.payment_allocations WHERE payment_id = NEW.payment_id AND id <> NEW.id;
  IF total_alloc + NEW.amount_allocated > pay_amount + 0.01 THEN
    RAISE EXCEPTION 'Total cash allocations (%) exceed payment amount (%)', total_alloc + NEW.amount_allocated, pay_amount;
  END IF;
  RETURN NEW;
END $$;

-- Recompute counts credit-note applied amount as well
CREATE OR REPLACE FUNCTION public.recompute_invoice_from_allocations(p_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  total_cash numeric;
  total_credit numeric;
  total_paid numeric;
  inv_total numeric;
  remaining numeric;
  new_status text;
  new_bank_match text;
BEGIN
  SELECT
    COALESCE(SUM(amount_allocated),0),
    COALESCE(SUM(credit_note_amount_applied),0)
  INTO total_cash, total_credit
  FROM public.payment_allocations WHERE invoice_id = p_invoice_id;
  total_paid := total_cash + total_credit;
  SELECT total_amount INTO inv_total FROM public.invoices WHERE id = p_invoice_id;
  remaining := GREATEST(0, COALESCE(inv_total,0) - total_paid);
  IF remaining <= 0.01 AND total_paid > 0 THEN
    new_status := CASE WHEN total_cash <= 0.01 AND total_credit > 0 THEN 'credit_note_applied' ELSE 'paid' END;
  ELSIF total_paid > 0 THEN new_status := 'partially_paid';
  ELSE new_status := 'unpaid';
  END IF;
  IF total_cash > 0.01 THEN new_bank_match := 'awaiting_bank_match';
  ELSIF total_credit > 0.01 AND remaining <= 0.01 THEN new_bank_match := 'not_ready';
  ELSE new_bank_match := 'not_ready';
  END IF;
  UPDATE public.invoices
    SET amount_paid = total_paid,
        remaining_balance = remaining,
        payment_status = new_status,
        bank_match_status = new_bank_match
    WHERE id = p_invoice_id;
END $$;

-- RPC supporting credit notes
CREATE OR REPLACE FUNCTION public.record_payment_with_allocations(p_payment jsonb, p_allocations jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_id uuid;
  alloc jsonb;
  v_cn_id uuid;
  v_cn_amt numeric;
  v_cash numeric;
  v_remaining numeric;
BEGIN
  INSERT INTO public.payments (
    payment_date, amount, payment_method, paid_from_account_id,
    reference_number, cheque_number, notes, supplier_id, match_status, created_by
  ) VALUES (
    (p_payment->>'payment_date')::date,
    (p_payment->>'amount')::numeric,
    p_payment->>'payment_method',
    NULLIF(p_payment->>'paid_from_account_id','')::uuid,
    COALESCE(p_payment->>'reference_number',''),
    COALESCE(p_payment->>'cheque_number',''),
    COALESCE(p_payment->>'notes',''),
    NULLIF(p_payment->>'supplier_id','')::uuid,
    COALESCE(p_payment->>'match_status', CASE WHEN (p_payment->>'amount')::numeric > 0 THEN 'awaiting_bank_match' ELSE 'not_required' END),
    auth.uid()
  ) RETURNING id INTO new_id;

  FOR alloc IN SELECT * FROM jsonb_array_elements(COALESCE(p_allocations,'[]'::jsonb))
  LOOP
    v_cash := COALESCE((alloc->>'amount_allocated')::numeric, 0);
    v_cn_amt := COALESCE((alloc->>'credit_note_amount_applied')::numeric, 0);
    v_cn_id := NULLIF(alloc->>'credit_note_id','')::uuid;

    IF (v_cash + v_cn_amt) > 0 THEN
      INSERT INTO public.payment_allocations (payment_id, invoice_id, amount_allocated, credit_note_id, credit_note_amount_applied)
      VALUES (new_id, (alloc->>'invoice_id')::uuid, v_cash, v_cn_id, v_cn_amt);

      IF v_cn_id IS NOT NULL AND v_cn_amt > 0 THEN
        SELECT remaining_balance INTO v_remaining FROM public.credit_notes WHERE id = v_cn_id FOR UPDATE;
        IF v_remaining IS NULL OR v_remaining + 0.01 < v_cn_amt THEN
          RAISE EXCEPTION 'Credit note % has insufficient remaining balance', v_cn_id;
        END IF;
        UPDATE public.credit_notes
          SET remaining_balance = GREATEST(0, remaining_balance - v_cn_amt)
          WHERE id = v_cn_id;
      END IF;
    END IF;
  END LOOP;

  RETURN new_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.record_payment_with_allocations(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_payment_with_allocations(jsonb, jsonb) TO authenticated;
