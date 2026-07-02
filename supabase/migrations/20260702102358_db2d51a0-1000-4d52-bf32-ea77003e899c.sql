
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['kpi_cards','kpi_actuals','kpi_targets','transfers','transfer_items','bank_reconciliation_periods','revenue_targets','forecasts'];
  pol record;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE', t);
    EXECUTE format('UPDATE public.%I SET tenant_id = ''00000000-0000-0000-0000-00000000beef''::uuid WHERE tenant_id IS NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(tenant_id)', t||'_tenant_id_idx', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;

    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))$f$, t||'_tenant_select', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL USING ((public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id)) AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role))) WITH CHECK ((public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id)) AND (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'manager'::public.app_role)))$f$, t||'_tenant_all', t);

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
