
-- 1) visibility_scope on assignments
ALTER TABLE public.kpi_assignments
  ADD COLUMN IF NOT EXISTS visibility_scope text NOT NULL DEFAULT 'team';

DO $$ BEGIN
  ALTER TABLE public.kpi_assignments
    ADD CONSTRAINT kpi_assignments_visibility_scope_check
    CHECK (visibility_scope IN ('team','management','assignee_only'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) kpi_actions linkage + audit columns
ALTER TABLE public.kpi_actions
  ADD COLUMN IF NOT EXISTS kpi_assignment_id uuid,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

DO $$ BEGIN
  ALTER TABLE public.kpi_actions
    ADD CONSTRAINT kpi_actions_assignment_fk
    FOREIGN KEY (kpi_assignment_id) REFERENCES public.kpi_assignments(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS kpi_actions_touch_updated_at ON public.kpi_actions;
CREATE TRIGGER kpi_actions_touch_updated_at
  BEFORE UPDATE ON public.kpi_actions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Venue scoping: honour user_venue_access (written by the User Access editor)
--    as well as legacy venue_memberships. No explicit rows => all tenant venues.
CREATE OR REPLACE FUNCTION public.user_has_venue(_user_id uuid, _venue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.venues v
    WHERE v.id = _venue_id
      AND public.user_has_tenant(_user_id, v.tenant_id)
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.venue_memberships vm
          JOIN public.venues v2 ON v2.id = vm.venue_id
          WHERE vm.user_id = _user_id AND v2.tenant_id = v.tenant_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.user_venue_access uva
          JOIN public.venues v3 ON v3.id = uva.venue_id
          WHERE uva.user_id = _user_id AND v3.tenant_id = v.tenant_id
        )
        OR EXISTS (
          SELECT 1 FROM public.venue_memberships vm
          WHERE vm.user_id = _user_id AND vm.venue_id = _venue_id
        )
        OR EXISTS (
          SELECT 1 FROM public.user_venue_access uva
          WHERE uva.user_id = _user_id AND uva.venue_id = _venue_id
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_venue_ids(_user_id uuid, _tenant_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT v.id FROM public.venues v
  WHERE v.tenant_id = _tenant_id
    AND (
      (
        NOT EXISTS (
          SELECT 1 FROM public.venue_memberships vm
          JOIN public.venues v2 ON v2.id = vm.venue_id
          WHERE vm.user_id = _user_id AND v2.tenant_id = _tenant_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.user_venue_access uva
          JOIN public.venues v3 ON v3.id = uva.venue_id
          WHERE uva.user_id = _user_id AND v3.tenant_id = _tenant_id
        )
      )
      OR EXISTS (
        SELECT 1 FROM public.venue_memberships vm
        WHERE vm.user_id = _user_id AND vm.venue_id = v.id
      )
      OR EXISTS (
        SELECT 1 FROM public.user_venue_access uva
        WHERE uva.user_id = _user_id AND uva.venue_id = v.id
      )
    );
$function$;

-- 4) kpi_actuals: let the named KPI owner write their own actuals
DROP POLICY IF EXISTS kpi_actuals_owner_write ON public.kpi_actuals;
CREATE POLICY kpi_actuals_owner_write ON public.kpi_actuals
  FOR ALL TO authenticated
  USING (
    public.user_has_tenant(auth.uid(), tenant_id)
    AND EXISTS (
      SELECT 1 FROM public.kpi_assignments a
      WHERE a.kpi_card_id = kpi_actuals.kpi_card_id
        AND a.tenant_id = kpi_actuals.tenant_id
        AND a.active
        AND a.assigned_user_id = auth.uid()
        AND (a.venue_id IS NOT DISTINCT FROM kpi_actuals.venue_id OR a.venue_id IS NULL)
    )
  )
  WITH CHECK (
    public.user_has_tenant(auth.uid(), tenant_id)
    AND EXISTS (
      SELECT 1 FROM public.kpi_assignments a
      WHERE a.kpi_card_id = kpi_actuals.kpi_card_id
        AND a.tenant_id = kpi_actuals.tenant_id
        AND a.active
        AND a.assigned_user_id = auth.uid()
        AND (a.venue_id IS NOT DISTINCT FROM kpi_actuals.venue_id OR a.venue_id IS NULL)
    )
  );

-- 5) kpi_actions: assignee always sees/updates their own action
DROP POLICY IF EXISTS kpi_actions_assignee_rw ON public.kpi_actions;
CREATE POLICY kpi_actions_assignee_rw ON public.kpi_actions
  FOR ALL TO authenticated
  USING (
    public.user_has_tenant(auth.uid(), tenant_id) AND assigned_user_id = auth.uid()
  )
  WITH CHECK (
    public.user_has_tenant(auth.uid(), tenant_id) AND assigned_user_id = auth.uid()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_actions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_actuals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_assignments TO authenticated;
GRANT ALL ON public.kpi_actions TO service_role;
GRANT ALL ON public.kpi_actuals TO service_role;
GRANT ALL ON public.kpi_assignments TO service_role;
