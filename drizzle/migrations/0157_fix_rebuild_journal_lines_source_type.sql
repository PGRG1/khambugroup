DO $mig$
DECLARE d text; bad text; good text;
BEGIN
  d := pg_get_functiondef('public._rebuild_journal_from_operations_impl(uuid,uuid,text)'::regprocedure);
  bad := E'DELETE FROM public.journal_lines\n    WHERE tenant_id = p_tenant_id AND (coalesce(current_setting(''bani.accounting.source_type'',true),'''')='''' OR (source_type=current_setting(''bani.accounting.source_type'',true) AND source_id=current_setting(''bani.accounting.source_id'',true)))\n      AND entry_id IN (';
  good := E'DELETE FROM public.journal_lines\n    WHERE tenant_id = p_tenant_id\n      AND entry_id IN (';
  IF position(bad in d) = 0 THEN RAISE EXCEPTION 'rebuild patch target not found'; END IF;
  EXECUTE replace(d, bad, good);
END $mig$;