ALTER TABLE public.alert_events ALTER COLUMN rule_id DROP NOT NULL;
ALTER TABLE public.alert_events ADD COLUMN kind text, ADD COLUMN subject text, ADD COLUMN status text NOT NULL DEFAULT 'open', ADD COLUMN area text, ADD COLUMN venue_id uuid REFERENCES public.venues(id), ADD COLUMN title text, ADD COLUMN why text, ADD COLUMN baseline numeric, ADD COLUMN actual numeric, ADD COLUMN action_path text, ADD COLUMN closed_by text, ADD COLUMN closed_at timestamptz, ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX smart_alert_active_key ON public.alert_events(tenant_id,kind,coalesce(venue_id,'00000000-0000-0000-0000-000000000000'::uuid),subject) WHERE kind IS NOT NULL AND status IN ('open','muted');
COMMENT ON TABLE public.alert_rules IS 'DEPRECATED: manual builder retained for Settings compatibility; automatic detectors own new events.';
CREATE TABLE public.alert_mutes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id), kind text, area text, venue_id uuid REFERENCES public.venues(id), scope text NOT NULL CHECK(scope IN ('bigger_only','until','summary_only','route_to_role','off')), threshold numeric, until_date date, target_role text, reason text NOT NULL DEFAULT '', created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), active boolean NOT NULL DEFAULT true, CHECK(kind IS NOT NULL OR area IS NOT NULL));
GRANT SELECT ON public.alert_mutes TO authenticated;
GRANT ALL ON public.alert_mutes TO service_role;
ALTER TABLE public.alert_mutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_mutes_read ON public.alert_mutes FOR SELECT TO authenticated USING(user_has_tenant(auth.uid(),tenant_id) OR is_super_admin(auth.uid()));
CREATE TABLE public.alert_evaluation_runs(tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id),last_day date,last_result jsonb NOT NULL DEFAULT '{}'::jsonb,updated_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.alert_evaluation_runs TO service_role;
ALTER TABLE public.alert_evaluation_runs ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.smart_alert_sync(t uuid, day date, candidates jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c jsonb; old public.alert_events; ident uuid; fired jsonb:='[]'; seen text[]:='{}'; k text; m public.alert_mutes; st text; v uuid; result jsonb;
BEGIN
IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server only'; END IF;
PERFORM pg_advisory_xact_lock(hashtext('smart-alert:'||t::text));
FOR c IN SELECT value FROM jsonb_array_elements(candidates) LOOP
v:=nullif(c->>'venue_id','')::uuid; k:=(c->>'kind')||'|'||coalesce(v::text,'')||'|'||(c->>'subject'); seen:=array_append(seen,k); st:='open';
SELECT * INTO old FROM alert_events WHERE tenant_id=t AND kind=c->>'kind' AND venue_id IS NOT DISTINCT FROM v AND subject=c->>'subject' ORDER BY created_at DESC LIMIT 1;
IF old.id IS NOT NULL AND old.status='done' AND old.closed_by IS DISTINCT FROM 'bani' THEN CONTINUE; END IF;
FOR m IN SELECT * FROM alert_mutes WHERE tenant_id=t AND active AND (kind IS NULL OR kind=c->>'kind') AND (area IS NULL OR area=c->>'area') AND (venue_id IS NULL OR venue_id=v) LOOP
IF m.scope='until' AND m.until_date>=day OR m.scope IN ('off','summary_only') OR m.scope='bigger_only' AND coalesce((c->'payload'->>'change_percent')::numeric,0)<=coalesce(m.threshold,60) THEN st:='muted'; END IF;
END LOOP;
IF c->'payload'->>'summary_only'='true' THEN st:='muted'; END IF;
IF old.id IS NOT NULL AND old.status IN ('open','muted') THEN
UPDATE alert_events SET title=c->>'title', why=c->>'why', baseline=(c->>'baseline')::numeric,actual=(c->>'actual')::numeric,severity=c->>'severity',payload=c->'payload',status=st,updated_at=now() WHERE id=old.id;
ELSE
INSERT INTO alert_events(tenant_id,kind,subject,fired_for_date,severity,status,area,venue_id,title,why,baseline,actual,action_path,payload) VALUES(t,c->>'kind',c->>'subject',coalesce((c->>'date')::date,day),c->>'severity',st,c->>'area',v,c->>'title',c->>'why',(c->>'baseline')::numeric,(c->>'actual')::numeric,c->>'action_path',coalesce(c->'payload','{}')) RETURNING id INTO ident;
fired:=fired||jsonb_build_array(c||jsonb_build_object('id',ident,'status',st));
END IF;
END LOOP;
UPDATE alert_events SET status='done',closed_by='bani',closed_at=now(),updated_at=now() WHERE tenant_id=t AND kind IS NOT NULL AND status IN ('open','muted') AND NOT(kind||'|'||coalesce(venue_id::text,'')||'|'||subject=ANY(seen));
result:=jsonb_build_object('fired',fired,'evaluated',jsonb_array_length(candidates));
INSERT INTO alert_evaluation_runs(tenant_id,last_day,last_result) VALUES(t,day,result) ON CONFLICT(tenant_id) DO UPDATE SET last_day=day,last_result=result,updated_at=now();
RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.smart_alert_sync(uuid,date,jsonb) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.smart_alert_sync(uuid,date,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.smart_alert_action(t uuid, ident uuid, decision text, options jsonb DEFAULT '{}') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.alert_events; vday date; wd int; sc text; target text;
BEGIN
IF auth.uid() IS NULL OR NOT(user_has_tenant(auth.uid(),t) OR is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'Access denied'; END IF;
SELECT * INTO a FROM alert_events WHERE id=ident AND tenant_id=t FOR UPDATE;
IF a.id IS NULL OR a.kind IS NULL THEN RAISE EXCEPTION 'Alert not found'; END IF;
IF decision IN ('done','reopen') THEN UPDATE alert_events SET status=CASE WHEN decision='done' THEN 'done' ELSE 'open' END,closed_by=CASE WHEN decision='done' THEN auth.uid()::text END,closed_at=CASE WHEN decision='done' THEN now() END,updated_at=now() WHERE id=ident; RETURN; END IF;
IF decision='mute' THEN
sc:=options->>'scope'; target:=options->>'target_role';
IF sc NOT IN ('bigger_only','until','summary_only','route_to_role','off') THEN RAISE EXCEPTION 'Invalid scope'; END IF;
IF sc='bigger_only' AND (coalesce((options->>'threshold')::numeric,0)<40 OR (options->>'threshold')::numeric>1000) THEN RAISE EXCEPTION 'Invalid threshold'; END IF;
IF sc='until' AND (options->>'until_date' IS NULL OR (options->>'until_date')::date<current_date) THEN RAISE EXCEPTION 'Choose a future date'; END IF;
IF sc='route_to_role' AND NOT EXISTS(SELECT 1 FROM tenant_members WHERE tenant_id=t AND role=target AND user_id<>auth.uid()) THEN RAISE EXCEPTION 'No other member has that role'; END IF;
INSERT INTO alert_mutes(tenant_id,kind,venue_id,scope,threshold,until_date,target_role,reason,created_by) VALUES(t,a.kind,a.venue_id,sc,(options->>'threshold')::numeric,(options->>'until_date')::date,target,left(coalesce(options->>'reason',''),1000),auth.uid());
UPDATE alert_events SET status='muted',updated_at=now() WHERE id=ident; RETURN;
END IF;
IF a.kind<>'closed_weekday_question' OR a.status='done' THEN RAISE EXCEPTION 'Not an unanswered question'; END IF;
SELECT (now() AT TIME ZONE coalesce(timezone,'Asia/Hong_Kong'))::date-1 INTO vday FROM tenants WHERE id=t;
IF decision='yes' THEN
IF NOT EXISTS(SELECT 1 FROM tenant_members WHERE tenant_id=t AND user_id=auth.uid() AND role IN ('owner','admin','manager')) AND NOT is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Manager approval required'; END IF;
FOR wd IN SELECT value::int FROM jsonb_array_elements_text(a.payload->'weekdays') LOOP
INSERT INTO venue_closure_rules(tenant_id,venue_id,weekday,start_date,reason,created_by) VALUES(t,a.venue_id,wd,coalesce((a.payload->>'start_date')::date,vday),'Confirmed from Alerts',auth.uid());
END LOOP;
ELSIF decision='no' THEN
INSERT INTO alert_events(tenant_id,kind,subject,fired_for_date,severity,status,area,venue_id,title,why,actual,action_path,payload) VALUES(t,'missing_sales',a.subject,vday,'normal','open','sales',a.venue_id,'Missing sales: '||(SELECT name FROM venues WHERE id=a.venue_id),'You confirmed this venue still trades on these weekdays.',0,'/revenue/sales',jsonb_build_object('confirmed_trading',true,'weekdays',a.payload->'weekdays','start_date',a.payload->>'start_date')) ON CONFLICT DO NOTHING;
ELSIF decision='unsure' THEN
INSERT INTO alert_mutes(tenant_id,kind,venue_id,scope,until_date,reason,created_by) VALUES(t,a.kind,a.venue_id,'until',vday+15,'Not sure',auth.uid()); UPDATE alert_events SET status='muted',updated_at=now() WHERE id=ident; RETURN;
ELSE RAISE EXCEPTION 'Invalid answer'; END IF;
UPDATE alert_events SET status='done',closed_by=auth.uid()::text,closed_at=now(),payload=payload||jsonb_build_object('answer',decision),updated_at=now() WHERE id=ident;
END $$;
REVOKE ALL ON FUNCTION public.smart_alert_action(uuid,uuid,text,jsonb) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.smart_alert_action(uuid,uuid,text,jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.smart_alert_unmute(t uuid, ident uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE m public.alert_mutes; BEGIN
IF auth.uid() IS NULL OR NOT(user_has_tenant(auth.uid(),t) OR is_super_admin(auth.uid())) THEN RAISE EXCEPTION 'Access denied'; END IF;
SELECT * INTO m FROM alert_mutes WHERE id=ident AND tenant_id=t FOR UPDATE; IF m.id IS NULL THEN RAISE EXCEPTION 'Mute not found'; END IF;
UPDATE alert_mutes SET active=false,updated_at=now() WHERE id=ident;
UPDATE alert_events SET status='open',updated_at=now() WHERE tenant_id=t AND status='muted' AND (m.kind IS NULL OR kind=m.kind) AND (m.area IS NULL OR area=m.area) AND (m.venue_id IS NULL OR venue_id=m.venue_id) AND NOT EXISTS(SELECT 1 FROM alert_mutes x WHERE x.tenant_id=t AND x.active AND (x.kind IS NULL OR x.kind=alert_events.kind) AND (x.area IS NULL OR x.area=alert_events.area) AND (x.venue_id IS NULL OR x.venue_id=alert_events.venue_id) AND (x.scope<>'until' OR x.until_date>=current_date)) AND coalesce(payload->>'summary_only','false')<>'true';
END $$;
REVOKE ALL ON FUNCTION public.smart_alert_unmute(uuid,uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.smart_alert_unmute(uuid,uuid) TO authenticated;