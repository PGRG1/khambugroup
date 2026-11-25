-- Bani rules: who may switch them on or off, and an approval step for rules taught by others.
-- Approvers are Bani (platform admins), the business's admins, or someone whose role has Approve (3) on Finance.
-- This replaces the old global has_role('admin') check, which did not respect each business's roles.

CREATE OR REPLACE FUNCTION public.can_approve_bani_rules(t uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_platform_admin(auth.uid())
    OR public.is_tenant_admin(t, auth.uid())
    OR (public.user_has_tenant(auth.uid(), t) AND COALESCE(public.access_level(t, 'finance'), 0) >= 3)
  );
$$;
REVOKE ALL ON FUNCTION public.can_approve_bani_rules(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_approve_bani_rules(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.settings_forget_learning(t uuid, k text, ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n int;
BEGIN
  IF NOT public.can_approve_bani_rules(t) THEN RAISE EXCEPTION 'Only an admin or someone with Approve on Finance can change what Bani uses'; END IF;
  IF k='rule' THEN UPDATE public.ai_learned_rules SET status='disabled',updated_at=now() WHERE tenant_id=t AND id=ANY(ids);
  ELSIF k='example' THEN UPDATE public.bani_accounting_examples SET disabled_at=now() WHERE tenant_id=t AND id=ANY(ids) AND disabled_at IS NULL;
  ELSIF k='feedback' THEN UPDATE public.match_feedback SET disabled_at=now() WHERE tenant_id=t AND id=ANY(ids) AND disabled_at IS NULL;
  ELSIF k='note' THEN UPDATE public.bani_memory_notes SET disabled_at=now() WHERE tenant_id=t AND id=ANY(ids) AND disabled_at IS NULL;
  ELSE RAISE EXCEPTION 'Unknown learning type'; END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n=0 THEN RAISE EXCEPTION 'Nothing to forget'; END IF;
  INSERT INTO public.audit_log(tenant_id,user_id,action,entity_type,entity_id,details) VALUES(t,auth.uid(),'learning_forgotten',k,array_to_string(ids,','),jsonb_build_object('count',n));
END $$;
REVOKE ALL ON FUNCTION public.settings_forget_learning(uuid,text,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settings_forget_learning(uuid,text,uuid[]) TO authenticated;

-- Approve or turn down a rule that is waiting (status needs_review). Only waiting rules can be changed here,
-- and the approver cannot approve a rule they asked for themselves (two people for every live rule).
CREATE OR REPLACE FUNCTION public.settings_review_rule(t uuid, rule uuid, approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.ai_learned_rules;
BEGIN
  IF NOT public.can_approve_bani_rules(t) THEN RAISE EXCEPTION 'Only an admin or someone with Approve on Finance can approve rules'; END IF;
  SELECT * INTO r FROM public.ai_learned_rules WHERE id = rule AND tenant_id = t FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rule not found'; END IF;
  IF r.status <> 'needs_review' THEN RAISE EXCEPTION 'This rule is not waiting for approval'; END IF;
  IF approve AND r.created_by = auth.uid() AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Someone else needs to approve a rule you asked for';
  END IF;
  UPDATE public.ai_learned_rules SET status = CASE WHEN approve THEN 'active' ELSE 'disabled' END, updated_at = now() WHERE id = rule;
  INSERT INTO public.audit_log(tenant_id,user_id,action,entity_type,entity_id,details)
    VALUES (t, auth.uid(), CASE WHEN approve THEN 'bani_rule_approved' ELSE 'bani_rule_declined' END, 'rule', rule::text, jsonb_build_object('asked_by', r.created_by));
END $$;
REVOKE ALL ON FUNCTION public.settings_review_rule(uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settings_review_rule(uuid,uuid,boolean) TO authenticated;