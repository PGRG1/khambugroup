
-- =========================================================
-- Stage 0: Multi-tenant foundation
-- =========================================================

-- 1) Extend tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'standard';

UPDATE public.tenants
  SET name = 'KHAMBU Group',
      slug = COALESCE(slug, 'khambu')
  WHERE id = '00000000-0000-0000-0000-00000000beef';

CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_key ON public.tenants(slug) WHERE slug IS NOT NULL;

-- 2) Add tenant_id to venues, backfill, enforce
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS tenant_id uuid;

UPDATE public.venues
  SET tenant_id = '00000000-0000-0000-0000-00000000beef'
  WHERE tenant_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venues WHERE tenant_id IS NULL) THEN
    RAISE EXCEPTION 'venues.tenant_id backfill incomplete';
  END IF;
END $$;

ALTER TABLE public.venues
  ALTER COLUMN tenant_id SET NOT NULL,
  ALTER COLUMN tenant_id SET DEFAULT '00000000-0000-0000-0000-00000000beef';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'venues_tenant_id_fkey'
  ) THEN
    ALTER TABLE public.venues
      ADD CONSTRAINT venues_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS venues_tenant_id_idx ON public.venues(tenant_id);

-- 3) venue_memberships
CREATE TABLE IF NOT EXISTS public.venue_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, venue_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.venue_memberships TO authenticated;
GRANT ALL ON public.venue_memberships TO service_role;

ALTER TABLE public.venue_memberships ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS venue_memberships_user_idx ON public.venue_memberships(user_id);
CREATE INDEX IF NOT EXISTS venue_memberships_venue_idx ON public.venue_memberships(venue_id);

DROP TRIGGER IF EXISTS update_venue_memberships_updated_at ON public.venue_memberships;
CREATE TRIGGER update_venue_memberships_updated_at
  BEFORE UPDATE ON public.venue_memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Helper functions

CREATE OR REPLACE FUNCTION public.user_tenant_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.tenant_members WHERE user_id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.user_has_tenant(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE user_id = _user_id AND tenant_id = _tenant_id
  );
$$;

CREATE OR REPLACE FUNCTION public.user_venue_ids(_user_id uuid, _tenant_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  -- If user has no explicit venue rows for this tenant, they implicitly see all
  -- venues in tenants they belong to (tenant-level access).
  SELECT v.id FROM public.venues v
  WHERE v.tenant_id = _tenant_id
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.venue_memberships vm
        JOIN public.venues v2 ON v2.id = vm.venue_id
        WHERE vm.user_id = _user_id AND v2.tenant_id = _tenant_id
      )
      OR EXISTS (
        SELECT 1 FROM public.venue_memberships vm
        WHERE vm.user_id = _user_id AND vm.venue_id = v.id
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.user_has_venue(_user_id uuid, _venue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
        OR EXISTS (
          SELECT 1 FROM public.venue_memberships vm
          WHERE vm.user_id = _user_id AND vm.venue_id = _venue_id
        )
      )
  );
$$;

-- 5) RLS policies for venue_memberships
DROP POLICY IF EXISTS "venue_memberships_select" ON public.venue_memberships;
CREATE POLICY "venue_memberships_select"
  ON public.venue_memberships FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.venues v
      WHERE v.id = venue_memberships.venue_id
        AND public.user_has_tenant(auth.uid(), v.tenant_id)
    )
  );

DROP POLICY IF EXISTS "venue_memberships_admin_write" ON public.venue_memberships;
CREATE POLICY "venue_memberships_admin_write"
  ON public.venue_memberships FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.venues v
      WHERE v.id = venue_memberships.venue_id
        AND public.is_tenant_admin(v.tenant_id, auth.uid())
    )
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.venues v
      WHERE v.id = venue_memberships.venue_id
        AND public.is_tenant_admin(v.tenant_id, auth.uid())
    )
  );
