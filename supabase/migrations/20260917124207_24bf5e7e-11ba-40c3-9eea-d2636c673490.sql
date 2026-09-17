CREATE TABLE IF NOT EXISTS public.revenue_daily_projections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  target_date date NOT NULL,
  projected_sales numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rdp_projected_nonneg CHECK (projected_sales >= 0),
  CONSTRAINT rdp_unique UNIQUE (tenant_id, venue_id, target_date)
);

CREATE INDEX IF NOT EXISTS rdp_tenant_venue_date_idx
  ON public.revenue_daily_projections (tenant_id, venue_id, target_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.revenue_daily_projections TO authenticated;
GRANT ALL ON public.revenue_daily_projections TO service_role;

ALTER TABLE public.revenue_daily_projections ENABLE ROW LEVEL SECURITY;

CREATE POLICY rdp_select ON public.revenue_daily_projections FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.is_tenant_member(tenant_id, auth.uid()));

CREATE POLICY rdp_write ON public.revenue_daily_projections FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(tenant_id, auth.uid())
    OR (public.is_tenant_member(tenant_id, auth.uid())
        AND (public.has_role(auth.uid(),'admin'::public.app_role)
             OR public.has_role(auth.uid(),'manager'::public.app_role)))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR public.is_tenant_admin(tenant_id, auth.uid())
    OR (public.is_tenant_member(tenant_id, auth.uid())
        AND (public.has_role(auth.uid(),'admin'::public.app_role)
             OR public.has_role(auth.uid(),'manager'::public.app_role)))
  );

DROP TRIGGER IF EXISTS trg_rdp_touch ON public.revenue_daily_projections;
CREATE TRIGGER trg_rdp_touch BEFORE UPDATE ON public.revenue_daily_projections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();