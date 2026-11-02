CREATE OR REPLACE FUNCTION public.finance_fx_revaluation_preview(t uuid, m date)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE ending date:=(date_trunc('month',m)+interval '1 month -1 day')::date;b text;x record;r record;original numeric;carrying numeric;bal numeric;has_ledger boolean;rows jsonb:='[]';acct uuid;BEGIN
IF NOT user_has_tenant(auth.uid(),t) THEN RAISE EXCEPTION 'Tenant access required';END IF;SELECT coalesce(base_currency,'HKD') INTO b FROM tenants WHERE id=t;
-- foreign bank pockets: statement balance in pocket currency vs book (GL) value
FOR x IN SELECT a.* FROM bank_accounts a WHERE tenant_id=t AND is_active AND currency<>b AND opening_date<=ending ORDER BY id LOOP
SELECT x.opening_balance+coalesce(sum(money_in-money_out),0) INTO original FROM bank_transactions WHERE tenant_id=t AND bank_account_id=x.id AND txn_date<=ending;
SELECT coalesce(sum(l.debit-l.credit),0),count(*)>0 INTO carrying,has_ledger FROM journal_lines l JOIN journal_entries e ON e.id=l.entry_id WHERE l.tenant_id=t AND e.tenant_id=t AND e.status='posted' AND e.entry_date<=ending AND l.account_id=x.linked_gl_account_id;
SELECT * INTO r FROM fx_rate(t,ending,x.currency);bal:=CASE WHEN r.rate IS NOT NULL THEN round(original*r.rate,2) ELSE NULL END;
rows:=rows||jsonb_build_array(jsonb_build_object('source','bank','id',x.id,'label',x.account_name,'currency',x.currency,'original',original,'carrying',CASE WHEN has_ledger THEN carrying ELSE NULL END,'was_rate',CASE WHEN original<>0 AND has_ledger THEN carrying/original ELSE NULL END,'rate',r.rate,'rate_date',r.rate_date,'nearest',r.nearest,'base_now',bal,'movement',CASE WHEN has_ledger THEN bal-carrying ELSE NULL END,'loss',CASE WHEN has_ledger THEN carrying-bal ELSE NULL END,'account_id',x.linked_gl_account_id,'liability',false,'blocked',CASE WHEN x.linked_gl_account_id IS NULL THEN 'Bank account not linked to books' WHEN NOT has_ledger THEN 'Opening balance not recorded in books' WHEN r.rate IS NULL THEN 'Month-end rate missing' ELSE NULL END));END LOOP;
SELECT account_id INTO acct FROM account_mapping_rules WHERE tenant_id=t AND rule_type='accounts_payable' LIMIT 1;IF acct IS NULL THEN SELECT id INTO acct FROM chart_of_accounts WHERE tenant_id=t AND code='2000' AND is_active;END IF;
-- open foreign bills / supplier invoices: still owed in document currency (original_balance), book value = base total minus base already cleared (fx_settle)
FOR x IN SELECT 'bill'::text src,id,coalesce(vendor_name,bill_number,'Bill') label,currency,fx_rate,coalesce(original_balance,original_total) owed,total_amount-coalesce(fx_base_cleared,0) book,bill_date d FROM expense_bills WHERE tenant_id=t AND approval_status='posted' AND bill_date<=ending AND currency<>b AND original_total IS NOT NULL
UNION ALL SELECT 'invoice',id,invoice_number,currency,fx_rate,coalesce(original_balance,original_total),total_amount-coalesce(fx_base_cleared,0),invoice_date FROM invoices WHERE tenant_id=t AND invoice_date<=ending AND currency<>b AND original_total IS NOT NULL AND EXISTS(SELECT 1 FROM journal_entries je WHERE je.tenant_id=t AND je.source_type='invoice' AND je.source_id=invoices.id::text AND je.status='posted' AND je.entry_date<=ending)
UNION ALL SELECT 'credit_note',id,coalesce(credit_note_number,'Credit note'),currency,fx_rate,-coalesce(original_remaining,original_currency_amount),-(original_amount-coalesce(fx_base_cleared,0)),credit_note_date FROM credit_notes WHERE tenant_id=t AND credit_note_date<=ending AND currency<>b AND original_currency_amount IS NOT NULL AND journal_entry_id IS NOT NULL
ORDER BY id LOOP
IF coalesce(x.owed,0)=0 THEN CONTINUE;END IF;original:=x.owed;carrying:=x.book;SELECT * INTO r FROM fx_rate(t,ending,x.currency);bal:=CASE WHEN r.rate IS NOT NULL THEN round(original*r.rate,2) ELSE NULL END;
rows:=rows||jsonb_build_array(jsonb_build_object('source',x.src,'id',x.id,'label',x.label,'currency',x.currency,'original',original,'carrying',carrying,'was_rate',x.fx_rate,'rate',r.rate,'rate_date',r.rate_date,'nearest',r.nearest,'base_now',bal,'movement',bal-carrying,'loss',bal-carrying,'account_id',acct,'liability',true,'blocked',CASE WHEN acct IS NULL THEN 'Accounts payable not mapped' WHEN r.rate IS NULL OR x.fx_rate IS NULL THEN 'Rate missing' ELSE NULL END));END LOOP;
-- supplier container deposits (deposit_opening_balances) are item deposits settled in kind; not revalued.
RETURN jsonb_build_object('date',ending,'base',b,'rows',rows);END $function$;

CREATE OR REPLACE FUNCTION public.finance_fx_draft_check(t uuid, q finance_entry_drafts)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE cv jsonb; s jsonb; BEGIN
 IF q.kind='fx_revaluation' THEN s:=finance_fx_revaluation_preview(t,q.entry_date);
  IF md5(s::text) IS DISTINCT FROM q.source_data->>'fingerprint' THEN RAISE EXCEPTION 'Foreign balances or rates changed since this revaluation was prepared; prepare it again';END IF;END IF;
 IF q.kind IN('bank_opening','bank_opening_correction') THEN cv:=finance_bank_opening_value(t,(q.source_data->>'bank_account')::uuid);
  IF cv IS NULL OR cv->>'base' IS DISTINCT FROM q.source_data->>'base' OR cv->>'date' IS DISTINCT FROM q.source_data->>'date' OR cv->>'gl' IS DISTINCT FROM q.source_data->>'gl' THEN RAISE EXCEPTION 'Bank opening balance changed; edit the account again to prepare a fresh draft';END IF;END IF;
END $function$;

DO $do$ DECLARE s text:=pg_get_functiondef('public.finance_fx_draft_finish(uuid,finance_entry_drafts,uuid)'::regprocedure); BEGIN
 IF position($p$'adjustment',q.id,'draft'$p$ in s)=0 THEN RAISE EXCEPTION 'reversal source patch missing'; END IF;
 s:=replace(s,$p$'adjustment',q.id,'draft'$p$,$p$'adjustment',q.id::text||':reversal','draft'$p$);
 EXECUTE s; END $do$;

DROP FUNCTION IF EXISTS public.finance_fx_verify_qa();