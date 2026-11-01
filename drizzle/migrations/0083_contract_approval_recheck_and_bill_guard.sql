DO $$ DECLARE def text;BEGIN SELECT pg_get_functiondef('public.expense_accrual_approve(uuid)'::regprocedure) INTO def;def:=replace(def,'PERFORM public.finance_assert_open(d.tenant_id,','IF d.month_start>=date_trunc(''month'',now() AT TIME ZONE ''Asia/Hong_Kong'')::date THEN RAISE EXCEPTION ''Contract posts only after month-end'';END IF;
IF d.recurring_rule_id IS NOT NULL AND d.amount<>public.expense_contract_month_amount(d.recurring_rule_id,d.month_start) THEN RAISE EXCEPTION ''Contract changed; prepare a fresh draft'';END IF;
PERFORM public.finance_assert_open(d.tenant_id,');def:=replace(def,'IF NOT FOUND OR NOT r.is_contract OR r.status<>''active'' THEN','IF r.billed_when=''advance'' THEN RAISE EXCEPTION ''Prepaid release schedule required'';END IF;
IF NOT FOUND OR NOT r.is_contract OR r.status<>''active'' THEN');EXECUTE def;END $$;
CREATE OR REPLACE FUNCTION public.expense_contract_bill_approve(p_bill uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.expense_bills%ROWTYPE;r public.expense_recurring_rules%ROWTYPE;d uuid;m date;BEGIN
SELECT * INTO b FROM public.expense_bills WHERE id=p_bill;
IF NOT FOUND OR NOT public.user_has_tenant(auth.uid(),b.tenant_id) OR NOT(public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')) THEN RAISE EXCEPTION 'Expense approval access required';END IF;
SELECT * INTO r FROM public.expense_recurring_rules WHERE id=b.recurring_rule_id AND tenant_id=b.tenant_id;
IF NOT FOUND OR NOT r.is_contract OR b.approval_status NOT IN ('draft','pending_review','approved') THEN RAISE EXCEPTION 'Waiting contract bill required';END IF;
m:=date_trunc('month',coalesce(b.period_start,b.service_period_start,b.bill_date))::date;
INSERT INTO public.expense_accrual_drafts(tenant_id,recurring_rule_id,supplier_id,venue_id,month_start,amount,account_id,direction,source_key,reason,created_by) VALUES(b.tenant_id,r.id,r.supplier_id,r.venue_id,m,public.expense_contract_month_amount(r.id,m),r.account_id,r.direction,'contract:'||r.id,'From contract — explicitly approved',auth.uid()) ON CONFLICT DO NOTHING;
SELECT id INTO d FROM public.expense_accrual_drafts WHERE tenant_id=b.tenant_id AND source_key='contract:'||r.id AND month_start=m;
RETURN public.expense_accrual_approve(d);END $$;
REVOKE ALL ON FUNCTION public.expense_contract_bill_approve(uuid) FROM PUBLIC;GRANT EXECUTE ON FUNCTION public.expense_contract_bill_approve(uuid) TO authenticated;