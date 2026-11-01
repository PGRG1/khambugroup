CREATE OR REPLACE FUNCTION public.expense_actual_coverage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE first_day date;last_day date;month_day date;total_days int;days int;share numeric;used numeric;line record;d public.expense_accrual_drafts%ROWTYPE;j uuid;ln int:=0;original_date date;bill_j uuid;
BEGIN
IF NEW.approval_status<>'posted' OR OLD.approval_status='posted' OR NEW.journal_entry_id IS NULL THEN RETURN NEW;END IF;
first_day:=coalesce(NEW.service_period_start,NEW.period_start,NEW.bill_date);last_day:=coalesce(NEW.service_period_end,NEW.period_end,first_day);
IF last_day<first_day THEN RAISE EXCEPTION 'Covered period ends before it starts';END IF;
IF last_day-first_day>3660 THEN RAISE EXCEPTION 'Covered period is too long';END IF;
original_date:=NEW.bill_date;bill_j:=NEW.journal_entry_id;
-- The original approved bill is retained. Coverage is represented by new balanced adjustments.
IF date_trunc('month',first_day)<>date_trunc('month',original_date) OR date_trunc('month',last_day)<>date_trunc('month',original_date) THEN
PERFORM public.finance_assert_open(NEW.tenant_id,original_date);
INSERT INTO public.journal_entries(tenant_id,entry_date,memo,source_type,source_id,status,created_by) VALUES(NEW.tenant_id,original_date,'Bill coverage transfer · '||coalesce(NEW.vendor_name,''),'expense_coverage',NEW.id::text||':transfer','draft',auth.uid()) RETURNING id INTO j;
FOR line IN SELECT * FROM public.journal_lines WHERE entry_id=bill_j AND debit>0 LOOP
ln:=ln+1;INSERT INTO public.journal_lines(tenant_id,entry_id,account_id,debit,credit,venue,venue_id,line_no,memo) VALUES(NEW.tenant_id,j,line.account_id,0,line.debit,line.venue,line.venue_id,ln,'Transfer to covered months');
END LOOP;
SELECT id INTO d.account_id FROM public.chart_of_accounts WHERE tenant_id=NEW.tenant_id AND lower(name)='accrued expenses' AND is_active ORDER BY code LIMIT 1;
IF d.account_id IS NULL THEN RAISE EXCEPTION 'Accrued expenses account is missing';END IF;
ln:=ln+1;INSERT INTO public.journal_lines(tenant_id,entry_id,account_id,debit,credit,line_no,memo) SELECT NEW.tenant_id,j,d.account_id,sum(debit),0,ln,'Coverage transfer' FROM public.journal_lines WHERE entry_id=bill_j AND debit>0;
UPDATE public.journal_entries SET status='posted',posted_at=now() WHERE id=j;
total_days:=last_day-first_day+1;
month_day:=date_trunc('month',first_day)::date;
WHILE month_day<=last_day LOOP
PERFORM public.finance_assert_open(NEW.tenant_id,(month_day+interval '1 month - 1 day')::date);ln:=0;
INSERT INTO public.journal_entries(tenant_id,entry_date,memo,source_type,source_id,status,created_by) VALUES(NEW.tenant_id,(month_day+interval '1 month - 1 day')::date,'Bill covered month · '||coalesce(NEW.vendor_name,''),'expense_coverage',NEW.id::text||':'||month_day,'draft',auth.uid()) RETURNING id INTO j;
days:=least(last_day,(month_day+interval '1 month - 1 day')::date)-greatest(first_day,month_day)+1;
FOR line IN SELECT * FROM public.journal_lines WHERE entry_id=bill_j AND debit>0 LOOP
share:=CASE WHEN month_day=date_trunc('month',last_day)::date THEN line.debit-round(line.debit*(greatest(first_day,month_day)-first_day)::numeric/total_days,2) ELSE round(line.debit*days/total_days,2) END;ln:=ln+1;
INSERT INTO public.journal_lines(tenant_id,entry_id,account_id,debit,credit,venue,venue_id,line_no,memo) VALUES(NEW.tenant_id,j,line.account_id,share,0,line.venue,line.venue_id,ln,'Actual bill · covered days');
END LOOP;
ln:=ln+1;INSERT INTO public.journal_lines(tenant_id,entry_id,account_id,debit,credit,line_no,memo) SELECT NEW.tenant_id,j,d.account_id,0,sum(debit),ln,'Covered period' FROM public.journal_lines WHERE entry_id=j;
UPDATE public.journal_entries SET status='posted',posted_at=now() WHERE id=j;
month_day:=(month_day+interval '1 month')::date;END LOOP;
END IF;
-- Reverse prior estimates or contract expense accruals in the actual covered month, never mutate their journals.
FOR d IN SELECT * FROM public.expense_accrual_drafts a WHERE a.tenant_id=NEW.tenant_id AND a.status='posted' AND a.reversal_entry_id IS NULL AND a.month_start BETWEEN date_trunc('month',first_day)::date AND date_trunc('month',last_day)::date AND ((a.kind='estimate' AND a.supplier_id=NEW.supplier_id AND a.venue_id IS NOT DISTINCT FROM NEW.venue_id) OR (a.recurring_rule_id IS NOT NULL AND a.recurring_rule_id=NEW.recurring_rule_id)) FOR UPDATE LOOP
PERFORM public.finance_assert_open(NEW.tenant_id,(d.month_start+interval '1 month - 1 day')::date);
INSERT INTO public.journal_entries(tenant_id,entry_date,memo,source_type,source_id,status,created_by) VALUES(NEW.tenant_id,(d.month_start+interval '1 month - 1 day')::date,'Actual bill replaces '||d.kind,'expense_accrual_reversal',d.id::text,'draft',auth.uid()) RETURNING id INTO j;
INSERT INTO public.journal_lines(tenant_id,entry_id,account_id,debit,credit,venue,venue_id,line_no,memo) SELECT tenant_id,j,account_id,credit,debit,venue,venue_id,line_no,'Actual bill replaces estimate/contract' FROM public.journal_lines WHERE entry_id=d.journal_entry_id;
UPDATE public.journal_entries SET status='posted',posted_at=now() WHERE id=j;
UPDATE public.expense_accrual_drafts SET status='replaced',reversal_entry_id=j,actual_bill_id=NEW.id WHERE id=d.id;
END LOOP;
RETURN NEW;END $$;
CREATE TRIGGER expense_actual_coverage_after_post AFTER UPDATE OF approval_status ON public.expense_bills FOR EACH ROW EXECUTE FUNCTION public.expense_actual_coverage();
CREATE OR REPLACE FUNCTION public.expense_correction_approve(p_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.expense_correction_proposals%ROWTYPE;e public.journal_entries%ROWTYPE;l record;j uuid;d date;balance numeric;BEGIN
SELECT * INTO p FROM public.expense_correction_proposals WHERE id=p_id FOR UPDATE;
IF NOT FOUND OR NOT public.people_owner(p.tenant_id,auth.uid()) THEN RAISE EXCEPTION 'Owner approval required';END IF;
IF p.status='approved' THEN RETURN p.adjustment_entry_id;END IF;
IF p.status<>'draft' OR p.payload->'adjustment_lines' IS NULL THEN RAISE EXCEPTION 'Evidence and proposed adjustment lines are required before approval';END IF;
SELECT * INTO e FROM public.journal_entries WHERE id=p.original_entry_id AND tenant_id=p.tenant_id;
IF e.status<>'posted' OR e.source_type LIKE 'payroll%' OR e.source_type='mpf_payment' THEN RAISE EXCEPTION 'Original journal unavailable or protected';END IF;
IF p.payload->'entry' IS DISTINCT FROM to_jsonb(e) THEN RAISE EXCEPTION 'Original changed; refresh owner proposal';END IF;
IF p.payload->'lines' IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM public.journal_lines x WHERE x.entry_id=e.id) THEN RAISE EXCEPTION 'Original lines changed; refresh owner proposal';END IF;
d:=(now() AT TIME ZONE 'Asia/Hong_Kong')::date;PERFORM public.finance_assert_open(p.tenant_id,d);
SELECT sum(coalesce((x->>'debit')::numeric,0)-coalesce((x->>'credit')::numeric,0)) INTO balance FROM jsonb_array_elements(p.payload->'adjustment_lines') x;
IF round(balance,2)<>0 OR jsonb_array_length(p.payload->'adjustment_lines')<2 THEN RAISE EXCEPTION 'Proposed adjustment must balance';END IF;
INSERT INTO public.journal_entries(tenant_id,entry_date,memo,source_type,source_id,status,created_by,manually_adjusted) VALUES(p.tenant_id,d,p.title||' · '||p.reason,'adjustment','expense_proposal:'||p.id,'draft',auth.uid(),true) RETURNING id INTO j;
FOR l IN SELECT x,ord FROM jsonb_array_elements(p.payload->'adjustment_lines') WITH ORDINALITY z(x,ord) LOOP
IF NOT EXISTS(SELECT 1 FROM public.chart_of_accounts WHERE id=(l.x->>'account_id')::uuid AND tenant_id=p.tenant_id AND is_active) THEN RAISE EXCEPTION 'Proposed account unavailable';END IF;
INSERT INTO public.journal_lines(tenant_id,entry_id,account_id,debit,credit,venue,line_no,memo) VALUES(p.tenant_id,j,(l.x->>'account_id')::uuid,coalesce((l.x->>'debit')::numeric,0),coalesce((l.x->>'credit')::numeric,0),l.x->>'venue',l.ord,p.reason);END LOOP;
UPDATE public.journal_entries SET status='posted',posted_at=now() WHERE id=j;
UPDATE public.expense_correction_proposals SET status='approved',approved_by=auth.uid(),approved_at=now(),adjustment_entry_id=j WHERE id=p.id;RETURN j;END $$;
REVOKE ALL ON FUNCTION public.expense_correction_approve(uuid) FROM PUBLIC;GRANT EXECUTE ON FUNCTION public.expense_correction_approve(uuid) TO authenticated;