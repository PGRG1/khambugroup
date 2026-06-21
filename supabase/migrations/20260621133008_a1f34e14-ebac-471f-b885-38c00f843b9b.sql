
-- =========================================================
-- Stage 1: Expenses & Recurring Expenses — tenant scoping
-- =========================================================

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'expense_bills','expense_bill_allocations','expense_bill_audit',
    'expense_bill_links','expense_bill_payments','expense_recurring_rules',
    'expense_categories','expense_vendor_statements','expense_vendor_statement_lines'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    -- 1. add tenant_id column (nullable + default KHAMBU)
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid DEFAULT %L',
      t, '00000000-0000-0000-0000-00000000beef'
    );
    -- 2. backfill
    EXECUTE format(
      'UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL',
      t, '00000000-0000-0000-0000-00000000beef'
    );
    -- 3. verify
    EXECUTE format('SELECT 1 FROM public.%I WHERE tenant_id IS NULL LIMIT 1', t);
    -- 4. NOT NULL + FK
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);
    BEGIN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT',
        t, t || '_tenant_id_fkey'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    -- 5. index
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', t || '_tenant_idx', t);
  END LOOP;
END $$;

DO $$
DECLARE
  cnt int;
BEGIN
  SELECT
    (SELECT count(*) FROM public.expense_bills WHERE tenant_id IS NULL)
    + (SELECT count(*) FROM public.expense_bill_allocations WHERE tenant_id IS NULL)
    + (SELECT count(*) FROM public.expense_bill_audit WHERE tenant_id IS NULL)
    + (SELECT count(*) FROM public.expense_bill_links WHERE tenant_id IS NULL)
    + (SELECT count(*) FROM public.expense_bill_payments WHERE tenant_id IS NULL)
    + (SELECT count(*) FROM public.expense_recurring_rules WHERE tenant_id IS NULL)
    + (SELECT count(*) FROM public.expense_categories WHERE tenant_id IS NULL)
    + (SELECT count(*) FROM public.expense_vendor_statements WHERE tenant_id IS NULL)
    + (SELECT count(*) FROM public.expense_vendor_statement_lines WHERE tenant_id IS NULL)
    INTO cnt;
  IF cnt > 0 THEN
    RAISE EXCEPTION 'Expense tables: % rows still have NULL tenant_id', cnt;
  END IF;
END $$;

-- Auto-stamp trigger using current_user_tenant_id() when client omits tenant_id
CREATE OR REPLACE FUNCTION public.set_tenant_id_default()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := public.current_user_tenant_id();
    IF NEW.tenant_id IS NULL THEN
      NEW.tenant_id := '00000000-0000-0000-0000-00000000beef';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'expense_bills','expense_bill_allocations','expense_bill_audit',
    'expense_bill_links','expense_bill_payments','expense_recurring_rules',
    'expense_categories','expense_vendor_statements','expense_vendor_statement_lines'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_tenant_id_default ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER set_tenant_id_default BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_default()',
      t
    );
  END LOOP;
END $$;

-- =========================================================
-- Drop existing policies and replace with tenant-scoped ones
-- =========================================================

DO $$
DECLARE
  r record;
  tbls text[] := ARRAY[
    'expense_bills','expense_bill_allocations','expense_bill_audit',
    'expense_bill_links','expense_bill_payments','expense_recurring_rules',
    'expense_categories','expense_vendor_statements','expense_vendor_statement_lines'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    FOR r IN
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- Helper macro pattern: tenant-only tables (no venue scoping)
-- expense_categories, expense_bill_audit, expense_bill_links
CREATE POLICY "tenant_select" ON public.expense_categories FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "tenant_write" ON public.expense_categories FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY "tenant_select" ON public.expense_bill_audit FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "tenant_write" ON public.expense_bill_audit FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY "tenant_select" ON public.expense_bill_links FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "tenant_write" ON public.expense_bill_links FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY "tenant_select" ON public.expense_bill_payments FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "tenant_write" ON public.expense_bill_payments FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY "tenant_select" ON public.expense_vendor_statement_lines FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "tenant_write" ON public.expense_vendor_statement_lines FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

-- Venue-scoped tables: tenant + optional venue_id check
CREATE POLICY "tenant_venue_select" ON public.expense_bills FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.user_has_tenant(auth.uid(), tenant_id)
      AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id))
    )
  );
CREATE POLICY "tenant_venue_write" ON public.expense_bills FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.user_has_tenant(auth.uid(), tenant_id)
      AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id))
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.user_has_tenant(auth.uid(), tenant_id)
      AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id))
    )
  );

CREATE POLICY "tenant_select" ON public.expense_bill_allocations FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "tenant_write" ON public.expense_bill_allocations FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY "tenant_venue_select" ON public.expense_recurring_rules FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.user_has_tenant(auth.uid(), tenant_id)
      AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id))
    )
  );
CREATE POLICY "tenant_venue_write" ON public.expense_recurring_rules FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.user_has_tenant(auth.uid(), tenant_id)
      AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id))
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.user_has_tenant(auth.uid(), tenant_id)
      AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id))
    )
  );

CREATE POLICY "tenant_venue_select" ON public.expense_vendor_statements FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.user_has_tenant(auth.uid(), tenant_id)
      AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id))
    )
  );
CREATE POLICY "tenant_venue_write" ON public.expense_vendor_statements FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      public.user_has_tenant(auth.uid(), tenant_id)
      AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id))
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (
      public.user_has_tenant(auth.uid(), tenant_id)
      AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id))
    )
  );
