CREATE OR REPLACE FUNCTION public.expense_contract_month_amount(p_rule uuid,p_month date) RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.expense_recurring_rules%ROWTYPE;m date;amt numeric;total numeric:=0;n int:=0;step jsonb;divisor int;
BEGIN SELECT * INTO r FROM public.expense_recurring_rules WHERE id=p_rule;
IF NOT FOUND OR NOT r.is_contract OR r.effective_from IS NULL OR p_month<date_trunc('month',r.effective_from)::date OR (r.contract_end IS NOT NULL AND p_month>r.contract_end) THEN RAISE EXCEPTION 'Month is outside contract coverage';END IF;
IF r.cadence NOT IN ('monthly','quarterly','yearly') THEN RAISE EXCEPTION 'Contract cadence must be monthly, quarterly or yearly';END IF;
divisor:=CASE r.cadence WHEN 'quarterly' THEN 3 WHEN 'yearly' THEN 12 ELSE 1 END;
IF (jsonb_array_length(r.rent_free_months)>0 OR jsonb_array_length(r.step_increases)>0) AND r.contract_end IS NULL THEN RAISE EXCEPTION 'Full contract term required for straight-line rent';END IF;
m:=CASE WHEN jsonb_array_length(r.rent_free_months)>0 OR jsonb_array_length(r.step_increases)>0 THEN date_trunc('month',r.effective_from)::date ELSE p_month END;
LOOP
amt:=r.expected_amount;
SELECT x INTO step FROM jsonb_array_elements(r.step_increases) x WHERE (x->>'month')<=to_char(m,'YYYY-MM') ORDER BY x->>'month' DESC LIMIT 1;
IF step IS NOT NULL THEN amt:=(step->>'amount')::numeric;END IF;
IF r.rent_free_months ? to_char(m,'YYYY-MM') THEN amt:=0;END IF;
total:=total+amt/divisor;n:=n+1;
EXIT WHEN r.contract_end IS NULL OR NOT(jsonb_array_length(r.rent_free_months)>0 OR jsonb_array_length(r.step_increases)>0) OR (m+interval '1 month')::date>r.contract_end;
m:=(m+interval '1 month')::date;IF n>240 THEN RAISE EXCEPTION 'Contract term too long';END IF;END LOOP;RETURN round(total/n,2);END $$;
CREATE OR REPLACE FUNCTION public.expense_accrual_validate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.expense_recurring_rules%ROWTYPE;b record;amount numeric;BEGIN
IF NEW.direction NOT IN ('cost','income') OR NEW.kind NOT IN ('contract','estimate') OR NEW.amount<0 OR NEW.month_start<>date_trunc('month',NEW.month_start)::date THEN RAISE EXCEPTION 'Invalid accrual draft';END IF;
IF NEW.recurring_rule_id IS NOT NULL THEN
SELECT * INTO r FROM public.expense_recurring_rules WHERE id=NEW.recurring_rule_id AND tenant_id=NEW.tenant_id;
IF NOT FOUND OR NOT r.is_contract OR r.account_id IS DISTINCT FROM NEW.account_id OR r.supplier_id IS DISTINCT FROM NEW.supplier_id OR r.venue_id IS DISTINCT FROM NEW.venue_id OR r.direction<>NEW.direction THEN RAISE EXCEPTION 'Draft does not match its contract';END IF;
IF r.billed_when='advance' THEN RAISE EXCEPTION 'Advance-billed contracts need the prepaid schedule before posting';END IF;
IF NEW.amount<>public.expense_contract_month_amount(r.id,NEW.month_start) THEN RAISE EXCEPTION 'Contract amount changed; prepare a fresh draft';END IF;
ELSE
IF NEW.kind<>'estimate' OR NEW.direction<>'cost' OR NOT EXISTS(SELECT 1 FROM public.expense_bills eb JOIN public.expense_bill_allocations a ON a.bill_id=eb.id WHERE eb.tenant_id=NEW.tenant_id AND eb.supplier_id=NEW.supplier_id AND eb.venue_id IS NOT DISTINCT FROM NEW.venue_id AND a.account_id=NEW.account_id) THEN RAISE EXCEPTION 'Estimate requires supplier and account evidence';END IF;
SELECT round(avg(total_amount),2) INTO amount FROM (SELECT total_amount FROM public.expense_bills eb WHERE eb.tenant_id=NEW.tenant_id AND eb.supplier_id=NEW.supplier_id AND eb.venue_id IS NOT DISTINCT FROM NEW.venue_id AND eb.approval_status='posted' AND coalesce(eb.service_period_end,eb.period_end,eb.bill_date)<NEW.month_start ORDER BY coalesce(eb.service_period_end,eb.period_end,eb.bill_date) DESC LIMIT 3) p;
IF amount IS NULL OR NEW.amount<>amount THEN RAISE EXCEPTION 'Estimate must equal the last three posted bills';END IF;
END IF;RETURN NEW;END $$;
CREATE TRIGGER expense_accrual_validate_insert BEFORE INSERT ON public.expense_accrual_drafts FOR EACH ROW EXECUTE FUNCTION public.expense_accrual_validate();
CREATE OR REPLACE FUNCTION public.expense_prepare_month(t uuid,m date) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.expense_recurring_rules%ROWTYPE;g record;n int:=0;affected int;amt numeric;
BEGIN IF auth.uid() IS NULL OR NOT public.user_has_tenant(auth.uid(),t) OR NOT(public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN RAISE EXCEPTION 'Expense preparation access required';END IF;
m:=date_trunc('month',m)::date;IF m>=date_trunc('month',now() AT TIME ZONE 'Asia/Hong_Kong')::date THEN RAISE EXCEPTION 'Only finished months can be prepared';END IF;
FOR r IN SELECT * FROM public.expense_recurring_rules WHERE tenant_id=t AND is_contract AND status='active' AND effective_from IS NOT NULL AND date_trunc('month',effective_from)::date<=m AND (contract_end IS NULL OR contract_end>=m) AND (venue_id IS NULL OR public.user_has_venue(auth.uid(),venue_id)) LOOP
IF r.billed_when='advance' OR EXISTS(SELECT 1 FROM public.expense_bills WHERE tenant_id=t AND recurring_rule_id=r.id AND approval_status='posted' AND date_trunc('month',coalesce(period_start,bill_date))::date=m) THEN CONTINUE;END IF;
amt:=public.expense_contract_month_amount(r.id,m);
INSERT INTO public.expense_accrual_drafts(tenant_id,recurring_rule_id,supplier_id,venue_id,month_start,amount,account_id,direction,kind,reason,source_key,created_by) VALUES(t,r.id,r.supplier_id,r.venue_id,m,amt,r.account_id,r.direction,'contract','From contract — waiting for your approval','contract:'||r.id,auth.uid()) ON CONFLICT DO NOTHING;
GET DIAGNOSTICS affected=ROW_COUNT;n:=n+affected;END LOOP;
FOR g IN SELECT b.supplier_id,b.venue_id,count(DISTINCT date_trunc('month',coalesce(b.service_period_end,b.period_end,b.bill_date))) months FROM public.expense_bills b WHERE b.tenant_id=t AND b.approval_status='posted' AND b.supplier_id IS NOT NULL AND coalesce(b.service_period_end,b.period_end,b.bill_date)<m AND (b.venue_id IS NULL OR public.user_has_venue(auth.uid(),b.venue_id)) GROUP BY b.supplier_id,b.venue_id HAVING count(DISTINCT date_trunc('month',coalesce(b.service_period_end,b.period_end,b.bill_date)))>=3 LOOP
IF EXISTS(SELECT 1 FROM public.expense_recurring_rules WHERE tenant_id=t AND is_contract AND supplier_id=g.supplier_id AND venue_id IS NOT DISTINCT FROM g.venue_id) OR EXISTS(SELECT 1 FROM public.expense_bills WHERE tenant_id=t AND supplier_id=g.supplier_id AND venue_id IS NOT DISTINCT FROM g.venue_id AND approval_status NOT IN ('void','reversed','rejected') AND date_trunc('month',coalesce(service_period_end,period_end,bill_date))::date=m) THEN CONTINUE;END IF;
SELECT round(avg(total_amount),2) INTO amt FROM (SELECT total_amount FROM public.expense_bills b WHERE b.tenant_id=t AND b.supplier_id=g.supplier_id AND b.venue_id IS NOT DISTINCT FROM g.venue_id AND b.approval_status='posted' AND coalesce(b.service_period_end,b.period_end,b.bill_date)<m ORDER BY coalesce(b.service_period_end,b.period_end,b.bill_date) DESC LIMIT 3) q;
INSERT INTO public.expense_accrual_drafts(tenant_id,supplier_id,venue_id,venue,month_start,amount,account_id,direction,kind,reason,source_key,created_by) SELECT t,g.supplier_id,g.venue_id,b.venue,m,amt,a.account_id,'cost','estimate','Estimate from last three posted bills — waiting for your approval','estimate:'||g.supplier_id||':'||coalesce(g.venue_id::text,'central'),auth.uid() FROM public.expense_bills b JOIN public.expense_bill_allocations a ON a.bill_id=b.id JOIN public.chart_of_accounts c ON c.id=a.account_id AND c.account_type IN ('opex','other_expense') WHERE b.tenant_id=t AND b.supplier_id=g.supplier_id AND b.venue_id IS NOT DISTINCT FROM g.venue_id AND b.approval_status='posted' ORDER BY b.bill_date DESC,a.line_no LIMIT 1 ON CONFLICT DO NOTHING;
GET DIAGNOSTICS affected=ROW_COUNT;n:=n+affected;END LOOP;RETURN n;END $$;
REVOKE ALL ON FUNCTION public.expense_prepare_month(uuid,date) FROM PUBLIC;GRANT EXECUTE ON FUNCTION public.expense_prepare_month(uuid,date) TO authenticated;
DO $$ DECLARE def text;BEGIN SELECT pg_get_functiondef('public.expense_actual_coverage()'::regprocedure) INTO def;def:=replace(def,'ELSE round(line.debit*days/total_days,2) END','ELSE round(line.debit*(least(last_day,(month_day+interval ''1 month - 1 day'')::date)-first_day+1)::numeric/total_days,2)-round(line.debit*(greatest(first_day,month_day)-first_day)::numeric/total_days,2) END');EXECUTE def;END $$;