CREATE OR REPLACE FUNCTION public.expense_meter_split(p_account uuid,p_month date,p_amount numeric) RETURNS TABLE(venue_id uuid,venue text,amount numeric) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.supplier_accounts%ROWTYPE;x jsonb;total numeric:=0;used numeric:=0;weight numeric;part numeric;i int:=0;n int;
BEGIN SELECT * INTO a FROM public.supplier_accounts WHERE id=p_account;
IF NOT FOUND OR a.split_method='unknown' OR jsonb_array_length(a.covers)=0 THEN RAISE EXCEPTION 'Which venues does this account cover?';END IF;
IF auth.uid() IS NOT NULL AND NOT public.user_has_tenant(auth.uid(),a.tenant_id) THEN RAISE EXCEPTION 'Account access required';END IF;
FOR x IN SELECT * FROM jsonb_array_elements(a.covers) LOOP
IF auth.uid() IS NOT NULL AND NOT public.user_has_venue(auth.uid(),(x->>'venue_id')::uuid) THEN RAISE EXCEPTION 'Venue access required';END IF;
IF a.split_method IN ('sales','central') THEN SELECT coalesce(sum(total_sales),0) INTO weight FROM public.sales_records s JOIN public.venues v ON v.name=s.venue AND v.tenant_id=s.tenant_id WHERE s.tenant_id=a.tenant_id AND v.id=(x->>'venue_id')::uuid AND s.date>=p_month AND s.date<p_month+interval '1 month';ELSE weight:=CASE WHEN a.split_method='single' THEN 1 ELSE coalesce((x->>'weight')::numeric,0) END;END IF;total:=total+weight;END LOOP;
IF total<=0 THEN RAISE EXCEPTION 'Account split needs sales or floor area evidence';END IF;n:=jsonb_array_length(a.covers);
FOR x IN SELECT * FROM jsonb_array_elements(a.covers) LOOP i:=i+1;
IF a.split_method IN ('sales','central') THEN SELECT coalesce(sum(total_sales),0) INTO weight FROM public.sales_records s JOIN public.venues v ON v.name=s.venue AND v.tenant_id=s.tenant_id WHERE s.tenant_id=a.tenant_id AND v.id=(x->>'venue_id')::uuid AND s.date>=p_month AND s.date<p_month+interval '1 month';ELSE weight:=CASE WHEN a.split_method='single' THEN 1 ELSE coalesce((x->>'weight')::numeric,0) END;END IF;
part:=CASE WHEN i=n THEN p_amount-used ELSE round(p_amount*weight/total,2) END;used:=used+part;venue_id:=(x->>'venue_id')::uuid;SELECT v.name INTO venue FROM public.venues v WHERE v.id=venue_id;amount:=part;RETURN NEXT;END LOOP;END $$;
REVOKE ALL ON FUNCTION public.expense_meter_split(uuid,date,numeric) FROM PUBLIC;GRANT EXECUTE ON FUNCTION public.expense_meter_split(uuid,date,numeric) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.expense_account_estimate(p_account uuid,p_month date) RETURNS numeric LANGUAGE sql STABLE SET search_path=public AS $$ SELECT round(avg(amount),2) FROM (SELECT coalesce((b.meta->'statement_check'->>'current_charges')::numeric,b.total_amount) amount FROM public.expense_bills b WHERE b.supplier_account_id=p_account AND b.approval_status='posted' AND coalesce(b.service_period_end,b.period_end,b.bill_date)<p_month ORDER BY coalesce(b.service_period_end,b.period_end,b.bill_date) DESC LIMIT 3) q HAVING count(*)=3 $$;
DO $$ DECLARE def text;BEGIN
SELECT pg_get_functiondef('public.expense_accrual_validate()'::regprocedure) INTO def;
def:=replace(def,'IF NEW.kind<>''estimate'' OR NEW.direction<>''cost''','IF NEW.supplier_account_id IS NOT NULL THEN
SELECT public.expense_account_estimate(NEW.supplier_account_id,NEW.month_start) INTO amount;
IF amount IS NULL OR NEW.amount<>amount OR NOT EXISTS(SELECT 1 FROM public.supplier_accounts sa WHERE sa.id=NEW.supplier_account_id AND sa.tenant_id=NEW.tenant_id AND sa.supplier_id=NEW.supplier_id AND sa.default_gl_account_id=NEW.account_id) THEN RAISE EXCEPTION ''Account estimate evidence changed'';END IF;RETURN NEW;END IF;
IF NEW.kind<>''estimate'' OR NEW.direction<>''cost''');EXECUTE def;
SELECT pg_get_functiondef('public.expense_accrual_approve(uuid)'::regprocedure) INTO def;
def:=replace(def,'IF NOT FOUND OR NOT public.user_has_tenant(auth.uid(),d.tenant_id) OR NOT(public.has_role(auth.uid(),''admin'') OR public.has_role(auth.uid(),''manager'')) OR (d.venue_id IS NOT NULL AND NOT public.user_has_venue(auth.uid(),d.venue_id)) THEN', 'IF NOT FOUND OR (auth.uid() IS NULL AND current_setting(''app.expense_monthend'',true) IS DISTINCT FROM ''on'') OR (auth.uid() IS NOT NULL AND (NOT public.user_has_tenant(auth.uid(),d.tenant_id) OR NOT(public.has_role(auth.uid(),''admin'') OR public.has_role(auth.uid(),''manager'')) OR (d.venue_id IS NOT NULL AND NOT public.user_has_venue(auth.uid(),d.venue_id)))) THEN');
def:=replace(def,'IF d.month_start>=date_trunc(''month'',now() AT TIME ZONE ''Asia/Hong_Kong'')::date THEN','IF (d.month_start+interval ''1 month - 1 day'')::date>(now() AT TIME ZONE ''Asia/Hong_Kong'')::date THEN');
def:=replace(def,'IF d.venue_id IS NULL AND d.recurring_rule_id IS NOT NULL THEN','IF d.supplier_account_id IS NOT NULL THEN
IF d.amount<>public.expense_account_estimate(d.supplier_account_id,d.month_start) THEN RAISE EXCEPTION ''Estimate evidence changed'';END IF;
FOR v IN SELECT * FROM public.expense_meter_split(d.supplier_account_id,d.month_start,d.amount) LOOP ln:=ln+1;INSERT INTO public.journal_lines(tenant_id,entry_id,account_id,debit,credit,venue,venue_id,line_no,memo) VALUES(d.tenant_id,j,d.account_id,v.amount,0,v.venue,v.venue_id,ln,''Account estimate'');END LOOP;
ELSIF d.venue_id IS NULL AND d.recurring_rule_id IS NOT NULL THEN');EXECUTE def;
SELECT pg_get_functiondef('public.expense_actual_coverage()'::regprocedure) INTO def;
def:=replace(def,'a.kind=''estimate'' AND a.supplier_id=NEW.supplier_id AND a.venue_id IS NOT DISTINCT FROM NEW.venue_id','a.kind=''estimate'' AND a.supplier_id=NEW.supplier_id AND ((a.supplier_account_id IS NOT NULL AND (a.supplier_account_id=NEW.supplier_account_id OR EXISTS(SELECT 1 FROM public.expense_bill_allocations ba WHERE ba.bill_id=NEW.id AND ba.supplier_account_id=a.supplier_account_id))) OR (a.supplier_account_id IS NULL AND a.venue_id IS NOT DISTINCT FROM NEW.venue_id))');EXECUTE def;END $$;
CREATE OR REPLACE FUNCTION public.expense_monthend_run(t uuid,m date) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.expense_recurring_rules%ROWTYPE;a public.supplier_accounts%ROWTYPE;d uuid;n int:=0;posted int:=0;amt numeric;err text;line record;
BEGIN
IF auth.uid() IS NULL THEN IF current_setting('role',true)<>'service_role' AND session_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'Scheduler access required';END IF;
ELSIF NOT public.user_has_tenant(auth.uid(),t) OR NOT(public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN RAISE EXCEPTION 'Expense access required';END IF;
m:=date_trunc('month',m)::date;IF (m+interval '1 month - 1 day')::date>(now() AT TIME ZONE 'Asia/Hong_Kong')::date THEN RAISE EXCEPTION 'Month has not ended';END IF;
PERFORM public.finance_assert_open(t,(m+interval '1 month - 1 day')::date);IF auth.uid() IS NULL THEN PERFORM set_config('app.expense_monthend','on',true);END IF;
FOR r IN SELECT * FROM public.expense_recurring_rules WHERE tenant_id=t AND is_contract AND status='active' AND effective_from<=m+interval '1 month - 1 day' AND (contract_end IS NULL OR contract_end>=m) LOOP
IF auth.uid() IS NOT NULL AND r.venue_id IS NOT NULL AND NOT public.user_has_venue(auth.uid(),r.venue_id) THEN CONTINUE;END IF;
BEGIN
IF r.billed_when='advance' THEN
FOR line IN SELECT l.id FROM public.prepaid_schedule_lines l JOIN public.prepaid_schedules s ON s.id=l.schedule_id JOIN public.expense_bills b ON b.id=s.source_bill_id WHERE s.tenant_id=t AND b.recurring_rule_id=r.id AND l.period=m AND l.status='pending' AND s.status='active' LOOP IF r.auto_approve THEN PERFORM public.post_prepaid_line(line.id);posted:=posted+1;END IF;END LOOP;CONTINUE;END IF;
IF EXISTS(SELECT 1 FROM public.expense_bills b WHERE b.tenant_id=t AND b.recurring_rule_id=r.id AND b.approval_status='posted' AND coalesce(b.service_period_start,b.period_start,b.bill_date)<=m+interval '1 month - 1 day' AND coalesce(b.service_period_end,b.period_end,b.bill_date)>=m) THEN CONTINUE;END IF;
amt:=public.expense_contract_month_amount(r.id,m);
INSERT INTO public.expense_accrual_drafts(tenant_id,recurring_rule_id,supplier_id,venue_id,month_start,amount,account_id,direction,kind,source_key,reason,created_by) VALUES(t,r.id,r.supplier_id,r.venue_id,m,amt,r.account_id,r.direction,'contract','contract:'||r.id,'From contract — Waiting for you',auth.uid()) ON CONFLICT DO NOTHING;
SELECT id INTO d FROM public.expense_accrual_drafts WHERE tenant_id=t AND source_key='contract:'||r.id AND month_start=m;n:=n+1;
IF r.auto_approve AND EXISTS(SELECT 1 FROM public.expense_accrual_drafts WHERE id=d AND status='waiting') THEN PERFORM public.expense_accrual_approve(d);posted:=posted+1;END IF;
EXCEPTION WHEN OTHERS THEN err:=SQLERRM;RAISE WARNING 'Contract month needs review: %',err;END;END LOOP;
FOR a IN SELECT * FROM public.supplier_accounts WHERE tenant_id=t AND is_active AND billed_when='arrears' LOOP
IF a.split_method='unknown' OR jsonb_array_length(a.covers)=0 OR a.default_gl_account_id IS NULL THEN CONTINUE;END IF;
IF auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM jsonb_array_elements(a.covers) x WHERE NOT public.user_has_venue(auth.uid(),(x->>'venue_id')::uuid)) THEN CONTINUE;END IF;
IF EXISTS(SELECT 1 FROM public.expense_bills b WHERE b.tenant_id=t AND b.supplier_account_id=a.id AND b.approval_status NOT IN ('void','reversed','rejected') AND coalesce(b.service_period_start,b.period_start,b.bill_date)<=m+interval '1 month - 1 day' AND coalesce(b.service_period_end,b.period_end,b.bill_date)>=m) THEN CONTINUE;END IF;
amt:=public.expense_account_estimate(a.id,m);IF amt IS NULL THEN CONTINUE;END IF;
BEGIN
INSERT INTO public.expense_accrual_drafts(tenant_id,supplier_id,supplier_account_id,month_start,amount,account_id,direction,kind,source_key,reason,created_by) VALUES(t,a.supplier_id,a.id,m,amt,a.default_gl_account_id,'cost','estimate','account-estimate:'||a.id,'Last three current-charge bills; reverses on actual coverage',auth.uid()) ON CONFLICT DO NOTHING;
SELECT id INTO d FROM public.expense_accrual_drafts WHERE tenant_id=t AND source_key='account-estimate:'||a.id AND month_start=m;n:=n+1;
IF EXISTS(SELECT 1 FROM public.expense_accrual_drafts WHERE id=d AND status='waiting') THEN PERFORM public.expense_accrual_approve(d);posted:=posted+1;END IF;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Account estimate needs review: %',SQLERRM;END;END LOOP;
RETURN jsonb_build_object('prepared',n,'posted',posted);END $$;
REVOKE ALL ON FUNCTION public.expense_monthend_run(uuid,date) FROM PUBLIC;GRANT EXECUTE ON FUNCTION public.expense_monthend_run(uuid,date) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.expense_monthend_scheduled() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE t uuid;m date;BEGIN
IF session_user NOT IN ('postgres','supabase_admin') AND current_setting('role',true)<>'service_role' THEN RAISE EXCEPTION 'Scheduler only';END IF;
m:=date_trunc('month',now() AT TIME ZONE 'Asia/Hong_Kong')::date;
IF (now() AT TIME ZONE 'Asia/Hong_Kong')::date<>(m+interval '1 month - 1 day')::date THEN RETURN;END IF;
FOR t IN SELECT id FROM public.tenants LOOP BEGIN PERFORM public.expense_monthend_run(t,m);EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Month-end needs review: %',SQLERRM;END;END LOOP;END $$;
REVOKE ALL ON FUNCTION public.expense_monthend_scheduled() FROM PUBLIC,authenticated,anon;GRANT EXECUTE ON FUNCTION public.expense_monthend_scheduled() TO service_role;