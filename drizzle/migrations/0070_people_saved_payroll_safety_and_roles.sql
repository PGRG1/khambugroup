CREATE TABLE public.hr_role_groups(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants(id),name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),titles text[] NOT NULL DEFAULT '{}',created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,name));
GRANT SELECT ON public.hr_role_groups TO authenticated;
GRANT ALL ON public.hr_role_groups TO service_role;
ALTER TABLE public.hr_role_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY people_roles_read ON public.hr_role_groups FOR SELECT TO authenticated USING(public.people_access(tenant_id,auth.uid()));
CREATE FUNCTION public.people_save_role_group(t uuid,n text,titles text[]) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE result uuid;BEGIN
IF auth.uid() IS NULL OR NOT public.people_owner(t,auth.uid()) OR current_setting('bani.people.executing',true) IS NULL OR current_setting('bani.people.executing',true)='' THEN RAISE EXCEPTION 'Confirm role groups with an owner through Bani';END IF;
IF length(trim(n)) NOT BETWEEN 1 AND 80 OR cardinality(titles) NOT BETWEEN 1 AND 50 OR EXISTS(SELECT 1 FROM unnest(titles) title WHERE length(trim(title)) NOT BETWEEN 1 AND 100) THEN RAISE EXCEPTION 'Role group and explicit job titles required';END IF;
INSERT INTO public.hr_role_groups(tenant_id,name,titles,created_by) VALUES(t,trim(n),titles,auth.uid()) ON CONFLICT(tenant_id,name) DO UPDATE SET titles=EXCLUDED.titles RETURNING id INTO result;RETURN result;END $$;
REVOKE ALL ON FUNCTION public.people_save_role_group(uuid,text,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.people_save_role_group(uuid,text,text[]) TO authenticated;
CREATE OR REPLACE FUNCTION public.payroll_preview(t uuid,y integer,m integer) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE e record;p public.hr_payroll;prior public.hr_payroll;terms jsonb;basis text;amount numeric;earned numeric;gross numeric;ee numeric;er numeric;missing jsonb;result jsonb:='[]';last_day date:=(make_date(y,m,1)+interval '1 month -1 day')::date;hours numeric;joined boolean;BEGIN
IF auth.uid() IS NULL OR NOT public.people_access(t,auth.uid()) OR y NOT BETWEEN 2000 AND 2200 OR m NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'People access and valid period required';END IF;
IF EXISTS(SELECT 1 FROM public.hr_payroll h WHERE h.tenant_id=t AND h.year=y AND h.month=m) THEN
SELECT COALESCE(jsonb_agg(to_jsonb(h)||jsonb_build_object('name',x.first_name||' '||x.last_name,'venue_id',x.venue_id) ORDER BY x.first_name,x.last_name),'[]') INTO result FROM public.hr_payroll h JOIN public.hr_employees x ON x.id=h.employee_id AND x.tenant_id=t WHERE h.tenant_id=t AND h.year=y AND h.month=m AND public.people_person_access(t,x.id,auth.uid());RETURN result;END IF;
FOR e IN SELECT * FROM public.hr_employees x WHERE x.tenant_id=t AND x.hire_date<=last_day AND (x.end_date IS NULL AND x.status IN('active','on_leave') OR x.end_date>=make_date(y,m,1)) AND public.people_person_access(t,x.id,auth.uid()) LOOP
SELECT * INTO prior FROM public.hr_payroll h WHERE h.tenant_id=t AND h.employee_id=e.id AND make_date(h.year,h.month,1)<make_date(y,m,1) ORDER BY h.year DESC,h.month DESC LIMIT 1;
terms:=public.people_terms_at(t,e.id,last_day);basis:=COALESCE(terms->>'pay_basis',prior.preparation->>'pay_basis',CASE WHEN e.employment_type='full_time' THEN 'month' END);missing:='[]';
IF prior.id IS NOT NULL THEN
p:=prior;p.id:=NULL;p.year:=y;p.month:=m;p.payment_status:='draft';p.payment_date:=NULL;p.net_salary_payment_date:=NULL;p.mpf_payment_date:=NULL;p.accrual_journal_entry_id:=NULL;p.salary_paid_amount:=0;p.mpf_paid_amount:=0;p.created_at:=now();p.updated_at:=now();
p.preparation:=jsonb_build_object('source','last_saved_payroll','starting_month',prior.year||'-'||lpad(prior.month::text,2,'0'),'starting_payroll_id',prior.id,'pay_basis',basis,'missing','[]'::jsonb,'reasons',jsonb_build_array('Starting from last saved payroll; confirm what changed'));
ELSE
amount:=NULLIF(terms->>'pay_amount','')::numeric;hours:=NULLIF(terms->>'monthly_hours','')::numeric;
IF amount IS NULL THEN missing:=missing||jsonb_build_array('Pay terms not recorded');END IF;
IF basis='hour' AND hours IS NULL THEN missing:=missing||jsonb_build_array('Monthly hours need a human instruction');END IF;
earned:=CASE WHEN basis='hour' THEN COALESCE(amount*hours,0) ELSE COALESCE(amount,0) END;
joined:=e.hire_date>=make_date(y,m,1);IF joined AND basis='month' THEN earned:=earned*(last_day-e.hire_date+1)/(last_day-make_date(y,m,1)+1);END IF;
gross:=earned;ee:=CASE WHEN gross<7100 THEN 0 ELSE least(1500,gross*.05) END;er:=least(1500,gross*.05);
SELECT jsonb_populate_record(NULL::public.hr_payroll,jsonb_build_object('tenant_id',t,'employee_id',e.id,'year',y,'month',m,'forecast_base_salary',COALESCE(amount,0),'forecast_allowances',COALESCE(hours,0),'earned_salary_override',earned,'annual_leave_pay',0,'statutory_holiday_pay',0,'unpaid_leave_deduction',0,'gross_salary',gross,'mpf_employee',ee,'mpf_employer',er,'net_salary',gross-ee,'mpf_payment_amount',ee+er,'total_deductions',ee,'payment_status','draft','preparation',jsonb_build_object('source','human_instruction','pay_basis',basis,'missing',missing,'reasons',jsonb_build_array('New payroll person; confirm dated pay terms and leave')))) INTO p;
END IF;
result:=result||jsonb_build_array(to_jsonb(p)||jsonb_build_object('name',e.first_name||' '||e.last_name,'venue_id',e.venue_id));END LOOP;RETURN result;END $$;
DO $$ DECLARE def text;anchor text:='PERFORM pg_advisory_xact_lock(hashtextextended(t::text||y||''-''||m,0));';BEGIN
SELECT pg_get_functiondef('public.payroll_prepare(uuid,integer,integer)'::regprocedure) INTO def;
IF strpos(def,anchor)=0 THEN RAISE EXCEPTION 'Payroll preparation guard anchor not found';END IF;
def:=replace(def,anchor,anchor||' IF EXISTS(SELECT 1 FROM public.hr_payroll saved WHERE saved.tenant_id=t AND saved.year=y AND saved.month=m) THEN RETURN public.payroll_preview(t,y,m);END IF; IF make_date(y,m,1)<>date_trunc(''month'',now() AT TIME ZONE ''Asia/Hong_Kong'')::date THEN RAISE EXCEPTION ''Only the current due month can be prepared; saved months are read-only'';END IF;');EXECUTE def;
SELECT pg_get_functiondef('public.bani_people_execute(uuid,uuid,text)'::regprocedure) INTO def;
anchor:='ELSIF op=''team_change'' THEN';IF strpos(def,anchor)=0 THEN RAISE EXCEPTION 'People confirmation branch not found';END IF;
def:=replace(def,anchor,'ELSIF op=''role_group'' THEN IF NOT public.people_owner(t,auth.uid()) THEN RAISE EXCEPTION ''Owner confirmation required for role groups'';END IF; IF (SELECT COALESCE(jsonb_agg(to_jsonb(g) ORDER BY g.id),''[]''::jsonb) FROM public.hr_role_groups g WHERE g.tenant_id=t AND g.name=p->>''name'') IS DISTINCT FROM p->''before'' THEN RAISE EXCEPTION ''Role group changed; review a fresh draft'';END IF; PERFORM set_config(''bani.people.executing'',a::text,true);cid:=public.people_save_role_group(t,p->>''name'',ARRAY(SELECT jsonb_array_elements_text(p->''titles'')));result:=jsonb_build_object(''ok'',true,''message'',''Recorded — role group saved.'',''link'',''/hr/employees'',''record_id'',cid,''undo_available'',false); '||anchor);EXECUTE def;
END $$;
COMMENT ON FUNCTION public.payroll_prepare(uuid,integer,integer) IS 'On-demand current-month preparation only. Any saved payroll month returns read-only without writes; never re-prepare legacy rows.';
COMMENT ON FUNCTION public.payroll_preview(uuid,integer,integer) IS 'Saved payroll is returned unchanged; a new month starts from each person last saved month. Rota and attendance are not required for pay.';