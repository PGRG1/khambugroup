
-- 1. Schema: add tenant_id to root tables
ALTER TABLE public.payment_processors             ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.payment_settlement_imports     ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.payment_settlement_batches     ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- 2. Uniqueness: processor name unique per tenant
ALTER TABLE public.payment_processors DROP CONSTRAINT IF EXISTS payment_processors_name_key;
ALTER TABLE public.payment_processors DROP CONSTRAINT IF EXISTS payment_processors_tenant_name_key;
ALTER TABLE public.payment_processors ADD  CONSTRAINT payment_processors_tenant_name_key UNIQUE (tenant_id, name);

-- 3. Drop old policies (exact names)
DROP POLICY IF EXISTS "Authenticated can read payment_processors" ON public.payment_processors;
DROP POLICY IF EXISTS "Authorized can manage payment_processors" ON public.payment_processors;

DROP POLICY IF EXISTS "Authenticated can read payment_processor_merchants" ON public.payment_processor_merchants;
DROP POLICY IF EXISTS "Authorized can manage payment_processor_merchants" ON public.payment_processor_merchants;
DROP POLICY IF EXISTS "tenant_select on payment_processor_merchants" ON public.payment_processor_merchants;
DROP POLICY IF EXISTS "tenant_write on payment_processor_merchants" ON public.payment_processor_merchants;

DROP POLICY IF EXISTS "Authenticated can read payment_settlement_imports" ON public.payment_settlement_imports;
DROP POLICY IF EXISTS "Authorized can manage payment_settlement_imports" ON public.payment_settlement_imports;

DROP POLICY IF EXISTS "Authenticated can read payment_settlement_batches" ON public.payment_settlement_batches;
DROP POLICY IF EXISTS "Authorized can manage payment_settlement_batches" ON public.payment_settlement_batches;

DROP POLICY IF EXISTS "Authenticated can read payment_settlement_lines" ON public.payment_settlement_lines;
DROP POLICY IF EXISTS "Authorized can manage payment_settlement_lines" ON public.payment_settlement_lines;

DROP POLICY IF EXISTS "Authenticated can read payment_settlement_transactions" ON public.payment_settlement_transactions;
DROP POLICY IF EXISTS "Authorized can manage payment_settlement_transactions" ON public.payment_settlement_transactions;

DROP POLICY IF EXISTS "fee_rates_select_authenticated" ON public.payment_processor_fee_rates;
DROP POLICY IF EXISTS "fee_rates_admin_all" ON public.payment_processor_fee_rates;

-- 4. Enable RLS (idempotent)
ALTER TABLE public.payment_processors             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_processor_merchants    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_settlement_imports     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_settlement_batches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_settlement_lines       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_settlement_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_processor_fee_rates    ENABLE ROW LEVEL SECURITY;

-- 5. New tenant-scoped policies

-- payment_processors (direct tenant_id)
DROP POLICY IF EXISTS "payment_processors_tenant_select" ON public.payment_processors;
DROP POLICY IF EXISTS "payment_processors_tenant_all" ON public.payment_processors;
CREATE POLICY "payment_processors_tenant_select" ON public.payment_processors
  FOR SELECT USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "payment_processors_tenant_all" ON public.payment_processors
  FOR ALL USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

-- payment_settlement_imports (direct tenant_id)
DROP POLICY IF EXISTS "payment_settlement_imports_tenant_select" ON public.payment_settlement_imports;
DROP POLICY IF EXISTS "payment_settlement_imports_tenant_all" ON public.payment_settlement_imports;
CREATE POLICY "payment_settlement_imports_tenant_select" ON public.payment_settlement_imports
  FOR SELECT USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "payment_settlement_imports_tenant_all" ON public.payment_settlement_imports
  FOR ALL USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

-- payment_settlement_batches (direct tenant_id)
DROP POLICY IF EXISTS "payment_settlement_batches_tenant_select" ON public.payment_settlement_batches;
DROP POLICY IF EXISTS "payment_settlement_batches_tenant_all" ON public.payment_settlement_batches;
CREATE POLICY "payment_settlement_batches_tenant_select" ON public.payment_settlement_batches
  FOR SELECT USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "payment_settlement_batches_tenant_all" ON public.payment_settlement_batches
  FOR ALL USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

-- payment_processor_merchants (via processor)
DROP POLICY IF EXISTS "payment_processor_merchants_tenant_select" ON public.payment_processor_merchants;
DROP POLICY IF EXISTS "payment_processor_merchants_tenant_all" ON public.payment_processor_merchants;
CREATE POLICY "payment_processor_merchants_tenant_select" ON public.payment_processor_merchants
  FOR SELECT USING (
    public.is_super_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.payment_processors pp
      WHERE pp.id = payment_processor_merchants.processor_id
        AND public.user_has_tenant(auth.uid(), pp.tenant_id)
    )
  );
CREATE POLICY "payment_processor_merchants_tenant_all" ON public.payment_processor_merchants
  FOR ALL USING (
    public.is_super_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.payment_processors pp
      WHERE pp.id = payment_processor_merchants.processor_id
        AND public.user_has_tenant(auth.uid(), pp.tenant_id)
    )
  ) WITH CHECK (
    public.is_super_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.payment_processors pp
      WHERE pp.id = payment_processor_merchants.processor_id
        AND public.user_has_tenant(auth.uid(), pp.tenant_id)
    )
  );

