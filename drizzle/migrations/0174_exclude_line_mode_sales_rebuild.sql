-- Clients set up line by line have no sales journal until their payments are set up: the journal
-- rebuild only knows KHAMBU's fixed payment columns, which are empty for them. Adds one condition to
-- the rebuild's single sales_records query; KHAMBU-style clients are unaffected.
CREATE OR REPLACE FUNCTION public.is_sales_line_mode(p_tenant uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.sales_report_lines WHERE tenant_id = p_tenant AND is_active)
     AND NOT EXISTS (SELECT 1 FROM public.sales_report_lines WHERE tenant_id = p_tenant AND is_active AND legacy_field IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.is_sales_line_mode(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_sales_line_mode(uuid) TO authenticated, service_role;

DO $patch$
DECLARE
  src text := pg_get_functiondef('public._rebuild_journal_from_operations_impl(uuid,uuid,text)'::regprocedure);
  marker text := 'WHERE NOT s.deferred_feed AND s.tenant_id = p_tenant_id AND';
  patched text := 'WHERE NOT s.deferred_feed AND s.tenant_id = p_tenant_id AND NOT public.is_sales_line_mode(p_tenant_id) AND';
BEGIN
  IF position('is_sales_line_mode' in src) > 0 THEN RETURN; END IF;
  IF (length(src) - length(replace(src, marker, ''))) / length(marker) <> 1 THEN
    RAISE EXCEPTION 'Journal rebuild changed shape; expected exactly one sales query';
  END IF;
  EXECUTE replace(src, marker, patched);
END $patch$;