-- Where a staff member's pay is charged in venue profit: own (their venue), across (split by rota hours) or central.
-- Set on the person in People; replaces the per-role "Team working" setting, which stays only as the fallback.
ALTER TABLE public.hr_employees ADD COLUMN IF NOT EXISTS pay_split text CHECK (pay_split IS NULL OR pay_split IN ('own','across','central'));

CREATE OR REPLACE FUNCTION public.save_pay_split(t uuid, e uuid, p_mode text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_old text; v_name text;
BEGIN
  IF NOT (public.is_platform_admin() OR (public.people_access(t, auth.uid()) AND public.has_role(auth.uid(), 'admin'))) THEN
    RAISE EXCEPTION 'Only an admin can change where pay is charged'; END IF;
  IF p_mode IS NOT NULL AND p_mode NOT IN ('own','across','central') THEN RAISE EXCEPTION 'Choose where pay is charged'; END IF;
  SELECT pay_split, trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) INTO v_old, v_name FROM public.hr_employees WHERE id = e AND tenant_id = t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown person'; END IF;
  UPDATE public.hr_employees SET pay_split = p_mode WHERE id = e AND tenant_id = t;
  INSERT INTO public.audit_log (tenant_id, user_id, action, entity_type, entity_id, details)
  VALUES (t, auth.uid(), 'pay_split_changed', 'hr_employees', e::text,
          jsonb_build_object('title', 'Pay charged to changed for ' || v_name, 'from', v_old, 'to', p_mode));
END
$function$;
REVOKE ALL ON FUNCTION public.save_pay_split(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_pay_split(uuid, uuid, text) TO authenticated;
