
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'bank_accounts','bank_transactions','bank_statement_imports','bank_statement_account_mappings',
    'bank_recon_rules','bank_reconciliation_periods','bank_audit_trail',
    'payment_processors','payment_processor_merchants','payment_processor_fee_rates',
    'payment_settlement_batches','payment_settlement_lines','payment_settlement_imports',
    'payment_settlement_transactions','payments','payment_allocations','credit_notes','invoice_payments'
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
  r record; t text;
  tbls text[] := ARRAY[
    'bank_accounts','bank_transactions','bank_statement_imports','bank_statement_account_mappings',
    'bank_recon_rules','bank_reconciliation_periods','bank_audit_trail',
    'payment_processors','payment_processor_merchants','payment_processor_fee_rates',
    'payment_settlement_batches','payment_settlement_lines','payment_settlement_imports',
    'payment_settlement_transactions','payments','payment_allocations','credit_notes','invoice_payments'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- Tenant-only tables
DO $$
DECLARE
  t text;
  tenant_only text[] := ARRAY[
    'bank_transactions','bank_statement_imports','bank_statement_account_mappings',
    'bank_recon_rules','bank_reconciliation_periods','bank_audit_trail',
    'payment_processors','payment_processor_fee_rates',
    'payment_settlement_batches','payment_settlement_lines','payment_settlement_imports',
    'payment_settlement_transactions','payments','payment_allocations','invoice_payments'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_only LOOP
    EXECUTE format($q$CREATE POLICY "tenant_select" ON public.%I FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))$q$, t);
    EXECUTE format($q$CREATE POLICY "tenant_write" ON public.%I FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id)) WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))$q$, t);
  END LOOP;
END $$;

-- Venue-scoped tables (have venue_id)
CREATE POLICY "tenant_venue_select" ON public.bank_accounts FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (public.user_has_tenant(auth.uid(), tenant_id) AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id))));
CREATE POLICY "tenant_venue_write" ON public.bank_accounts FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (public.user_has_tenant(auth.uid(), tenant_id) AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id))))
  WITH CHECK (public.is_super_admin(auth.uid()) OR (public.user_has_tenant(auth.uid(), tenant_id) AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id))));

-- payment_processor_merchants & credit_notes have venue (text) but no venue_id; tenant-only scope
CREATE POLICY "tenant_select" ON public.payment_processor_merchants FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "tenant_write" ON public.payment_processor_merchants FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));

CREATE POLICY "tenant_select" ON public.credit_notes FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
CREATE POLICY "tenant_write" ON public.credit_notes FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id));
