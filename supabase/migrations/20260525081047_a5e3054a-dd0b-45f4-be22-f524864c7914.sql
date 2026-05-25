
-- Payment header
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_date date NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL,
  paid_from_account_id uuid REFERENCES public.bank_accounts(id),
  reference_number text NOT NULL DEFAULT '',
  cheque_number text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  supplier_id uuid,
  bank_transaction_id uuid REFERENCES public.bank_transactions(id),
  match_status text NOT NULL DEFAULT 'awaiting_bank_match',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount_allocated numeric NOT NULL CHECK (amount_allocated > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON public.payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice ON public.payment_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_supplier ON public.payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON public.payments(payment_date);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read payments" ON public.payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can manage payments" ON public.payments FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));

CREATE POLICY "Authenticated can read payment_allocations" ON public.payment_allocations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authorized can manage payment_allocations" ON public.payment_allocations FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role));

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validate allocation cannot exceed payment amount
CREATE OR REPLACE FUNCTION public.validate_allocation_vs_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pay_amount numeric;
  total_alloc numeric;
BEGIN
  SELECT amount INTO pay_amount FROM public.payments WHERE id = NEW.payment_id;
  SELECT COALESCE(SUM(amount_allocated),0) INTO total_alloc
    FROM public.payment_allocations WHERE payment_id = NEW.payment_id AND id <> NEW.id;
  IF total_alloc + NEW.amount_allocated > pay_amount + 0.01 THEN
    RAISE EXCEPTION 'Total allocations (%) exceed payment amount (%)', total_alloc + NEW.amount_allocated, pay_amount;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_validate_alloc_vs_payment
  BEFORE INSERT OR UPDATE ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.validate_allocation_vs_payment();

-- Recompute invoice balance from allocations
CREATE OR REPLACE FUNCTION public.recompute_invoice_from_allocations(p_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  total_paid numeric;
  inv_total numeric;
  remaining numeric;
  new_status text;
BEGIN
  SELECT COALESCE(SUM(amount_allocated),0) INTO total_paid
    FROM public.payment_allocations WHERE invoice_id = p_invoice_id;
  SELECT total_amount INTO inv_total FROM public.invoices WHERE id = p_invoice_id;
  remaining := GREATEST(0, COALESCE(inv_total,0) - total_paid);
  IF remaining <= 0.01 AND total_paid > 0 THEN new_status := 'paid';
  ELSIF total_paid > 0 THEN new_status := 'partially_paid';
  ELSE new_status := 'unpaid';
  END IF;
  UPDATE public.invoices
    SET amount_paid = total_paid,
        remaining_balance = remaining,
        payment_status = new_status,
        bank_match_status = CASE WHEN total_paid > 0 THEN 'awaiting_bank_match' ELSE 'not_ready' END
    WHERE id = p_invoice_id;
END $$;

-- Trigger to recompute invoice when allocations change
CREATE OR REPLACE FUNCTION public.tg_recompute_invoice_alloc()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_invoice_from_allocations(OLD.invoice_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_invoice_from_allocations(NEW.invoice_id);
    IF TG_OP = 'UPDATE' AND OLD.invoice_id <> NEW.invoice_id THEN
      PERFORM public.recompute_invoice_from_allocations(OLD.invoice_id);
    END IF;
    RETURN NEW;
  END IF;
END $$;

CREATE TRIGGER trg_recompute_invoice_alloc
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_invoice_alloc();

-- RPC to atomically record a payment + allocations
CREATE OR REPLACE FUNCTION public.record_payment_with_allocations(
  p_payment jsonb,
  p_allocations jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_id uuid;
  alloc jsonb;
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
    COALESCE(p_payment->>'match_status','awaiting_bank_match'),
    auth.uid()
  ) RETURNING id INTO new_id;

  FOR alloc IN SELECT * FROM jsonb_array_elements(COALESCE(p_allocations,'[]'::jsonb))
  LOOP
    IF (alloc->>'amount_allocated')::numeric > 0 THEN
      INSERT INTO public.payment_allocations (payment_id, invoice_id, amount_allocated)
      VALUES (new_id, (alloc->>'invoice_id')::uuid, (alloc->>'amount_allocated')::numeric);
    END IF;
  END LOOP;

  RETURN new_id;
END $$;

-- Backfill from invoice_payments (1:1)
INSERT INTO public.payments (
  id, payment_date, amount, payment_method, paid_from_account_id,
  reference_number, notes, match_status, created_at
)
SELECT
  ip.id,
  ip.payment_date,
  ip.amount,
  COALESCE(ip.payment_method,'Bank Transfer'),
  ip.bank_account_id,
  COALESCE(ip.reference,''),
  COALESCE(ip.notes,''),
  COALESCE(ip.match_status,'awaiting_bank_match'),
  COALESCE(ip.created_at, now())
FROM public.invoice_payments ip
WHERE ip.amount > 0
  AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.id = ip.id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.payment_allocations (payment_id, invoice_id, amount_allocated, created_at)
SELECT ip.id, ip.invoice_id, ip.amount, COALESCE(ip.created_at, now())
FROM public.invoice_payments ip
WHERE ip.invoice_id IS NOT NULL AND ip.amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_allocations pa
    WHERE pa.payment_id = ip.id AND pa.invoice_id = ip.invoice_id
  );
