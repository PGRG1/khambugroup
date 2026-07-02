
-- Expand journal_entries.source_type to include petty cash
ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_source_type_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'sales','sales_summary','invoice','invoice_payment','payroll_accrual','payroll_payment',
    'mpf_payment','settlement_fee','settlement_clearing','bank_fee','bank_txn','manual',
    'adjustment','opening','bank_transaction','expense_bill','petty_cash','petty_cash_replenishment'
  ]));

-- ============ petty_cash_floats ============
CREATE TABLE IF NOT EXISTS public.petty_cash_floats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  venue text NOT NULL,
  gl_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  float_amount numeric(14,2) NOT NULL DEFAULT 2000,
  replenish_threshold numeric(14,2) NOT NULL DEFAULT 500,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'petty_cash_floats_tenant_name_key'
  ) THEN
    ALTER TABLE public.petty_cash_floats ADD CONSTRAINT petty_cash_floats_tenant_name_key UNIQUE (tenant_id, name);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.petty_cash_floats TO authenticated;
GRANT ALL ON public.petty_cash_floats TO service_role;
ALTER TABLE public.petty_cash_floats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "petty_cash_floats_select" ON public.petty_cash_floats;
CREATE POLICY "petty_cash_floats_select" ON public.petty_cash_floats FOR SELECT
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "petty_cash_floats_write" ON public.petty_cash_floats;
CREATE POLICY "petty_cash_floats_write" ON public.petty_cash_floats FOR ALL
  USING (
    public.is_super_admin(auth.uid()) OR (
      public.user_has_tenant(auth.uid(), tenant_id) AND
      (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid()) OR (
      public.user_has_tenant(auth.uid(), tenant_id) AND
      (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
    )
  );

-- ============ petty_cash_classifications ============
CREATE TABLE IF NOT EXISTS public.petty_cash_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  financial_type text NOT NULL CHECK (financial_type IN ('cogs','opex','asset','other')),
  gl_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  color text NOT NULL DEFAULT '#888780',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='petty_cash_classifications_tenant_name_key') THEN
    ALTER TABLE public.petty_cash_classifications ADD CONSTRAINT petty_cash_classifications_tenant_name_key UNIQUE (tenant_id, name);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.petty_cash_classifications TO authenticated;
GRANT ALL ON public.petty_cash_classifications TO service_role;
ALTER TABLE public.petty_cash_classifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "petty_cash_classifications_select" ON public.petty_cash_classifications;
CREATE POLICY "petty_cash_classifications_select" ON public.petty_cash_classifications FOR SELECT
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "petty_cash_classifications_write" ON public.petty_cash_classifications;
CREATE POLICY "petty_cash_classifications_write" ON public.petty_cash_classifications FOR ALL
  USING (
    public.is_super_admin(auth.uid()) OR (
      public.user_has_tenant(auth.uid(), tenant_id) AND
      (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid()) OR (
      public.user_has_tenant(auth.uid(), tenant_id) AND
      (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
    )
  );

-- ============ petty_cash_receipts ============
CREATE TABLE IF NOT EXISTS public.petty_cash_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  float_id uuid NOT NULL REFERENCES public.petty_cash_floats(id) ON DELETE RESTRICT,
  receipt_date date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  description text NOT NULL,
  classification_id uuid REFERENCES public.petty_cash_classifications(id) ON DELETE RESTRICT,
  receipt_url text,
  receipt_path text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','posted')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.petty_cash_receipts TO authenticated;
GRANT ALL ON public.petty_cash_receipts TO service_role;
ALTER TABLE public.petty_cash_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "petty_cash_receipts_select" ON public.petty_cash_receipts;
CREATE POLICY "petty_cash_receipts_select" ON public.petty_cash_receipts FOR SELECT
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "petty_cash_receipts_write" ON public.petty_cash_receipts;
CREATE POLICY "petty_cash_receipts_write" ON public.petty_cash_receipts FOR ALL
  USING (
    public.is_super_admin(auth.uid()) OR (
      public.user_has_tenant(auth.uid(), tenant_id) AND
      (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid()) OR (
      public.user_has_tenant(auth.uid(), tenant_id) AND
      (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
    )
  );

DROP TRIGGER IF EXISTS petty_cash_receipts_touch ON public.petty_cash_receipts;
CREATE TRIGGER petty_cash_receipts_touch BEFORE UPDATE ON public.petty_cash_receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ petty_cash_replenishments ============
CREATE TABLE IF NOT EXISTS public.petty_cash_replenishments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  float_id uuid NOT NULL REFERENCES public.petty_cash_floats(id) ON DELETE RESTRICT,
  replenishment_date date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  from_bank_account_id uuid REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  reference text,
  notes text,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.petty_cash_replenishments TO authenticated;
GRANT ALL ON public.petty_cash_replenishments TO service_role;
ALTER TABLE public.petty_cash_replenishments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "petty_cash_replenishments_select" ON public.petty_cash_replenishments;
CREATE POLICY "petty_cash_replenishments_select" ON public.petty_cash_replenishments FOR SELECT
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

DROP POLICY IF EXISTS "petty_cash_replenishments_write" ON public.petty_cash_replenishments;
CREATE POLICY "petty_cash_replenishments_write" ON public.petty_cash_replenishments FOR ALL
  USING (
    public.is_super_admin(auth.uid()) OR (
      public.user_has_tenant(auth.uid(), tenant_id) AND
      (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid()) OR (
      public.user_has_tenant(auth.uid(), tenant_id) AND
      (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))
    )
  );

-- ============ Storage RLS for petty-cash-receipts bucket ============
-- Bucket itself is created via storage_create_bucket tool.
DROP POLICY IF EXISTS "petty_cash_receipts_read" ON storage.objects;
CREATE POLICY "petty_cash_receipts_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'petty-cash-receipts');

DROP POLICY IF EXISTS "petty_cash_receipts_insert" ON storage.objects;
CREATE POLICY "petty_cash_receipts_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'petty-cash-receipts' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "petty_cash_receipts_update" ON storage.objects;
CREATE POLICY "petty_cash_receipts_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'petty-cash-receipts' AND (auth.uid())::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "petty_cash_receipts_delete" ON storage.objects;
CREATE POLICY "petty_cash_receipts_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'petty-cash-receipts' AND (auth.uid())::text = (storage.foldername(name))[1]);
