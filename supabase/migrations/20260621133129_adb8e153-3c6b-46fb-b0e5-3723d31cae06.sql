
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'journal_entries','journal_lines','chart_of_accounts','account_mapping_rules',
    'reconciliation_mapping_rules','ledger_audit_log','pl_structure_rows',
    'pl_manual_lines','cashflow_settings','accounting_categories'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid DEFAULT %L', t, '00000000-0000-0000-0000-00000000beef');
    EXECUTE format('UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL', t, '00000000-0000-0000-0000-00000000beef');
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT', t, t || '_tenant_id_fkey');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', t || '_tenant_idx', t);
    EXECUTE format('DROP TRIGGER IF EXISTS set_tenant_id_default ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_tenant_id_default BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id_default()', t);
  END LOOP;
END $$;

DO $$
DECLARE
  r record;
  tbls text[] := ARRAY[
    'journal_entries','journal_lines','chart_of_accounts','account_mapping_rules',
    'reconciliation_mapping_rules','ledger_audit_log','pl_structure_rows',
    'pl_manual_lines','cashflow_settings','accounting_categories'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- Tenant-only tables
CREATE POLICY "tenant_select" ON public.chart_of_accounts FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "tenant_write" ON public.chart_of_accounts FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY "tenant_select" ON public.account_mapping_rules FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "tenant_write" ON public.account_mapping_rules FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY "tenant_select" ON public.reconciliation_mapping_rules FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "tenant_write" ON public.reconciliation_mapping_rules FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY "tenant_select" ON public.ledger_audit_log FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "tenant_write" ON public.ledger_audit_log FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY "tenant_select" ON public.pl_structure_rows FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "tenant_write" ON public.pl_structure_rows FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY "tenant_select" ON public.pl_manual_lines FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "tenant_write" ON public.pl_manual_lines FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY "tenant_select" ON public.cashflow_settings FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "tenant_write" ON public.cashflow_settings FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY "tenant_select" ON public.accounting_categories FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "tenant_write" ON public.accounting_categories FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

-- Venue-scoped tables
CREATE POLICY "tenant_venue_select" ON public.journal_entries FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (public.user_has_tenant(auth.uid(), tenant_id)
        AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id)))
  );
CREATE POLICY "tenant_venue_write" ON public.journal_entries FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (public.user_has_tenant(auth.uid(), tenant_id)
        AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id)))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.user_has_tenant(auth.uid(), tenant_id)
        AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id)))
  );

CREATE POLICY "tenant_venue_select" ON public.journal_lines FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (public.user_has_tenant(auth.uid(), tenant_id)
        AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id)))
  );
CREATE POLICY "tenant_venue_write" ON public.journal_lines FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (public.user_has_tenant(auth.uid(), tenant_id)
        AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id)))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.user_has_tenant(auth.uid(), tenant_id)
        AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id)))
  );
