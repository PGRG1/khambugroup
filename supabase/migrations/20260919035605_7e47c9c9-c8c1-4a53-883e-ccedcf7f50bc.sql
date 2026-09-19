DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
      FROM pg_policies
     WHERE schemaname = 'public'
       AND roles = '{public}'
       AND (
         coalesce(qual,'') ~ '(is_super_admin|is_platform_admin|has_role|user_has_tenant|is_tenant_member|is_tenant_admin|user_has_venue|user_tenant_ids|user_venue_ids|current_user_tenant_id|user_owns_kpi)'
         OR coalesce(with_check,'') ~ '(is_super_admin|is_platform_admin|has_role|user_has_tenant|is_tenant_member|is_tenant_admin|user_has_venue|user_tenant_ids|user_venue_ids|current_user_tenant_id|user_owns_kpi)'
       )
  LOOP
    EXECUTE format('ALTER POLICY %I ON %I.%I TO authenticated', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END;
$$;