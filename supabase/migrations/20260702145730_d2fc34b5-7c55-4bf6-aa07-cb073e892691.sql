
-- 1. user_venue_access
CREATE TABLE IF NOT EXISTS public.user_venue_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, venue_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_venue_access TO authenticated;
GRANT ALL ON public.user_venue_access TO service_role;

ALTER TABLE public.user_venue_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_venue_access_tenant_select ON public.user_venue_access;
DROP POLICY IF EXISTS user_venue_access_tenant_all ON public.user_venue_access;

CREATE POLICY user_venue_access_tenant_select ON public.user_venue_access
  FOR SELECT USING (
    is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id)
  );

CREATE POLICY user_venue_access_tenant_all ON public.user_venue_access
  FOR ALL USING (
    is_super_admin(auth.uid())
    OR (user_has_tenant(auth.uid(), tenant_id) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role)))
  ) WITH CHECK (
    is_super_admin(auth.uid())
    OR (user_has_tenant(auth.uid(), tenant_id) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'manager'::app_role)))
  );

CREATE INDEX IF NOT EXISTS user_venue_access_tenant_user_idx ON public.user_venue_access(tenant_id, user_id);

-- 2. cost_reporting_mode
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS cost_reporting_mode text NOT NULL DEFAULT 'combined';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_cost_reporting_mode_check') THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_cost_reporting_mode_check
      CHECK (cost_reporting_mode IN ('combined', 'by_venue'));
  END IF;
END $$;

-- 3. Rename page_key kpi-management -> kpis (drop stale duplicates first)
DELETE FROM public.user_page_permissions p
WHERE p.page_key = 'kpi-management'
  AND EXISTS (
    SELECT 1 FROM public.user_page_permissions q
    WHERE q.page_key = 'kpis'
      AND q.user_id = p.user_id
      AND q.tenant_id IS NOT DISTINCT FROM p.tenant_id
  );

UPDATE public.user_page_permissions SET page_key = 'kpis' WHERE page_key = 'kpi-management';
