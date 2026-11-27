-- Rebates run From–To (no "counted every year"), and an earned rebate is recorded as received on Purchasing › Deals:
-- as a credit note (a normal supplier credit note, used against their invoices) or as a payment.

-- 1. From–To dates replace the repeating period.
ALTER TABLE public.supplier_rebates ALTER COLUMN period DROP NOT NULL;
ALTER TABLE public.supplier_rebates DROP CONSTRAINT IF EXISTS supplier_rebates_period_check;
ALTER TABLE public.supplier_rebates ADD CONSTRAINT supplier_rebates_period_check CHECK (period IS NULL OR period IN ('monthly','quarterly','yearly'));
ALTER TABLE public.supplier_rebates DROP CONSTRAINT IF EXISTS supplier_rebates_dates_check;
ALTER TABLE public.supplier_rebates ADD CONSTRAINT supplier_rebates_dates_check CHECK (period IS NOT NULL OR ends_on IS NOT NULL);

-- 2. Rebates received.
CREATE TABLE IF NOT EXISTS public.supplier_rebate_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rebate_id uuid NOT NULL REFERENCES public.supplier_rebates(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  period_from date NOT NULL,
  period_to date NOT NULL,
  received_as text NOT NULL CHECK (received_as IN ('credit_note','payment')),
  amount numeric NOT NULL CHECK (amount > 0),
  received_on date NOT NULL,
  credit_note_id uuid REFERENCES public.credit_notes(id) ON DELETE SET NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_rebate_receipts_rebate ON public.supplier_rebate_receipts (tenant_id, rebate_id, period_from);
ALTER TABLE public.supplier_rebate_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "supplier_rebate_receipts read" ON public.supplier_rebate_receipts;
CREATE POLICY "supplier_rebate_receipts read" ON public.supplier_rebate_receipts FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
-- Same people who can book a supplier credit note.
DROP POLICY IF EXISTS "supplier_rebate_receipts write" ON public.supplier_rebate_receipts;
CREATE POLICY "supplier_rebate_receipts write" ON public.supplier_rebate_receipts FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

-- 3. Record one: a credit note also books an approved supplier credit note. Runs as the caller, so RLS applies.
CREATE OR REPLACE FUNCTION public.record_rebate_received(p_rebate uuid, p_as text, p_amount numeric, p_date date, p_from date, p_to date)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE r record; cn uuid; rid uuid;
BEGIN
  SELECT id, tenant_id, supplier_id INTO r FROM public.supplier_rebates WHERE id = p_rebate;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Rebate not found'; END IF;
  IF p_as NOT IN ('credit_note','payment') THEN RAISE EXCEPTION 'Received as must be credit_note or payment'; END IF;
  IF coalesce(p_amount, 0) <= 0 THEN RAISE EXCEPTION 'Enter an amount'; END IF;
  IF p_as = 'credit_note' THEN
    INSERT INTO public.credit_notes (tenant_id, supplier_id, credit_note_number, credit_note_date, original_amount, remaining_balance, status, notes)
    VALUES (r.tenant_id, r.supplier_id, 'Rebate ' || to_char(p_from, 'DD Mon YYYY') || ' – ' || to_char(p_to, 'DD Mon YYYY'),
            p_date, p_amount, p_amount, 'approved', 'Supplier rebate')
    RETURNING id INTO cn;
  END IF;
  INSERT INTO public.supplier_rebate_receipts (tenant_id, rebate_id, supplier_id, period_from, period_to, received_as, amount, received_on, credit_note_id)
  VALUES (r.tenant_id, r.id, r.supplier_id, p_from, p_to, p_as, p_amount, p_date, cn)
  RETURNING id INTO rid;
  RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.record_rebate_received(uuid, text, numeric, date, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_rebate_received(uuid, text, numeric, date, date, date) TO authenticated;
