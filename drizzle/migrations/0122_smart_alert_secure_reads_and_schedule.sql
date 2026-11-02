CREATE TABLE public.alert_scheduler_tokens(token text PRIMARY KEY DEFAULT encode(gen_random_bytes(32),'hex'), created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.alert_scheduler_tokens TO service_role;
ALTER TABLE public.alert_scheduler_tokens ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.smart_alert_check_schedule(token text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT auth.role()='service_role' AND EXISTS(SELECT 1 FROM alert_scheduler_tokens s WHERE s.token=$1) $$;
REVOKE ALL ON FUNCTION public.smart_alert_check_schedule(text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.smart_alert_check_schedule(text) TO service_role;
DO $$ DECLARE def text; BEGIN SELECT pg_get_functiondef('public.finance_month_checks(uuid,date)'::regprocedure) INTO def; def:=replace(def,'public.finance_month_checks(', 'public.smart_alert_month_check('); def:=replace(def,'IF NOT public.user_has_tenant(auth.uid(),p_tenant_id) THEN', 'IF auth.role() IS DISTINCT FROM ''service_role'' THEN'); def:=replace(def,'p_tenant_id','t'); def:=replace(def,'p_month','m_input'); EXECUTE def; END $$;
REVOKE ALL ON FUNCTION public.smart_alert_month_check(uuid,date) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.smart_alert_month_check(uuid,date) TO service_role;
CREATE OR REPLACE FUNCTION public.smart_alert_can_read(t uuid,v uuid,a text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (is_super_admin(auth.uid()) OR (user_has_tenant(auth.uid(),t) AND NOT EXISTS(SELECT 1 FROM user_access_control WHERE tenant_id=t AND user_id=auth.uid() AND status='disabled') AND NOT EXISTS(SELECT 1 FROM user_page_permissions WHERE tenant_id=t AND user_id=auth.uid() AND page_key=CASE WHEN a='sales' THEN 'revenue' ELSE a END AND NOT can_access) AND (v IS NULL OR NOT EXISTS(SELECT 1 FROM user_venue_access WHERE tenant_id=t AND user_id=auth.uid()) OR EXISTS(SELECT 1 FROM user_venue_access WHERE tenant_id=t AND user_id=auth.uid() AND venue_id=v))))
 $$;
REVOKE ALL ON FUNCTION public.smart_alert_can_read(uuid,uuid,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.smart_alert_can_read(uuid,uuid,text) TO authenticated;
DROP POLICY tenant_select ON public.alert_events; DROP POLICY tenant_write ON public.alert_events;
CREATE POLICY smart_events_read ON public.alert_events FOR SELECT TO authenticated USING(smart_alert_can_read(tenant_id,venue_id,area) AND NOT EXISTS(SELECT 1 FROM alert_mutes m WHERE m.tenant_id=alert_events.tenant_id AND m.active AND m.scope='route_to_role' AND (m.kind IS NULL OR m.kind=alert_events.kind) AND (m.area IS NULL OR m.area=alert_events.area) AND (m.venue_id IS NULL OR m.venue_id=alert_events.venue_id) AND (m.created_by=auth.uid() OR NOT EXISTS(SELECT 1 FROM tenant_members tm WHERE tm.tenant_id=alert_events.tenant_id AND tm.user_id=auth.uid() AND tm.role=m.target_role))));
GRANT SELECT ON public.alert_events TO authenticated; GRANT ALL ON public.alert_events TO service_role;
CREATE POLICY smart_legacy_write ON public.alert_events FOR ALL TO authenticated USING(kind IS NULL AND user_has_tenant(auth.uid(),tenant_id)) WITH CHECK(kind IS NULL AND user_has_tenant(auth.uid(),tenant_id));
DROP POLICY tenant_mutes_read ON public.alert_mutes;
CREATE POLICY tenant_mutes_read ON public.alert_mutes FOR SELECT TO authenticated USING(smart_alert_can_read(tenant_id,venue_id,coalesce(area,CASE WHEN kind LIKE 'sales%' OR kind IN ('missing_sales','closed_weekday_question') THEN 'sales' WHEN kind LIKE '%bill%' THEN 'expenses' WHEN kind LIKE '%bank%' THEN 'bank' WHEN kind LIKE '%card%' THEN 'payments' WHEN kind='supplier_price_rise' THEN 'procurement' ELSE 'finance' END)));
DO $$ DECLARE def text; BEGIN SELECT pg_get_functiondef('public.smart_alert_action(uuid,uuid,text,jsonb)'::regprocedure) INTO def; def:=replace(def,'IF a.id IS NULL OR a.kind IS NULL THEN','IF a.id IS NULL OR a.kind IS NULL OR NOT smart_alert_can_read(t,a.venue_id,a.area) THEN'); EXECUTE def; END $$;
CREATE OR REPLACE FUNCTION public.smart_alert_edit_mute(t uuid,ident uuid,options jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE m alert_mutes;sc text;BEGIN
SELECT * INTO m FROM alert_mutes WHERE id=ident AND tenant_id=t FOR UPDATE;
IF m.id IS NULL OR auth.uid() IS NULL OR NOT smart_alert_can_read(t,m.venue_id,coalesce(m.area,CASE WHEN m.kind LIKE 'sales%' OR m.kind IN ('missing_sales','closed_weekday_question') THEN 'sales' ELSE 'finance' END)) THEN RAISE EXCEPTION 'Access denied'; END IF;
sc:=options->>'scope';IF sc NOT IN ('bigger_only','until','summary_only','route_to_role','off') THEN RAISE EXCEPTION 'Invalid scope'; END IF;
IF sc='bigger_only' AND coalesce((options->>'threshold')::numeric,0)<40 THEN RAISE EXCEPTION 'Invalid threshold';END IF;
IF sc='until' AND ((options->>'until_date') IS NULL OR (options->>'until_date')::date<current_date) THEN RAISE EXCEPTION 'Choose a future date'; END IF;
IF sc='route_to_role' AND NOT EXISTS(SELECT 1 FROM tenant_members WHERE tenant_id=t AND role=options->>'target_role' AND user_id<>auth.uid()) THEN RAISE EXCEPTION 'No other member has that role'; END IF;
UPDATE alert_mutes SET scope=sc,threshold=(options->>'threshold')::numeric,until_date=(options->>'until_date')::date,target_role=options->>'target_role',reason=left(coalesce(options->>'reason',''),1000),updated_at=now(),active=true WHERE id=ident;
END $$;
REVOKE ALL ON FUNCTION public.smart_alert_edit_mute(uuid,uuid,jsonb) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.smart_alert_edit_mute(uuid,uuid,jsonb) TO authenticated;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;