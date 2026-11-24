-- Access: Bani sets up what each role can do (control plane); the client only assigns a role and venues.

-- Bani only: change one of a client's standard roles (name, level per area 0-3, money figures).
CREATE OR REPLACE FUNCTION public.save_tenant_role(t uuid, k text, r jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN RAISE EXCEPTION 'Only Bani can change what a role can do'; END IF;
  UPDATE public.tenant_roles SET
    name = COALESCE(NULLIF(btrim(r->>'name'), ''), name),
    revenue = COALESCE((r->>'revenue')::smallint, revenue), purchasing = COALESCE((r->>'purchasing')::smallint, purchasing),
    stock = COALESCE((r->>'stock')::smallint, stock), people = COALESCE((r->>'people')::smallint, people),
    payroll = COALESCE((r->>'payroll')::smallint, payroll), expenses = COALESCE((r->>'expenses')::smallint, expenses),
    finance = COALESCE((r->>'finance')::smallint, finance), settings = COALESCE((r->>'settings')::smallint, settings),
    money = COALESCE(r->>'money', money), updated_by = auth.uid()
  WHERE tenant_id = t AND role_key = k;
  IF NOT FOUND THEN RAISE EXCEPTION 'Role not found'; END IF;
END $$;

-- Give a member of the business a role and venues. Bani always; the client's admins only when the client manages
-- its users. Only Bani gives or takes the Owner role, and nobody but Bani changes their own access.
CREATE OR REPLACE FUNCTION public.assign_user_role(t uuid, u uuid, k text, all_v boolean, v uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE bani boolean := public.is_platform_admin(auth.uid());
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF NOT bani AND NOT (public.client_manages_users(t) AND EXISTS (SELECT 1 FROM public.tenant_members
      WHERE tenant_id = t AND user_id = auth.uid() AND role IN ('tenant_admin','admin','super_admin'))) THEN
    RAISE EXCEPTION 'Bani manages this business''s users'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_members WHERE tenant_id = t AND user_id = u) THEN RAISE EXCEPTION 'This person is not in the business'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenant_roles WHERE tenant_id = t AND role_key = k) THEN RAISE EXCEPTION 'Pick a role'; END IF;
  IF NOT bani AND u = auth.uid() THEN RAISE EXCEPTION 'You cannot change your own access'; END IF;
  IF NOT bani AND (k = 'owner' OR EXISTS (SELECT 1 FROM public.tenant_user_access WHERE tenant_id = t AND user_id = u AND role_key = 'owner')) THEN
    RAISE EXCEPTION 'Only Bani can give or change the Owner role'; END IF;
  IF NOT COALESCE(all_v, false) AND COALESCE(array_length(v, 1), 0) = 0 THEN RAISE EXCEPTION 'Pick at least one venue'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(v, '{}'::uuid[])) x WHERE NOT EXISTS (SELECT 1 FROM public.venues WHERE id = x AND tenant_id = t)) THEN
    RAISE EXCEPTION 'Unknown venue'; END IF;
  INSERT INTO public.tenant_user_access (tenant_id, user_id, role_key, all_venues, status, updated_by, updated_at)
  VALUES (t, u, k, COALESCE(all_v, false), 'active', auth.uid(), now())
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role_key = EXCLUDED.role_key, all_venues = EXCLUDED.all_venues,
    status = CASE WHEN public.tenant_user_access.status IN ('suspended','removed') THEN public.tenant_user_access.status ELSE 'active' END,
    updated_by = auth.uid(), updated_at = now();
  DELETE FROM public.tenant_user_venues WHERE tenant_id = t AND user_id = u;
  IF NOT COALESCE(all_v, false) THEN
    INSERT INTO public.tenant_user_venues (tenant_id, user_id, venue_id) SELECT DISTINCT t, u, x FROM unnest(v) x;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.save_tenant_role(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_user_role(uuid, uuid, text, boolean, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_tenant_role(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_user_role(uuid, uuid, text, boolean, uuid[]) TO authenticated;
