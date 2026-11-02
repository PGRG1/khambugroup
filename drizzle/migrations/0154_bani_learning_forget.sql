ALTER TABLE public.match_feedback ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
ALTER TABLE public.bani_memory_notes ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
CREATE OR REPLACE FUNCTION public.settings_forget_learning(t uuid, k text, ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int;
BEGIN
  IF NOT public.user_has_tenant(auth.uid(),t) OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Administrator required'; END IF;
  IF k='rule' THEN UPDATE public.ai_learned_rules SET status='disabled',updated_at=now() WHERE tenant_id=t AND id=ANY(ids);
  ELSIF k='example' THEN UPDATE public.bani_accounting_examples SET disabled_at=now() WHERE tenant_id=t AND id=ANY(ids) AND disabled_at IS NULL;
  ELSIF k='feedback' THEN UPDATE public.match_feedback SET disabled_at=now() WHERE tenant_id=t AND id=ANY(ids) AND disabled_at IS NULL;
  ELSIF k='note' THEN UPDATE public.bani_memory_notes SET disabled_at=now() WHERE tenant_id=t AND id=ANY(ids) AND disabled_at IS NULL;
  ELSE RAISE EXCEPTION 'Unknown learning type'; END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n=0 THEN RAISE EXCEPTION 'Nothing to forget'; END IF;
  INSERT INTO public.audit_log(tenant_id,user_id,action,entity_type,entity_id,details) VALUES(t,auth.uid(),'learning_forgotten',k,array_to_string(ids,','),jsonb_build_object('count',n));
END $$;
REVOKE ALL ON FUNCTION public.settings_forget_learning(uuid,text,uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.settings_forget_learning(uuid,text,uuid[]) TO authenticated;