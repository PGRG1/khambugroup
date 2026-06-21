
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'suppliers','supplier_item_mappings','product_master','product_suppliers',
    'product_categories','product_pack_conversions','standard_products','uom_options',
    'invoices','invoice_line_items','inventory_items','inventory_periods','inventory_counts',
    'menu_items','menu_item_ingredients','menu_item_pricing'
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
    'suppliers','supplier_item_mappings','product_master','product_suppliers',
    'product_categories','product_pack_conversions','standard_products','uom_options',
    'invoices','invoice_line_items','inventory_items','inventory_periods','inventory_counts',
    'menu_items','menu_item_ingredients','menu_item_pricing'
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
    'suppliers','supplier_item_mappings','product_master','product_suppliers',
    'product_categories','product_pack_conversions','standard_products','uom_options',
    'invoice_line_items','inventory_items',
    'menu_items','menu_item_ingredients','menu_item_pricing'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_only LOOP
    EXECUTE format($q$CREATE POLICY "tenant_select" ON public.%I FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))$q$, t);
    EXECUTE format($q$CREATE POLICY "tenant_write" ON public.%I FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id)) WITH CHECK (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), tenant_id))$q$, t);
  END LOOP;
END $$;

-- Venue-scoped tables
DO $$
DECLARE
  t text;
  venue_scoped text[] := ARRAY['invoices','inventory_periods','inventory_counts'];
BEGIN
  FOREACH t IN ARRAY venue_scoped LOOP
    EXECUTE format($q$CREATE POLICY "tenant_venue_select" ON public.%I FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()) OR (public.user_has_tenant(auth.uid(), tenant_id) AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id))))$q$, t);
    EXECUTE format($q$CREATE POLICY "tenant_venue_write" ON public.%I FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()) OR (public.user_has_tenant(auth.uid(), tenant_id) AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id)))) WITH CHECK (public.is_super_admin(auth.uid()) OR (public.user_has_tenant(auth.uid(), tenant_id) AND (venue_id IS NULL OR public.user_has_venue(auth.uid(), venue_id))))$q$, t);
  END LOOP;
END $$;
