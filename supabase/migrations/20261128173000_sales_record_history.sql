-- History for sales days: every add, edit and delete by a person is written to audit_log by the database,
-- whatever screen or server path saved it (Sales Data, chat receipt intake, imports). System rewrites
-- (no signed-in person, e.g. the journal rebuild) are not logged.
CREATE OR REPLACE FUNCTION public.sales_record_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.sales_records%ROWTYPE;
  v_changed text[];
  v_name text;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN v_row := OLD; ELSE v_row := NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(n.key ORDER BY n.key) INTO v_changed
      FROM jsonb_each(to_jsonb(NEW)) n
      JOIN jsonb_each(to_jsonb(OLD)) o ON o.key = n.key
     WHERE n.value IS DISTINCT FROM o.value
       AND n.key NOT IN ('updated_at', 'created_at');
    IF v_changed IS NULL THEN RETURN NULL; END IF;
  END IF;
  SELECT display_name INTO v_name FROM public.profiles WHERE user_id = v_uid;
  INSERT INTO public.audit_log (tenant_id, user_id, user_display_name, action, entity_type, entity_id, details)
  VALUES (v_row.tenant_id, v_uid, coalesce(v_name, (SELECT email FROM auth.users WHERE id = v_uid), 'Unknown'),
          lower(TG_OP), 'sales_record', v_row.id::text,
          jsonb_build_object('new', jsonb_build_object('venue', v_row.venue, 'date', v_row.date))
            || CASE WHEN v_changed IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('changed', to_jsonb(v_changed)) END);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.sales_record_history() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sales_record_history ON public.sales_records;
CREATE TRIGGER sales_record_history AFTER INSERT OR UPDATE OR DELETE ON public.sales_records
  FOR EACH ROW EXECUTE FUNCTION public.sales_record_history();