-- payment_settlement_lines (via batch)
DROP POLICY IF EXISTS "payment_settlement_lines_tenant_select" ON public.payment_settlement_lines;
DROP POLICY IF EXISTS "payment_settlement_lines_tenant_all" ON public.payment_settlement_lines;
CREATE POLICY "payment_settlement_lines_tenant_select" ON public.payment_settlement_lines
  FOR SELECT USING (
    public.is_super_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.payment_settlement_batches b
      WHERE b.id = payment_settlement_lines.batch_id
        AND public.user_has_tenant(auth.uid(), b.tenant_id)
    )
  );
CREATE POLICY "payment_settlement_lines_tenant_all" ON public.payment_settlement_lines
  FOR ALL USING (
    public.is_super_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.payment_settlement_batches b
      WHERE b.id = payment_settlement_lines.batch_id
        AND public.user_has_tenant(auth.uid(), b.tenant_id)
    )
  ) WITH CHECK (
    public.is_super_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.payment_settlement_batches b
      WHERE b.id = payment_settlement_lines.batch_id
        AND public.user_has_tenant(auth.uid(), b.tenant_id)
    )
  );

-- payment_settlement_transactions (via batch)
DROP POLICY IF EXISTS "payment_settlement_transactions_tenant_select" ON public.payment_settlement_transactions;
DROP POLICY IF EXISTS "payment_settlement_transactions_tenant_all" ON public.payment_settlement_transactions;
CREATE POLICY "payment_settlement_transactions_tenant_select" ON public.payment_settlement_transactions
  FOR SELECT USING (
    public.is_super_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.payment_settlement_batches b
      WHERE b.id = payment_settlement_transactions.batch_id
        AND public.user_has_tenant(auth.uid(), b.tenant_id)
    )
  );
CREATE POLICY "payment_settlement_transactions_tenant_all" ON public.payment_settlement_transactions
  FOR ALL USING (
    public.is_super_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.payment_settlement_batches b
      WHERE b.id = payment_settlement_transactions.batch_id
        AND public.user_has_tenant(auth.uid(), b.tenant_id)
    )
  ) WITH CHECK (
    public.is_super_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.payment_settlement_batches b
      WHERE b.id = payment_settlement_transactions.batch_id
        AND public.user_has_tenant(auth.uid(), b.tenant_id)
    )
  );

-- payment_processor_fee_rates (via processor)
DROP POLICY IF EXISTS "payment_processor_fee_rates_tenant_select" ON public.payment_processor_fee_rates;
DROP POLICY IF EXISTS "payment_processor_fee_rates_tenant_all" ON public.payment_processor_fee_rates;
CREATE POLICY "payment_processor_fee_rates_tenant_select" ON public.payment_processor_fee_rates
  FOR SELECT USING (
    public.is_super_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.payment_processors pp
      WHERE pp.id = payment_processor_fee_rates.processor_id
        AND public.user_has_tenant(auth.uid(), pp.tenant_id)
    )
  );
CREATE POLICY "payment_processor_fee_rates_tenant_all" ON public.payment_processor_fee_rates
  FOR ALL USING (
    public.is_super_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.payment_processors pp
      WHERE pp.id = payment_processor_fee_rates.processor_id
        AND public.user_has_tenant(auth.uid(), pp.tenant_id)
    )
  ) WITH CHECK (
    public.is_super_admin(auth.uid()) OR EXISTS (
      SELECT 1 FROM public.payment_processors pp
      WHERE pp.id = payment_processor_fee_rates.processor_id
        AND public.user_has_tenant(auth.uid(), pp.tenant_id)
    )
  );

-- 6. Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_processors             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_processor_merchants    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_settlement_imports     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_settlement_batches     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_settlement_lines       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_settlement_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_processor_fee_rates    TO authenticated;

GRANT ALL ON public.payment_processors             TO service_role;
GRANT ALL ON public.payment_processor_merchants    TO service_role;
GRANT ALL ON public.payment_settlement_imports     TO service_role;
GRANT ALL ON public.payment_settlement_batches     TO service_role;
GRANT ALL ON public.payment_settlement_lines       TO service_role;
GRANT ALL ON public.payment_settlement_transactions TO service_role;
GRANT ALL ON public.payment_processor_fee_rates    TO service_role;

-- 7. Backfill existing rows to first tenant (KHAMBU)
WITH t AS (SELECT id FROM public.tenants ORDER BY created_at LIMIT 1)
UPDATE public.payment_processors SET tenant_id = (SELECT id FROM t) WHERE tenant_id IS NULL;

WITH t AS (SELECT id FROM public.tenants ORDER BY created_at LIMIT 1)
UPDATE public.payment_settlement_imports SET tenant_id = (SELECT id FROM t) WHERE tenant_id IS NULL;

WITH t AS (SELECT id FROM public.tenants ORDER BY created_at LIMIT 1)
UPDATE public.payment_settlement_batches SET tenant_id = (SELECT id FROM t) WHERE tenant_id IS NULL;
