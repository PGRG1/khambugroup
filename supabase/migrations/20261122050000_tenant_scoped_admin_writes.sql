-- Tenant isolation fix + Bani-only business setup.
--
-- 1) has_role() is global (user_roles has no tenant), so these "admin/manager can manage" policies
--    let an admin or manager of one business read and change another business's rows. Every write
--    policy below now also requires membership of the row's tenant.
-- 2) Company details (organizations) and creating, deleting, renaming, closing or reopening venues are
--    set up by the Bani team only (platform admins). A business keeps its venues' operational fields
--    (seats, sort order, notes, location). Server code using the service role is unaffected.

-- GRNs, GRN lines, stock areas: admin/manager of the row's own tenant (or Bani platform admin).
DROP POLICY IF EXISTS "GRNs writable by admin/manager" ON public.goods_received_notes;
CREATE POLICY "GRNs writable by admin/manager" ON public.goods_received_notes FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR (public.user_has_tenant(auth.uid(), tenant_id) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR (public.user_has_tenant(auth.uid(), tenant_id) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))));

DROP POLICY IF EXISTS "GRN items writable by admin/manager" ON public.grn_items;
CREATE POLICY "GRN items writable by admin/manager" ON public.grn_items FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR (public.user_has_tenant(auth.uid(), tenant_id) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR (public.user_has_tenant(auth.uid(), tenant_id) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))));

DROP POLICY IF EXISTS "stock_locations write" ON public.stock_locations;
CREATE POLICY "stock_locations write" ON public.stock_locations FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR (public.user_has_tenant(auth.uid(), tenant_id) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR (public.user_has_tenant(auth.uid(), tenant_id) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))));

-- Company details: Bani platform admins only. Everyone in the business can still read them.
DROP POLICY IF EXISTS "Authorized can manage organizations" ON public.organizations;
CREATE POLICY "Bani manages organizations" ON public.organizations FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Venues: only Bani adds or deletes them; a business's admin/manager may update its own venues,
-- and a trigger keeps name / open-closed / tenant / company to Bani.
DROP POLICY IF EXISTS "Authorized can manage venues" ON public.venues;
CREATE POLICY "Bani adds venues" ON public.venues FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "Bani deletes venues" ON public.venues FOR DELETE TO authenticated
  USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Business updates own venues" ON public.venues FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR (public.user_has_tenant(auth.uid(), tenant_id) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR (public.user_has_tenant(auth.uid(), tenant_id) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))));

CREATE OR REPLACE FUNCTION public.venues_setup_fields_bani_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role / server code (no signed-in user) and Bani platform admins may change anything.
  IF auth.uid() IS NULL OR public.is_platform_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF NEW.name IS DISTINCT FROM OLD.name OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.is_system IS DISTINCT FROM OLD.is_system OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Venues are set up by Bani. Contact Bani to rename, close or reopen a venue.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.venues_setup_fields_bani_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_venues_setup_fields_bani_only ON public.venues;
CREATE TRIGGER trg_venues_setup_fields_bani_only BEFORE UPDATE ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.venues_setup_fields_bani_only();
