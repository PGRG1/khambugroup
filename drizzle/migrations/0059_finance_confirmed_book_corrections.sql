CREATE TABLE public.finance_book_corrections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id), original_entry_id uuid NOT NULL REFERENCES public.journal_entries(id), kind text NOT NULL CHECK(kind IN ('date','account','reverse')), line_id uuid REFERENCES public.journal_lines(id), reversal_entry_id uuid REFERENCES public.journal_entries(id), replacement_entry_id uuid REFERENCES public.journal_entries(id), corrected_date date, account_id uuid REFERENCES public.chart_of_accounts(id), reason text NOT NULL, actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.finance_book_corrections TO authenticated; GRANT ALL ON public.finance_book_corrections TO service_role;
ALTER TABLE public.finance_book_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY finance_corrections_read ON public.finance_book_corrections FOR SELECT TO authenticated USING(public.user_has_tenant(auth.uid(),tenant_id) AND (public.has_role(auth.uid(),'admin') OR public.is_tenant_admin(tenant_id,auth.uid())));
CREATE UNIQUE INDEX finance_correction_line_once ON public.finance_book_corrections(line_id) WHERE kind='account';
CREATE UNIQUE INDEX finance_correction_entry_once ON public.finance_book_corrections(original_entry_id) WHERE kind IN ('date','reverse');
CREATE FUNCTION public.finance_correct_book(p_entry uuid,p_kind text,p_reason text,p_date date DEFAULT NULL,p_line uuid DEFAULT NULL,p_account uuid DEFAULT NULL,p_expected jsonb DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j public.journal_entries%ROWTYPE;l public.journal_lines%ROWTYPE;r uuid;n uuid;old_id uuid;line_count int;row_l public.journal_lines%ROWTYPE;
BEGIN
SELECT * INTO j FROM public.journal_entries WHERE id=p_entry;
IF NOT FOUND OR NOT public.user_has_tenant(auth.uid(),j.tenant_id) OR NOT(public.has_role(auth.uid(),'admin') OR public.is_tenant_admin(j.tenant_id,auth.uid())) OR (j.venue_id IS NOT NULL AND NOT public.user_has_venue(auth.uid(),j.venue_id)) THEN RAISE EXCEPTION 'Finance access required'; END IF;
PERFORM public.finance_assert_open(j.tenant_id,j.entry_date);
SELECT * INTO j FROM public.journal_entries WHERE id=p_entry FOR UPDATE;
IF j.status<>'posted' OR j.source_type LIKE 'payroll%' OR j.source_type IN ('mpf_payment','adjustment') THEN RAISE EXCEPTION 'This entry must be reviewed in its original workflow'; END IF;
IF p_kind NOT IN ('date','account','reverse') OR nullif(btrim(p_reason),'') IS NULL OR length(p_reason)>2000 THEN RAISE EXCEPTION 'Choose a correction and give its reason'; END IF;
IF EXISTS(SELECT 1 FROM public.finance_book_corrections WHERE original_entry_id=j.id AND kind IN ('date','reverse')) THEN RAISE EXCEPTION 'Entry already reversed or corrected; refresh'; END IF;
PERFORM 1 FROM public.journal_lines WHERE entry_id=j.id FOR UPDATE;
IF p_expected IS NULL OR p_expected IS DISTINCT FROM jsonb_build_object('date',j.entry_date,'lines',(SELECT jsonb_agg(jsonb_build_object('id',id,'account_id',account_id,'debit',debit,'credit',credit,'mapping_status',mapping_status) ORDER BY id) FROM public.journal_lines WHERE entry_id=j.id)) THEN RAISE EXCEPTION 'Entry changed; refresh the review'; END IF;
IF p_kind='account' THEN
SELECT * INTO l FROM public.journal_lines WHERE id=p_line AND entry_id=j.id AND tenant_id=j.tenant_id;
IF NOT FOUND OR l.mapping_status IS DISTINCT FROM 'missing' OR EXISTS(SELECT 1 FROM public.finance_book_corrections WHERE line_id=l.id AND kind='account') THEN RAISE EXCEPTION 'Line is not an unresolved missing account'; END IF;
IF l.account_id IS NULL THEN RAISE EXCEPTION 'Original line has no balancing account; accountant review required'; END IF;
IF p_account IS NULL OR p_account=l.account_id OR NOT EXISTS(SELECT 1 FROM public.chart_of_accounts WHERE id=p_account AND tenant_id=j.tenant_id AND is_active AND name NOT ILIKE '%suspense%') THEN RAISE EXCEPTION 'Pick a different active account, not suspense'; END IF;
IF l.debit+l.credit=0 THEN RAISE EXCEPTION 'Zero line requires no reclassification'; END IF;
INSERT INTO public.journal_entries(tenant_id,entry_date,memo,source_type,source_id,venue,venue_id,status,created_by,manually_adjusted) VALUES(j.tenant_id,j.entry_date,'Account correction · '||p_reason,'adjustment','book_account:'||l.id,j.venue,j.venue_id,'draft',auth.uid(),true) RETURNING id INTO n;
INSERT INTO public.journal_lines(tenant_id,entry_id,account_id,debit,credit,venue,venue_id,line_no,memo,mapping_status) VALUES(j.tenant_id,n,l.account_id,l.credit,l.debit,l.venue,l.venue_id,1,'Reverse placement: '||coalesce(l.memo,''),'corrected'),(j.tenant_id,n,p_account,l.debit,l.credit,l.venue,l.venue_id,2,p_reason,'mapped');
UPDATE public.journal_entries SET status='posted',posted_at=now() WHERE id=n;
INSERT INTO public.finance_book_corrections(tenant_id,original_entry_id,kind,line_id,replacement_entry_id,account_id,reason,actor_id) VALUES(j.tenant_id,j.id,'account',l.id,n,p_account,p_reason,auth.uid());
ELSE
IF EXISTS(SELECT 1 FROM public.finance_book_corrections WHERE original_entry_id=j.id AND kind='account') THEN RAISE EXCEPTION 'Entry has account corrections; accountant review required before reversal'; END IF;
IF p_kind='date' AND (p_date IS NULL OR p_date=j.entry_date OR p_date>(now() AT TIME ZONE 'Asia/Hong_Kong')::date+60 OR p_date<(SELECT min(date)::date FROM public.sales_records WHERE tenant_id=j.tenant_id)) THEN RAISE EXCEPTION 'Choose a corrected date within the business range'; END IF;
IF p_kind='date' THEN PERFORM public.finance_assert_open(j.tenant_id,p_date); END IF;
IF EXISTS(SELECT 1 FROM public.journal_lines WHERE entry_id=j.id AND account_id IS NULL) OR (SELECT round(sum(debit-credit),2) FROM public.journal_lines WHERE entry_id=j.id)<>0 THEN RAISE EXCEPTION 'Original entry is incomplete or unbalanced'; END IF;
INSERT INTO public.journal_entries(tenant_id,entry_date,memo,source_type,source_id,venue,venue_id,status,created_by,manually_adjusted) VALUES(j.tenant_id,j.entry_date,'Reversal · '||j.memo||' · '||p_reason,'adjustment','book_reverse:'||j.id,j.venue,j.venue_id,'draft',auth.uid(),true) RETURNING id INTO r;
INSERT INTO public.journal_lines(tenant_id,entry_id,account_id,debit,credit,venue,venue_id,legacy_venue_name,line_no,memo,category_l1,payment_method,source_amount,mapping_rule_type,mapping_match_key,mapping_status) SELECT tenant_id,r,account_id,credit,debit,venue,venue_id,legacy_venue_name,line_no,'Reversal: '||coalesce(memo,''),category_l1,payment_method,-source_amount,mapping_rule_type,mapping_match_key,'reversed' FROM public.journal_lines WHERE entry_id=j.id;
UPDATE public.journal_entries SET status='posted',posted_at=now() WHERE id=r;
IF p_kind='date' THEN
INSERT INTO public.journal_entries(tenant_id,entry_date,memo,source_type,source_id,venue,venue_id,status,created_by,manually_adjusted) VALUES(j.tenant_id,p_date,'Corrected date · '||j.memo,'adjustment','book_date:'||j.id,j.venue,j.venue_id,'draft',auth.uid(),true) RETURNING id INTO n;
INSERT INTO public.journal_lines(tenant_id,entry_id,account_id,debit,credit,venue,venue_id,legacy_venue_name,line_no,memo,category_l1,payment_method,source_amount,mapping_rule_type,mapping_match_key,mapping_status) SELECT tenant_id,n,account_id,debit,credit,venue,venue_id,legacy_venue_name,line_no,memo,category_l1,payment_method,source_amount,mapping_rule_type,mapping_match_key,mapping_status FROM public.journal_lines WHERE entry_id=j.id;
UPDATE public.journal_entries SET status='posted',posted_at=now() WHERE id=n;
END IF;
INSERT INTO public.finance_book_corrections(tenant_id,original_entry_id,kind,reversal_entry_id,replacement_entry_id,corrected_date,reason,actor_id) VALUES(j.tenant_id,j.id,p_kind,r,n,p_date,p_reason,auth.uid());
END IF;
INSERT INTO public.ledger_audit_log(tenant_id,event_type,user_id,journal_entry_id,status,notes) VALUES(j.tenant_id,'book_'||p_kind||'_confirmed',auth.uid(),coalesce(n,r),'success',p_reason||' · original '||j.id);
INSERT INTO public.audit_log(tenant_id,user_id,action,entity_type,entity_id,details) VALUES(j.tenant_id,auth.uid(),'book_'||p_kind||'_confirmed','journal_entries',j.id::text,jsonb_build_object('reversal',r,'replacement',n,'line',p_line,'account',p_account,'date',p_date,'reason',p_reason));
RETURN coalesce(n,r); END $$;
REVOKE ALL ON FUNCTION public.finance_correct_book(uuid,text,text,date,uuid,uuid,jsonb) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.finance_correct_book(uuid,text,text,date,uuid,uuid,jsonb) TO authenticated;
CREATE FUNCTION public.finance_apply_account_review(p_tenant uuid,p_kind text,p_code text,p_name text,p_reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE a uuid; BEGIN
IF NOT public.user_has_tenant(auth.uid(),p_tenant) OR NOT public.people_owner(p_tenant,auth.uid()) THEN RAISE EXCEPTION 'Only the owner may apply account review changes'; END IF;
PERFORM pg_advisory_xact_lock(hashtextextended('finance-account-review:'||p_tenant::text,0));
IF p_kind NOT IN ('payables','staff','cash') OR nullif(btrim(p_reason),'') IS NULL OR nullif(btrim(p_name),'') IS NULL OR nullif(btrim(p_code),'') IS NULL THEN RAISE EXCEPTION 'Code, name and confirmed reason required'; END IF;
IF EXISTS(SELECT 1 FROM public.chart_of_accounts WHERE tenant_id=p_tenant AND code=p_code) THEN RAISE EXCEPTION 'Account code already exists; choose an unused code'; END IF;
INSERT INTO public.chart_of_accounts(tenant_id,code,name,account_type,normal_side,is_cash,description) VALUES(p_tenant,p_code,CASE WHEN p_kind='staff' THEN 'Staff Reimbursements Payable' ELSE p_name END,CASE WHEN p_kind='cash' THEN 'asset' ELSE 'liability' END,CASE WHEN p_kind='cash' THEN 'debit' ELSE 'credit' END,p_kind='cash',p_reason) RETURNING id INTO a;
INSERT INTO public.audit_log(tenant_id,user_id,action,entity_type,entity_id,details) VALUES(p_tenant,auth.uid(),'account_review_applied','chart_of_accounts',a::text,jsonb_build_object('kind',p_kind,'reason',p_reason,'existing_accounts_unchanged',true)); RETURN a; END $$;
REVOKE ALL ON FUNCTION public.finance_apply_account_review(uuid,text,text,text,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.finance_apply_account_review(uuid,text,text,text,text) TO authenticated;