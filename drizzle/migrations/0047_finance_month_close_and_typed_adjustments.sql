CREATE TABLE public.finance_closed_periods (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id), month_start date NOT NULL CHECK (extract(day from month_start)=1), closed_at timestamptz NOT NULL DEFAULT now(), closed_by uuid NOT NULL, reopened_at timestamptz, reopened_by uuid, reopen_reason text, UNIQUE(tenant_id,month_start));
GRANT SELECT ON public.finance_closed_periods TO authenticated;
GRANT ALL ON public.finance_closed_periods TO service_role;
ALTER TABLE public.finance_closed_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_period_read ON public.finance_closed_periods FOR SELECT TO authenticated USING (public.user_has_tenant(auth.uid(),tenant_id));
CREATE TABLE public.finance_typed_adjustment_links (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id), manual_line_id uuid NOT NULL REFERENCES public.pl_manual_lines(id), journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id), original_amount numeric NOT NULL, original_name text NOT NULL, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(manual_line_id));
GRANT SELECT ON public.finance_typed_adjustment_links TO authenticated;
GRANT ALL ON public.finance_typed_adjustment_links TO service_role;
ALTER TABLE public.finance_typed_adjustment_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_typed_read ON public.finance_typed_adjustment_links FOR SELECT TO authenticated USING (public.user_has_tenant(auth.uid(),tenant_id));
CREATE FUNCTION public.finance_month_checks(p_tenant_id uuid,p_month date) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE m date:=date_trunc('month',p_month)::date; e date:=(date_trunc('month',p_month)+interval '1 month')::date; sales_n int; invoices_n int; payroll_ok boolean; bank_n int; unmatched_n int; missing_rules int; waiting_rules int; unposted_n int; mapping_n int; missing text[]:=ARRAY[]::text[];
BEGIN
IF NOT public.user_has_tenant(auth.uid(),p_tenant_id) THEN RAISE EXCEPTION 'Finance access required'; END IF;
SELECT count(*) INTO sales_n FROM (SELECT DISTINCT date,coalesce(venue_id::text,venue) FROM public.sales_records WHERE tenant_id=p_tenant_id AND date>=m AND date<e) s;
SELECT count(*) INTO invoices_n FROM public.invoices WHERE tenant_id=p_tenant_id AND invoice_date>=m AND invoice_date<e AND review_status<>'Voided';
SELECT EXISTS(SELECT 1 FROM public.hr_payroll p JOIN public.journal_entries j ON j.id=p.accrual_journal_entry_id WHERE p.tenant_id=p_tenant_id AND p.year=extract(year from m) AND p.month=extract(month from m) AND j.tenant_id=p_tenant_id AND j.status='posted' AND j.source_type='payroll_accrual') INTO payroll_ok;
SELECT count(*),count(*) FILTER(WHERE status='unmatched') INTO bank_n,unmatched_n FROM public.bank_transactions WHERE tenant_id=p_tenant_id AND txn_date>=m AND txn_date<e;
SELECT count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM public.expense_bills b WHERE b.tenant_id=p_tenant_id AND b.recurring_rule_id=r.id AND coalesce(b.period_start,b.bill_date)>=m AND coalesce(b.period_start,b.bill_date)<e AND b.approval_status NOT IN ('reversed','voided'))),count(*) FILTER(WHERE EXISTS(SELECT 1 FROM public.expense_bills b WHERE b.tenant_id=p_tenant_id AND b.recurring_rule_id=r.id AND coalesce(b.period_start,b.bill_date)>=m AND coalesce(b.period_start,b.bill_date)<e AND b.approval_status NOT IN ('reversed','voided')) AND NOT EXISTS(SELECT 1 FROM public.expense_bills b JOIN public.journal_entries j ON j.id=b.journal_entry_id AND j.status='posted' WHERE b.tenant_id=p_tenant_id AND b.recurring_rule_id=r.id AND coalesce(b.period_start,b.bill_date)>=m AND coalesce(b.period_start,b.bill_date)<e)) INTO missing_rules,waiting_rules FROM public.expense_recurring_rules r WHERE r.tenant_id=p_tenant_id AND r.active AND r.status='active' AND coalesce(r.effective_from,r.created_at::date)<e AND (r.cadence='monthly' OR r.cadence='weekly' OR (r.cadence='quarterly' AND mod(extract(month from age(m,date_trunc('month',coalesce(r.effective_from,r.created_at::date)))),3)=0) OR (r.cadence='yearly' AND extract(month from coalesce(r.effective_from,r.created_at::date))=extract(month from m)));
SELECT (SELECT count(*) FROM public.invoices i WHERE i.tenant_id=p_tenant_id AND i.invoice_date>=m AND i.invoice_date<e AND i.review_status='Approved' AND NOT EXISTS(SELECT 1 FROM public.journal_entries j WHERE j.tenant_id=p_tenant_id AND j.source_id=i.id AND j.source_type='invoice' AND j.status='posted'))+(SELECT count(*) FROM public.expense_bills b WHERE b.tenant_id=p_tenant_id AND b.bill_date>=m AND b.bill_date<e AND b.approval_status='approved' AND NOT EXISTS(SELECT 1 FROM public.journal_entries j WHERE j.id=b.journal_entry_id AND j.status='posted')) INTO unposted_n;
SELECT count(*) INTO mapping_n FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.entry_id WHERE l.tenant_id=p_tenant_id AND j.entry_date>=m AND j.entry_date<e AND j.status<>'void' AND (l.mapping_status='missing' OR l.account_id IS NULL);
IF sales_n=0 THEN missing:=array_append(missing,'sales'); END IF;
IF NOT payroll_ok THEN missing:=array_append(missing,'no payroll'); END IF;
IF missing_rules>0 THEN missing:=array_append(missing,'rent & bills missing'); END IF;
IF waiting_rules>0 THEN missing:=array_append(missing,'rent & bills waiting'); END IF;
IF bank_n=0 THEN missing:=array_append(missing,'bank not loaded'); ELSIF unmatched_n>0 THEN missing:=array_append(missing,'bank not matched'); END IF;
IF unposted_n>0 THEN missing:=array_append(missing,'approved items not posted'); END IF;
IF mapping_n>0 THEN missing:=array_append(missing,'accounts missing'); END IF;
RETURN jsonb_build_object('month',to_char(m,'YYYY-MM'),'sales_days',sales_n,'invoices',invoices_n,'payroll',payroll_ok,'rent',CASE WHEN missing_rules>0 THEN 'missing' WHEN waiting_rules>0 THEN 'waiting' ELSE 'complete' END,'bank_lines',bank_n,'bank_unmatched',unmatched_n,'missing',to_jsonb(missing),'complete',cardinality(missing)=0);
END $$;
REVOKE ALL ON FUNCTION public.finance_month_checks(uuid,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finance_month_checks(uuid,date) TO authenticated;
CREATE FUNCTION public.finance_set_month_closed(p_tenant_id uuid,p_month date,p_close boolean,p_reason text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m date:=date_trunc('month',p_month)::date; checks jsonb;
BEGIN
IF NOT public.user_has_tenant(auth.uid(),p_tenant_id) OR NOT (public.is_tenant_admin(p_tenant_id,auth.uid()) OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Finance administrator required'; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended('finance-period:'||p_tenant_id::text,0));
IF p_close THEN
IF m>=date_trunc('month',now() AT TIME ZONE 'Asia/Hong_Kong')::date THEN RAISE EXCEPTION 'Current and future months remain in progress'; END IF;
checks:=public.finance_month_checks(p_tenant_id,m);
IF NOT (checks->>'complete')::boolean THEN RAISE EXCEPTION 'Month is incomplete: %',checks->'missing'; END IF;
INSERT INTO public.finance_closed_periods(tenant_id,month_start,closed_by) VALUES(p_tenant_id,m,auth.uid()) ON CONFLICT(tenant_id,month_start) DO UPDATE SET closed_at=now(),closed_by=auth.uid(),reopened_at=NULL,reopened_by=NULL,reopen_reason=NULL;
ELSE
IF NOT public.people_owner(p_tenant_id,auth.uid()) THEN RAISE EXCEPTION 'Only the owner may reopen a month'; END IF;
IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Reopen reason required'; END IF;
UPDATE public.finance_closed_periods SET reopened_at=now(),reopened_by=auth.uid(),reopen_reason=p_reason WHERE tenant_id=p_tenant_id AND month_start=m AND reopened_at IS NULL;
END IF;
INSERT INTO public.audit_log(tenant_id,user_id,action,entity_type,details) VALUES(p_tenant_id,auth.uid(),CASE WHEN p_close THEN 'finance_month_closed' ELSE 'finance_month_reopened' END,'finance_closed_periods',jsonb_build_object('month',m,'reason',p_reason));
END $$;
REVOKE ALL ON FUNCTION public.finance_set_month_closed(uuid,date,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finance_set_month_closed(uuid,date,boolean,text) TO authenticated;
CREATE FUNCTION public.finance_assert_open(t uuid,d date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
PERFORM pg_advisory_xact_lock(hashtextextended('finance-period:'||t::text,0));
IF EXISTS(SELECT 1 FROM public.finance_closed_periods WHERE tenant_id=t AND reopened_at IS NULL AND month_start=date_trunc('month',d)::date) THEN RAISE EXCEPTION 'Accounting month is closed; the owner must explicitly reopen it'; END IF; END $$;
REVOKE ALL ON FUNCTION public.finance_assert_open(uuid,date) FROM PUBLIC;
CREATE FUNCTION public.finance_journal_period_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF TG_OP<>'INSERT' AND OLD.status='posted' THEN PERFORM public.finance_assert_open(OLD.tenant_id,OLD.entry_date); END IF;
IF TG_OP<>'DELETE' AND NEW.status='posted' THEN PERFORM public.finance_assert_open(NEW.tenant_id,NEW.entry_date); END IF;
IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;
CREATE TRIGGER zz_finance_period_guard BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.finance_journal_period_guard();
CREATE FUNCTION public.finance_line_period_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE j record; BEGIN
FOR j IN SELECT * FROM public.journal_entries WHERE id IN (CASE WHEN TG_OP<>'INSERT' THEN OLD.entry_id END, CASE WHEN TG_OP<>'DELETE' THEN NEW.entry_id END) AND status='posted' LOOP PERFORM public.finance_assert_open(j.tenant_id,j.entry_date); END LOOP;
IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;
CREATE TRIGGER finance_period_line_guard BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION public.finance_line_period_guard();
CREATE FUNCTION public.finance_convert_typed_month(p_tenant_id uuid,p_month date,p_lines jsonb,p_counter_account uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE m date:=date_trunc('month',p_month)::date; e uuid; x jsonb; l record; a record; n int:=0; net numeric:=0; debit_n numeric; credit_n numeric; BEGIN
IF NOT public.user_has_tenant(auth.uid(),p_tenant_id) OR NOT (public.is_tenant_admin(p_tenant_id,auth.uid()) OR public.has_role(auth.uid(),'admin')) THEN RAISE EXCEPTION 'Finance administrator required'; END IF;
PERFORM public.finance_assert_open(p_tenant_id,m);
IF jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)=0 OR jsonb_array_length(p_lines)>500 THEN RAISE EXCEPTION 'Select typed lines'; END IF;
IF NOT EXISTS(SELECT 1 FROM public.chart_of_accounts WHERE id=p_counter_account AND tenant_id=p_tenant_id AND account_type IN ('asset','liability','equity')) THEN RAISE EXCEPTION 'Choose a balance-sheet counterpart account'; END IF;
INSERT INTO public.journal_entries(tenant_id,entry_date,memo,source_type,status,created_by) VALUES(p_tenant_id,(m+interval '1 month -1 day')::date,'Management P&L adjustments (typed) · '||to_char(m,'YYYY-MM'),'manual','draft',auth.uid()) RETURNING id INTO e;
FOR x IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
SELECT * INTO l FROM public.pl_manual_lines WHERE id=(x->>'id')::uuid AND tenant_id=p_tenant_id AND year=extract(year from m) AND month=extract(month from m) FOR UPDATE;
IF NOT FOUND OR l.amount<>(x->>'amount')::numeric OR l.line_item_name<>(x->>'name') OR EXISTS(SELECT 1 FROM public.finance_typed_adjustment_links WHERE manual_line_id=l.id) THEN RAISE EXCEPTION 'Typed lines changed or already converted; refresh'; END IF;
SELECT * INTO a FROM public.chart_of_accounts WHERE id=(x->>'account_id')::uuid AND tenant_id=p_tenant_id AND account_type IN ('revenue','other_income','cogs','opex','other_expense');
IF NOT FOUND THEN RAISE EXCEPTION 'Pick a P&L account for each line'; END IF;
IF l.amount=0 THEN CONTINUE; END IF;
n:=n+1;
debit_n:=greatest(-l.amount,0); credit_n:=greatest(l.amount,0); net:=net+debit_n-credit_n;
INSERT INTO public.journal_lines(tenant_id,entry_id,account_id,debit,credit,line_no,memo) VALUES(p_tenant_id,e,a.id,debit_n,credit_n,n,l.line_item_name);
INSERT INTO public.finance_typed_adjustment_links(tenant_id,manual_line_id,journal_entry_id,original_amount,original_name,created_by) VALUES(p_tenant_id,l.id,e,l.amount,l.line_item_name,auth.uid());
END LOOP;
IF n=0 THEN RAISE EXCEPTION 'No nonzero lines selected'; END IF;
IF net<>0 THEN INSERT INTO public.journal_lines(tenant_id,entry_id,account_id,debit,credit,line_no,memo) VALUES(p_tenant_id,e,p_counter_account,greatest(-net,0),greatest(net,0),n+1,'Confirmed counterpart for typed adjustments'); END IF;
IF (SELECT count(*) FROM public.journal_lines WHERE entry_id=e)<2 THEN RAISE EXCEPTION 'Journal needs at least two lines'; END IF;
UPDATE public.journal_entries SET status='posted',posted_at=now() WHERE id=e;
INSERT INTO public.audit_log(tenant_id,user_id,action,entity_type,entity_id,details) VALUES(p_tenant_id,auth.uid(),'finance_typed_converted','journal_entries',e,jsonb_build_object('month',m,'lines',n));
RETURN e; END $$;
REVOKE ALL ON FUNCTION public.finance_convert_typed_month(uuid,date,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finance_convert_typed_month(uuid,date,jsonb,uuid) TO authenticated;