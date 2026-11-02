CREATE OR REPLACE FUNCTION public.validate_allocation_vs_payment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE pay_amount numeric; total_alloc numeric;
BEGIN
  SELECT amount INTO pay_amount FROM public.payments WHERE id = NEW.payment_id;
  SELECT COALESCE(SUM(CASE WHEN original_allocated IS NOT NULL THEN coalesce(cash_base_allocated,amount_allocated) ELSE amount_allocated END),0) INTO total_alloc FROM public.payment_allocations WHERE payment_id = NEW.payment_id AND id <> NEW.id;
  IF (total_alloc + (CASE WHEN NEW.original_allocated IS NOT NULL THEN coalesce(NEW.cash_base_allocated,NEW.amount_allocated) ELSE NEW.amount_allocated END)) > pay_amount + 0.01 THEN
    RAISE EXCEPTION 'Total cash allocations (%) exceed payment amount (%)', total_alloc + NEW.amount_allocated, pay_amount;
  END IF;
  RETURN NEW;
END $function$;

DO $do$ DECLARE s text:=pg_get_functiondef('public.post_invoice_payment(uuid)'::regprocedure); BEGIN
 IF position($pa$public.fx_realised_account(v_tenant)$pa$ in s)=0 THEN RAISE EXCEPTION 'patch post_invoice_payment 0 missing'; END IF; s:=replace(s,$pa$public.fx_realised_account(v_tenant)$pa$,$qa$public.fx_difference_account(v_tenant)$qa$);
 IF position($pb$v_ln, 'Realised FX', v_tenant$pb$ in s)=0 THEN RAISE EXCEPTION 'patch post_invoice_payment 1 missing'; END IF; s:=replace(s,$pb$v_ln, 'Realised FX', v_tenant$pb$,$qb$v_ln, CASE WHEN public.fx_difference_account(v_tenant)=public.fx_realised_account(v_tenant) THEN 'Realised FX' ELSE 'Card FX fee' END, v_tenant$qb$);
 EXECUTE s; END $do$;

DO $do$ DECLARE s text:=pg_get_functiondef('public.post_expense_bill_payment(uuid)'::regprocedure); BEGIN
 IF position($pa$public.fx_realised_account(b.tenant_id)$pa$ in s)=0 THEN RAISE EXCEPTION 'patch post_expense_bill_payment 0 missing'; END IF; s:=replace(s,$pa$public.fx_realised_account(b.tenant_id)$pa$,$qa$public.fx_difference_account(b.tenant_id)$qa$);
 EXECUTE s; END $do$;

DO $do$ DECLARE s text:=pg_get_functiondef('public.finance_schedule_approve(uuid,uuid,date)'::regprocedure); BEGIN
 IF position($pa$INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit,memo,line_no,venue) VALUES(t,j,(l->>'account_id')::uuid,coalesce((l->>'debit')::numeric,0),coalesce((l->>'credit')::numeric,0),q.reason,n,l->>'venue');$pa$ in s)=0 THEN RAISE EXCEPTION 'patch finance_schedule_approve 0 missing'; END IF; s:=replace(s,$pa$INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit,memo,line_no,venue) VALUES(t,j,(l->>'account_id')::uuid,coalesce((l->>'debit')::numeric,0),coalesce((l->>'credit')::numeric,0),q.reason,n,l->>'venue');$pa$,$qa$INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit,memo,line_no,venue,currency,original_amount,fx_rate) VALUES(t,j,(l->>'account_id')::uuid,coalesce((l->>'debit')::numeric,0),coalesce((l->>'credit')::numeric,0),coalesce(l->>'memo',q.reason),n,l->>'venue',l->>'currency',(l->>'original_amount')::numeric,(l->>'fx_rate')::numeric);$qa$);
 EXECUTE s; END $do$;

DO $do$ DECLARE s text:=pg_get_functiondef('public.finance_record_owed_payment(uuid,date,text,uuid,numeric,text,jsonb)'::regprocedure); BEGIN
 IF position($pa$ref text:=coalesce(p_reference,'');$pa$ in s)=0 THEN RAISE EXCEPTION 'patch finance_record_owed_payment 0 missing'; END IF; s:=replace(s,$pa$ref text:=coalesce(p_reference,'');$pa$,$qa$ref text:=coalesce(p_reference,''); base text; acur text; cb numeric; rawamt numeric; isfx boolean; orig numeric; fxd text; norm jsonb:='[]';$qa$);
 IF position($pb$FOR x IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'source',value->>'id' LOOP$pb$ in s)=0 THEN RAISE EXCEPTION 'patch finance_record_owed_payment 1 missing'; END IF; s:=replace(s,$pb$FOR x IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'source',value->>'id' LOOP$pb$,$qb$SELECT coalesce(base_currency,'HKD') INTO base FROM public.tenants WHERE id=p_tenant;
IF p_account IS NOT NULL AND bank.id IS NULL THEN SELECT * INTO bank FROM public.bank_accounts WHERE id=p_account AND tenant_id=p_tenant; END IF;
acur:=CASE WHEN p_method='cash' OR p_account IS NULL THEN base ELSE coalesce(upper(bank.currency),base) END;
PERFORM set_config('finance.fx_difference_account',CASE WHEN acur=base AND coalesce(bank.account_type,'') ILIKE '%card%' THEN public.finance_fx_fee_account(p_tenant)::text ELSE '' END,true);
FOR x IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY value->>'source',value->>'id' LOOP$qb$);
 IF position($pc$IF amt IS NULL OR amt<0 OR amt<>round(amt,2) THEN RAISE EXCEPTION 'Invalid allocation';END IF;$pc$ in s)=0 THEN RAISE EXCEPTION 'patch finance_record_owed_payment 2 missing'; END IF; s:=replace(s,$pc$IF amt IS NULL OR amt<0 OR amt<>round(amt,2) THEN RAISE EXCEPTION 'Invalid allocation';END IF;$pc$,$qc$IF amt IS NULL OR amt<0 OR amt<>round(amt,2) THEN RAISE EXCEPTION 'Invalid allocation';END IF;
rawamt:=amt;isfx:=false;orig:=NULL;fxd:=NULL;
IF acur<>base THEN cb:=round(amt*(SELECT r.rate FROM public.fx_rate(p_tenant,p_date,acur) r),2);IF cb IS NULL THEN RAISE EXCEPTION 'No % rate for %',acur,p_date;END IF;amt:=cb;END IF;$qc$);
 IF position($pd$cred:=cred+(c->>'amount')::numeric;END LOOP;$pd$ in s)=0 THEN RAISE EXCEPTION 'patch finance_record_owed_payment 3 missing'; END IF; s:=replace(s,$pd$cred:=cred+(c->>'amount')::numeric;END LOOP;$pd$,$qd$cred:=cred+(c->>'amount')::numeric;END LOOP;IF inv.original_total IS NOT NULL AND coalesce(upper(inv.currency),base)<>base THEN isfx:=true;fxd:=upper(inv.currency);orig:=coalesce((x->>'original')::numeric,CASE WHEN acur=fxd THEN rawamt END);IF orig IS NULL OR orig<=0 THEN RAISE EXCEPTION 'Enter the % amount this payment settles',fxd;END IF;IF orig>coalesce(inv.original_balance,inv.original_total)+0.005 THEN RAISE EXCEPTION 'Payment of % exceeds the % % still owed',orig,coalesce(inv.original_balance,inv.original_total),fxd;END IF;due:=amt+cred;END IF;$qd$);
 IF position($pe$due:=greatest(0,bill.total_amount-bill.paid_amount);$pe$ in s)=0 THEN RAISE EXCEPTION 'patch finance_record_owed_payment 4 missing'; END IF; s:=replace(s,$pe$due:=greatest(0,bill.total_amount-bill.paid_amount);$pe$,$qe$due:=greatest(0,bill.total_amount-bill.paid_amount);IF bill.original_total IS NOT NULL AND coalesce(upper(bill.currency),base)<>base THEN isfx:=true;fxd:=upper(bill.currency);orig:=coalesce((x->>'original')::numeric,CASE WHEN acur=fxd THEN rawamt END);IF orig IS NULL OR orig<=0 THEN RAISE EXCEPTION 'Enter the % amount this payment settles',fxd;END IF;IF orig>coalesce(bill.original_balance,bill.original_total)+0.005 THEN RAISE EXCEPTION 'Payment of % exceeds the % % still owed',orig,coalesce(bill.original_balance,bill.original_total),fxd;END IF;due:=amt+cred;END IF;$qe$);
 IF position($pf$ELSIF x->>'source' IN('salary','mpf') THEN$pf$ in s)=0 THEN RAISE EXCEPTION 'patch finance_record_owed_payment 5 missing'; END IF; s:=replace(s,$pf$ELSIF x->>'source' IN('salary','mpf') THEN$pf$,$qf$ELSIF x->>'source' IN('salary','mpf','staff') AND acur<>base THEN RAISE EXCEPTION 'Pay payroll and staff claims from a % account',base;
ELSIF x->>'source' IN('salary','mpf') THEN$qf$);
 IF position($pg$END LOOP;
IF (SELECT sum((a->>'amount')::numeric) FROM jsonb_array_elements(p_items) a) IS DISTINCT FROM p_amount THEN RAISE EXCEPTION 'Amount must equal selected allocations';END IF;$pg$ in s)=0 THEN RAISE EXCEPTION 'patch finance_record_owed_payment 6 missing'; END IF; s:=replace(s,$pg$END LOOP;
IF (SELECT sum((a->>'amount')::numeric) FROM jsonb_array_elements(p_items) a) IS DISTINCT FROM p_amount THEN RAISE EXCEPTION 'Amount must equal selected allocations';END IF;$pg$,$qg$norm:=norm||jsonb_build_array(x||jsonb_build_object('amount',amt,'original',orig,'fx',isfx));
END LOOP;
IF (SELECT sum((a->>'amount')::numeric) FROM jsonb_array_elements(p_items) a) IS DISTINCT FROM p_amount THEN RAISE EXCEPTION 'Amount must equal selected allocations';END IF;
p_items:=norm;$qg$);
 IF position($ph$UPDATE public.payment_allocations SET tenant_id=p_tenant WHERE payment_id=pid;$ph$ in s)=0 THEN RAISE EXCEPTION 'patch finance_record_owed_payment 7 missing'; END IF; s:=replace(s,$ph$UPDATE public.payment_allocations SET tenant_id=p_tenant WHERE payment_id=pid;$ph$,$qh$UPDATE public.payment_allocations SET tenant_id=p_tenant WHERE payment_id=pid;UPDATE public.payment_allocations pa SET original_allocated=(n->>'original')::numeric,cash_base_allocated=pa.amount_allocated FROM jsonb_array_elements(p_items) n WHERE pa.payment_id=pid AND pa.invoice_id::text=n->>'id' AND n->>'source'='supplier' AND (n->>'fx')::boolean AND pa.amount_allocated>0;$qh$);
 IF position($pi$INSERT INTO public.expense_bill_payments(tenant_id,bill_id,payment_date,amount,payment_method,bank_account_id,reference,created_by) VALUES(p_tenant,(x->>'id')::uuid,p_date,(x->>'amount')::numeric,p_method,p_account,ref,uid)$pi$ in s)=0 THEN RAISE EXCEPTION 'patch finance_record_owed_payment 8 missing'; END IF; s:=replace(s,$pi$INSERT INTO public.expense_bill_payments(tenant_id,bill_id,payment_date,amount,payment_method,bank_account_id,reference,created_by) VALUES(p_tenant,(x->>'id')::uuid,p_date,(x->>'amount')::numeric,p_method,p_account,ref,uid)$pi$,$qi$INSERT INTO public.expense_bill_payments(tenant_id,bill_id,payment_date,amount,payment_method,bank_account_id,reference,created_by,original_amount,currency) VALUES(p_tenant,(x->>'id')::uuid,p_date,(x->>'amount')::numeric,p_method,p_account,ref,uid,CASE WHEN (x->>'fx')::boolean THEN (x->>'original')::numeric END,CASE WHEN (x->>'fx')::boolean THEN (SELECT upper(currency) FROM public.expense_bills WHERE id=(x->>'id')::uuid) END)$qi$);
 IF position($pj$INSERT INTO public.audit_log(tenant_id,user_id,action,entity_type,details) VALUES(p_tenant,uid,'record_payment'$pj$ in s)=0 THEN RAISE EXCEPTION 'patch finance_record_owed_payment 9 missing'; END IF; s:=replace(s,$pj$INSERT INTO public.audit_log(tenant_id,user_id,action,entity_type,details) VALUES(p_tenant,uid,'record_payment'$pj$,$qj$PERFORM set_config('finance.fx_difference_account','',true);
INSERT INTO public.audit_log(tenant_id,user_id,action,entity_type,details) VALUES(p_tenant,uid,'record_payment'$qj$);
 EXECUTE s; END $do$;

DO $do$ DECLARE s text:=pg_get_functiondef('public.finance_confirm_bank_matches(uuid,uuid,jsonb,text)'::regprocedure); BEGIN IF position($a$IF total<>greatest(b.money_in,b.money_out) OR$a$ in s)=0 THEN RAISE EXCEPTION 'patch missing'; END IF; s:=replace(s,$a$IF total<>greatest(b.money_in,b.money_out) OR$a$,$b$IF total<>greatest(b.money_in,b.money_out) AND total<>round(greatest(b.money_in,b.money_out)*coalesce((SELECT r.rate FROM fx_rate(t,b.txn_date,(SELECT upper(x.currency) FROM bank_accounts x WHERE x.id=b.bank_account_id)) r),1),2) OR$b$); EXECUTE s; END $do$;

CREATE OR REPLACE FUNCTION public.fx_card_charge(t uuid, doc_type text, doc_id uuid, txn uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b text; cur text; rate numeric; orig numeric; posted boolean; d date; prev numeric; bt record; expected numeric; charged numeric; newrate numeric; f numeric; target numeric; got numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM tenant_members WHERE tenant_id=t AND user_id=auth.uid()) AND NOT is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT coalesce(base_currency,'HKD') INTO b FROM tenants WHERE id=t;
 IF doc_type='bill' THEN SELECT currency,fx_rate,original_total,approval_status='posted',bill_date,total_amount INTO cur,rate,orig,posted,d,prev FROM expense_bills WHERE id=doc_id AND tenant_id=t FOR UPDATE;
 ELSIF doc_type='invoice' THEN SELECT currency,fx_rate,original_total,review_status='Approved',invoice_date,total_amount INTO cur,rate,orig,posted,d,prev FROM invoices WHERE id=doc_id AND tenant_id=t FOR UPDATE;
 ELSE RAISE EXCEPTION 'Unknown document type'; END IF;
 SELECT x.*, coalesce(upper(a.currency),b) acur INTO bt FROM bank_transactions x JOIN bank_accounts a ON a.id=x.bank_account_id WHERE x.id=txn AND x.tenant_id=t;
 IF bt.id IS NULL OR coalesce(upper(cur),b)=b OR orig IS NULL OR orig<=0 OR bt.acur<>b THEN RETURN jsonb_build_object('applies',false,'reason','Only foreign documents matched to a '||b||' line'); END IF;
 charged:=CASE WHEN coalesce(bt.money_out,0)>0 THEN bt.money_out ELSE coalesce(bt.money_in,0) END; expected:=round(orig*coalesce(rate,0),2);
 IF abs(bt.txn_date-d)>7 OR expected<=0 OR abs(charged-expected)>expected*0.06 THEN RETURN jsonb_build_object('applies',false,'reason','No card or bank line within 7 days and 6%'); END IF;
 IF posted THEN RETURN jsonb_build_object('applies',true,'mode','fee','base',expected,'charged',charged,'fee',charged-expected,'fee_account',finance_fx_fee_account(t)); END IF;
 PERFORM finance_assert_open(t,d);
 newrate:=round(charged/orig,8); f:=CASE WHEN coalesce(prev,0)>0 THEN charged/prev ELSE charged/expected END;
 IF doc_type='bill' THEN
  SELECT round(coalesce(sum(amount),0)*f,2) INTO target FROM expense_bill_allocations WHERE bill_id=doc_id;
  UPDATE expense_bills SET fx_rate=newrate,fx_rate_source='card charge',total_amount=charged,subtotal=round(coalesce(subtotal,0)*f,2),tax_amount=round(coalesce(tax_amount,0)*f,2) WHERE id=doc_id;
  UPDATE expense_bill_allocations SET amount=round(amount*f,2),tax_amount=round(coalesce(tax_amount,0)*f,2) WHERE bill_id=doc_id;
  SELECT coalesce(sum(amount),0) INTO got FROM expense_bill_allocations WHERE bill_id=doc_id;
  IF got<>target THEN UPDATE expense_bill_allocations SET amount=amount+(target-got) WHERE id=(SELECT id FROM expense_bill_allocations WHERE bill_id=doc_id ORDER BY abs(amount) DESC,line_no LIMIT 1); END IF;
 ELSE
  SELECT round(coalesce(sum(total),0)*f,2) INTO target FROM invoice_line_items WHERE invoice_id=doc_id;
  UPDATE invoices SET fx_rate=newrate,fx_rate_source='card charge',total_amount=charged,subtotal=round(coalesce(subtotal,0)*f,2),tax_amount=round(coalesce(tax_amount,0)*f,2) WHERE id=doc_id;
  UPDATE invoice_line_items SET unit_price=round(unit_price*f,4),total=round(total*f,2),tax_amount=round(coalesce(tax_amount,0)*f,2) WHERE invoice_id=doc_id;
  SELECT coalesce(sum(total),0) INTO got FROM invoice_line_items WHERE invoice_id=doc_id;
  IF got<>target THEN UPDATE invoice_line_items SET total=total+(target-got) WHERE id=(SELECT id FROM invoice_line_items WHERE invoice_id=doc_id ORDER BY abs(total) DESC,created_at LIMIT 1); END IF;
 END IF;
 RETURN jsonb_build_object('applies',true,'mode','rate','rate',newrate,'base',charged,'factor',f,'fx',0);
END $$;
REVOKE ALL ON FUNCTION public.fx_card_charge(uuid,text,uuid,uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.finance_bank_card_reprice(t uuid, txn uuid, doc_type text, doc_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; BEGIN
 IF NOT finance_schedule_manager(t) THEN RAISE EXCEPTION 'Owner or admin required'; END IF;
 r:=fx_card_charge(t,doc_type,doc_id,txn);
 IF NOT coalesce((r->>'applies')::boolean,false) THEN RAISE EXCEPTION '%',coalesce(r->>'reason','Card rule does not apply'); END IF;
 IF r->>'mode'<>'rate' THEN RAISE EXCEPTION 'Document is already booked; the difference goes to card FX fees when the payment is approved'; END IF;
 INSERT INTO audit_log(tenant_id,user_id,action,entity_type,entity_id,details) VALUES(t,auth.uid(),'fx_card_reprice',doc_type,doc_id::text,r||jsonb_build_object('bank_line',txn));
 RETURN r; END $$;
REVOKE ALL ON FUNCTION public.finance_bank_card_reprice(uuid,uuid,text,uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.finance_bank_payment_preview(t uuid, txn uuid, items jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bank_transactions; ba bank_accounts; base text; acur text; r numeric; x jsonb; amt numeric; cb numeric; ap numeric:=0; cash numeric:=0; st jsonb; cur text; ot numeric; bal numeric; orig numeric; card boolean;
BEGIN
 IF NOT finance_schedule_manager(t) THEN RAISE EXCEPTION 'Owner or admin required'; END IF;
 SELECT * INTO b FROM bank_transactions WHERE tenant_id=t AND id=txn; IF b.id IS NULL THEN RAISE EXCEPTION 'Bank line unavailable'; END IF;
 SELECT * INTO ba FROM bank_accounts WHERE tenant_id=t AND id=b.bank_account_id;
 SELECT coalesce(base_currency,'HKD') INTO base FROM tenants WHERE id=t; acur:=coalesce(upper(ba.currency),base);
 r:=CASE WHEN acur=base THEN 1 ELSE (SELECT fr.rate FROM fx_rate(t,b.txn_date,acur) fr) END; IF r IS NULL THEN RAISE EXCEPTION 'No % rate for %',acur,b.txn_date; END IF;
 card:=acur=base AND coalesce(ba.account_type,'') ILIKE '%card%';
 FOR x IN SELECT * FROM jsonb_array_elements(items) LOOP
  amt:=(x->>'amount')::numeric; cb:=round(amt*r,2); cash:=cash+cb; cur:=NULL; ot:=NULL; bal:=NULL;
  IF x->>'source'='supplier' THEN SELECT upper(currency),original_total,original_balance INTO cur,ot,bal FROM invoices WHERE tenant_id=t AND id=(x->>'id')::uuid;
  ELSE SELECT upper(currency),original_total,original_balance INTO cur,ot,bal FROM expense_bills WHERE tenant_id=t AND id=(x->>'id')::uuid; END IF;
  IF ot IS NOT NULL AND coalesce(cur,base)<>base THEN
   orig:=coalesce((x->>'original')::numeric,CASE WHEN acur=cur THEN amt END);
   IF orig IS NULL OR orig<=0 THEN RAISE EXCEPTION 'Enter the % amount this payment settles',cur; END IF;
   st:=fx_settle(t,CASE WHEN x->>'source'='supplier' THEN 'invoice' ELSE 'bill' END,(x->>'id')::uuid,orig,cb,b.txn_date,false);
   ap:=ap+(st->>'base_cleared')::numeric;
  ELSE ap:=ap+cb; END IF;
 END LOOP;
 RETURN jsonb_build_object('ap',ap,'cash',cash,'cash_original',CASE WHEN acur<>base THEN greatest(b.money_out,b.money_in) END,'cash_currency',acur,'rate',r,'fx',ap-cash,'fx_label',CASE WHEN card THEN 'Bank charges · card FX fees' ELSE 'FX gains/losses · realised' END,'fx_account',CASE WHEN card THEN finance_fx_fee_account(t) ELSE fx_realised_account(t) END);
END $$;
REVOKE ALL ON FUNCTION public.finance_bank_payment_preview(uuid,uuid,jsonb) FROM anon;

CREATE OR REPLACE FUNCTION public.finance_bank_unpaid_draft(t uuid, txn uuid, items jsonb, notes text DEFAULT ''::text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE b bank_transactions;ba bank_accounts;x jsonb;iv invoices;eb expense_bills;amt numeric;total numeric:=0;ap uuid;ls jsonb;sources jsonb:='[]';ident uuid;base text;pv jsonb;fx numeric;foreign_doc boolean;
BEGIN IF NOT finance_schedule_manager(t) THEN RAISE EXCEPTION 'Owner or admin required';END IF;PERFORM pg_advisory_xact_lock(hashtextextended('finance-bank:'||t::text,0));SELECT * INTO b FROM bank_transactions WHERE tenant_id=t AND id=txn FOR UPDATE;IF NOT FOUND OR b.money_out<=0 OR b.money_in<>0 OR b.matched_record_id IS NOT NULL OR EXISTS(SELECT 1 FROM bank_transaction_matches WHERE tenant_id=t AND txn_id=b.id) THEN RAISE EXCEPTION 'Unmatched outgoing bank line required';END IF;PERFORM finance_assert_open(t,b.txn_date);IF jsonb_typeof(items) IS DISTINCT FROM 'array' OR jsonb_array_length(items)<1 OR jsonb_array_length(items)>50 OR EXISTS(SELECT 1 FROM jsonb_array_elements(items) i GROUP BY i->>'source',i->>'id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Select distinct unpaid items';END IF;SELECT * INTO ba FROM bank_accounts WHERE tenant_id=t AND id=b.bank_account_id AND is_active;IF ba.id IS NULL OR ba.linked_gl_account_id IS NULL THEN RAISE EXCEPTION 'Bank account must be linked to books';END IF;SELECT id INTO ap FROM chart_of_accounts WHERE tenant_id=t AND code='2000' AND is_active;
SELECT coalesce(base_currency,'HKD') INTO base FROM tenants WHERE id=t;
FOR x IN SELECT * FROM jsonb_array_elements(items) LOOP amt:=(x->>'amount')::numeric;IF amt IS NULL OR amt<=0 OR amt<>round(amt,2) THEN RAISE EXCEPTION 'Positive cents amount required';END IF;
IF x->>'source'='supplier' THEN SELECT * INTO iv FROM invoices WHERE tenant_id=t AND id=(x->>'id')::uuid FOR UPDATE;foreign_doc:=iv.original_total IS NOT NULL AND coalesce(upper(iv.currency),base)<>base;IF iv.id IS NULL OR iv.review_status IS DISTINCT FROM 'Approved' OR iv.invoice_date>b.txn_date OR iv.payment_status='voided' OR NOT foreign_doc AND coalesce(upper(ba.currency),base)=base AND amt>greatest(0,iv.total_amount-coalesce(iv.amount_paid,0)-coalesce(iv.held_amount,0)) THEN RAISE EXCEPTION 'Invoice changed or not payable';END IF;sources:=sources||jsonb_build_array(jsonb_build_object('source','supplier','id',iv.id,'fingerprint',md5(to_jsonb(iv)::text)));
ELSIF x->>'source'='bill' THEN SELECT * INTO eb FROM expense_bills WHERE tenant_id=t AND id=(x->>'id')::uuid FOR UPDATE;foreign_doc:=eb.original_total IS NOT NULL AND coalesce(upper(eb.currency),base)<>base;IF eb.id IS NULL OR eb.approval_status<>'posted' OR eb.bill_date>b.txn_date OR NOT foreign_doc AND coalesce(upper(ba.currency),base)=base AND amt>eb.total_amount-eb.paid_amount THEN RAISE EXCEPTION 'Bill changed or not payable';END IF;sources:=sources||jsonb_build_array(jsonb_build_object('source','bill','id',eb.id,'fingerprint',md5(to_jsonb(eb)::text)));
ELSE RAISE EXCEPTION 'Choose supplier invoices or bills only';END IF;total:=total+amt;END LOOP;IF total<>b.money_out THEN RAISE EXCEPTION 'Selected total must equal bank amount';END IF;
pv:=finance_bank_payment_preview(t,txn,items);fx:=(pv->>'fx')::numeric;
ls:=jsonb_build_array(jsonb_build_object('account_id',ap,'debit',(pv->>'ap')::numeric,'credit',0,'memo','AP settled'),jsonb_build_object('account_id',ba.linked_gl_account_id,'debit',0,'credit',(pv->>'cash')::numeric,'memo','Paid from '||ba.account_name,'currency',CASE WHEN pv->>'cash_original' IS NOT NULL THEN pv->>'cash_currency' END,'original_amount',(pv->>'cash_original')::numeric,'fx_rate',CASE WHEN pv->>'cash_original' IS NOT NULL THEN (pv->>'rate')::numeric END));
IF fx<>0 THEN ls:=ls||jsonb_build_array(jsonb_build_object('account_id',(pv->>'fx_account')::uuid,'debit',greatest(-fx,0),'credit',greatest(fx,0),'memo',pv->>'fx_label'));END IF;
ident:=finance_schedule_enqueue(t,b.txn_date,'bank_payment','Bank payment · selected unpaid items','Owner-confirmed bank statement evidence; payment awaits monthly approval','bank-payment:'||txn,ls,jsonb_build_object('bank',b.id,'bank_fingerprint',md5(to_jsonb(b)::text),'items',items,'sources',sources,'notes',left(notes,3000),'fx_preview',pv));RETURN ident;END $function$;

CREATE OR REPLACE FUNCTION public.finance_opening_equity_account(t uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ident uuid; BEGIN SELECT id INTO ident FROM chart_of_accounts WHERE tenant_id=t AND lower(name)='opening balance equity' AND is_active ORDER BY code LIMIT 1;
 IF ident IS NULL THEN INSERT INTO chart_of_accounts(tenant_id,code,name,account_type,normal_side,sort_order,description) VALUES(t,'OBE','Opening balance equity','equity','credit',3900,'Balancing side of opening balances') RETURNING id INTO ident; END IF; RETURN ident; END $$;
REVOKE ALL ON FUNCTION public.finance_opening_equity_account(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.finance_bank_opening_value(t uuid, acct uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE a bank_accounts; base text; cur text; v numeric; BEGIN
 SELECT * INTO a FROM bank_accounts WHERE tenant_id=t AND id=acct; IF a.id IS NULL THEN RETURN NULL; END IF;
 SELECT coalesce(base_currency,'HKD') INTO base FROM tenants WHERE id=t; cur:=coalesce(upper(a.currency),base);
 v:=CASE WHEN cur=base THEN round(coalesce(a.opening_balance,0),2) ELSE a.opening_base_value END;
 RETURN jsonb_build_object('bank_account',a.id,'gl',a.linked_gl_account_id,'name',a.account_name,'date',a.opening_date,'base',v,'original',round(coalesce(a.opening_balance,0),2),'currency',cur,'foreign',cur<>base,'fx_rate',CASE WHEN cur<>base THEN a.opening_fx_rate END); END $$;
REVOKE ALL ON FUNCTION public.finance_bank_opening_value(uuid,uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.finance_bank_opening_prepare(t uuid, acct uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cv jsonb; prev finance_entry_drafts; eq uuid; gl uuid; v numeric; pv numeric; ls jsonb:='[]';
BEGIN
 IF NOT finance_schedule_manager(t) THEN RAISE EXCEPTION 'Owner or admin required'; END IF;
 cv:=finance_bank_opening_value(t,acct); IF cv IS NULL OR cv->>'gl' IS NULL OR cv->>'date' IS NULL THEN RETURN NULL; END IF;
 IF (cv->>'foreign')::boolean AND cv->>'base' IS NULL THEN RAISE EXCEPTION 'No % rate for %; enter the opening rate',cv->>'currency',cv->>'date'; END IF;
 v:=(cv->>'base')::numeric; gl:=(cv->>'gl')::uuid; eq:=finance_opening_equity_account(t);
 SELECT * INTO prev FROM finance_entry_drafts WHERE tenant_id=t AND kind IN('bank_opening','bank_opening_correction') AND status='approved' AND source_data->>'bank_account'=acct::text ORDER BY approved_at DESC LIMIT 1;
 IF prev.id IS NULL THEN
  IF v=0 THEN UPDATE finance_entry_drafts SET status='cancelled' WHERE tenant_id=t AND source_key='bank-opening:'||acct AND status='waiting'; RETURN NULL; END IF;
  ls:=jsonb_build_array(jsonb_build_object('account_id',gl,'debit',greatest(v,0),'credit',greatest(-v,0),'memo','Opening balance · '||(cv->>'name'),'currency',CASE WHEN (cv->>'foreign')::boolean THEN cv->>'currency' END,'original_amount',CASE WHEN (cv->>'foreign')::boolean THEN (cv->>'original')::numeric END,'fx_rate',(cv->>'fx_rate')::numeric),
   jsonb_build_object('account_id',eq,'debit',greatest(-v,0),'credit',greatest(v,0),'memo','Opening balance equity'));
  RETURN finance_schedule_enqueue(t,(cv->>'date')::date,'bank_opening','Bank opening balance · '||(cv->>'name'),'Opening balance from the bank account record','bank-opening:'||acct,ls,cv);
 END IF;
 pv:=(prev.source_data->>'base')::numeric;
 IF pv=v AND prev.source_data->>'date'=cv->>'date' AND prev.source_data->>'gl'=cv->>'gl' THEN UPDATE finance_entry_drafts SET status='cancelled' WHERE tenant_id=t AND source_key='bank-opening-fix:'||prev.id AND status='waiting'; RETURN NULL; END IF;
 ls:=jsonb_build_array(jsonb_build_object('account_id',(prev.source_data->>'gl')::uuid,'debit',greatest(-pv,0),'credit',greatest(pv,0),'memo','Reverse earlier opening','currency',CASE WHEN (prev.source_data->>'foreign')::boolean THEN prev.source_data->>'currency' END,'original_amount',CASE WHEN (prev.source_data->>'foreign')::boolean THEN -(prev.source_data->>'original')::numeric END,'fx_rate',(prev.source_data->>'fx_rate')::numeric),
  jsonb_build_object('account_id',eq,'debit',greatest(pv,0),'credit',greatest(-pv,0),'memo','Reverse earlier opening equity'),
  jsonb_build_object('account_id',gl,'debit',greatest(v,0),'credit',greatest(-v,0),'memo','Corrected opening · '||(cv->>'name'),'currency',CASE WHEN (cv->>'foreign')::boolean THEN cv->>'currency' END,'original_amount',CASE WHEN (cv->>'foreign')::boolean THEN (cv->>'original')::numeric END,'fx_rate',(cv->>'fx_rate')::numeric),
  jsonb_build_object('account_id',eq,'debit',greatest(-v,0),'credit',greatest(v,0),'memo','Corrected opening equity'));
 RETURN finance_schedule_enqueue(t,(cv->>'date')::date,'bank_opening_correction','Bank opening correction · '||(cv->>'name'),'Opening balance changed after it was booked; reverses the earlier opening and books the new one','bank-opening-fix:'||prev.id,ls,cv||jsonb_build_object('previous_draft',prev.id),NULL,prev.journal_entry_id);
END $$;
REVOKE ALL ON FUNCTION public.finance_bank_opening_prepare(uuid,uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.finance_bank_opening_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.opening_balance IS NOT DISTINCT FROM NEW.opening_balance AND OLD.opening_date IS NOT DISTINCT FROM NEW.opening_date AND OLD.opening_base_value IS NOT DISTINCT FROM NEW.opening_base_value AND OLD.linked_gl_account_id IS NOT DISTINCT FROM NEW.linked_gl_account_id AND OLD.currency IS NOT DISTINCT FROM NEW.currency THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL OR NOT finance_schedule_manager(NEW.tenant_id) THEN RETURN NEW; END IF;
 BEGIN PERFORM finance_bank_opening_prepare(NEW.tenant_id,NEW.id); EXCEPTION WHEN others THEN RAISE WARNING 'Bank opening draft not prepared: %',SQLERRM; END;
 RETURN NEW; END $$;
DROP TRIGGER IF EXISTS finance_bank_opening_draft ON public.bank_accounts;
CREATE TRIGGER finance_bank_opening_draft AFTER INSERT OR UPDATE ON public.bank_accounts FOR EACH ROW EXECUTE FUNCTION public.finance_bank_opening_trigger();

CREATE OR REPLACE FUNCTION public.finance_fx_draft_check(t uuid, q finance_entry_drafts) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE cv jsonb; BEGIN
 IF q.kind='fx_revaluation' THEN RAISE EXCEPTION 'FX revaluation approval is not available yet. The draft is retained; no posting has occurred.';END IF;
 IF q.kind IN('bank_opening','bank_opening_correction') THEN cv:=finance_bank_opening_value(t,(q.source_data->>'bank_account')::uuid);
  IF cv IS NULL OR cv->>'base' IS DISTINCT FROM q.source_data->>'base' OR cv->>'date' IS DISTINCT FROM q.source_data->>'date' OR cv->>'gl' IS DISTINCT FROM q.source_data->>'gl' THEN RAISE EXCEPTION 'Bank opening balance changed; edit the account again to prepare a fresh draft';END IF;END IF;
END $function$;

CREATE TABLE IF NOT EXISTS public.finance_pending_transfers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 from_account uuid NOT NULL REFERENCES public.bank_accounts(id), to_account uuid NOT NULL REFERENCES public.bank_accounts(id),
 out_txn uuid REFERENCES public.bank_transactions(id), in_txn uuid REFERENCES public.bank_transactions(id),
 transfer_date date NOT NULL, amount_out numeric NOT NULL CHECK(amount_out>0), amount_in numeric NOT NULL CHECK(amount_in>0),
 notes text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'waiting' CHECK(status IN('waiting','paired','cancelled')),
 pair_id uuid, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), CHECK(status='paired' OR (out_txn IS NULL)<>(in_txn IS NULL)));
GRANT SELECT ON public.finance_pending_transfers TO authenticated;
GRANT ALL ON public.finance_pending_transfers TO service_role;
ALTER TABLE public.finance_pending_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read pending transfers" ON public.finance_pending_transfers FOR SELECT TO authenticated USING (public.user_has_tenant(auth.uid(),tenant_id));

CREATE OR REPLACE FUNCTION public._finance_transfer_pair(t uuid, o uuid, i uuid, uid uuid, note text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE bo bank_transactions; bi bank_transactions; ao bank_accounts; ai bank_accounts; base text; co text; ci text; ro numeric; ri numeric; vo numeric; vi numeric; diff numeric; j uuid; pair uuid:=gen_random_uuid();
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('finance-bank:'||t::text,0));
 SELECT * INTO bo FROM bank_transactions WHERE tenant_id=t AND id=o FOR UPDATE; SELECT * INTO bi FROM bank_transactions WHERE tenant_id=t AND id=i FOR UPDATE;
 IF bo.id IS NULL OR bi.id IS NULL OR coalesce(bo.money_out,0)<=0 OR coalesce(bi.money_in,0)<=0 OR bo.bank_account_id=bi.bank_account_id THEN RAISE EXCEPTION 'Choose a money-out line and a money-in line on two different accounts'; END IF;
 IF bo.transfer_pair_id IS NOT NULL OR bi.transfer_pair_id IS NOT NULL OR bo.matched_record_id IS NOT NULL OR bi.matched_record_id IS NOT NULL OR EXISTS(SELECT 1 FROM bank_transaction_matches WHERE tenant_id=t AND txn_id IN(o,i)) THEN RAISE EXCEPTION 'Bank line already matched'; END IF;
 IF abs(bo.txn_date-bi.txn_date)>3 THEN RAISE EXCEPTION 'Transfer lines must be within 3 days'; END IF;
 PERFORM finance_assert_open(t,bo.txn_date); PERFORM finance_assert_open(t,bi.txn_date);
 SELECT * INTO ao FROM bank_accounts WHERE id=bo.bank_account_id; SELECT * INTO ai FROM bank_accounts WHERE id=bi.bank_account_id;
 IF ao.linked_gl_account_id IS NULL OR ai.linked_gl_account_id IS NULL THEN RAISE EXCEPTION 'Both accounts must be linked to the books'; END IF;
 SELECT coalesce(base_currency,'HKD') INTO base FROM tenants WHERE id=t; co:=coalesce(upper(ao.currency),base); ci:=coalesce(upper(ai.currency),base);
 ro:=(SELECT r.rate FROM fx_rate(t,bo.txn_date,co) r); ri:=(SELECT r.rate FROM fx_rate(t,bi.txn_date,ci) r);
 IF ro IS NULL OR ri IS NULL THEN RAISE EXCEPTION 'No exchange rate for this date'; END IF;
 vo:=round(bo.money_out*ro,2); vi:=round(bi.money_in*ri,2); diff:=vo-vi;
 INSERT INTO journal_entries(tenant_id,entry_date,memo,source_type,source_id,status,created_by) VALUES(t,bo.txn_date,'Transfer · '||ao.account_name||' → '||ai.account_name,'bank_transfer',pair::text,'draft',uid) RETURNING id INTO j;
 INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit,line_no,memo,currency,original_amount,fx_rate) VALUES
  (t,j,ai.linked_gl_account_id,vi,0,1,'Transfer in',CASE WHEN ci<>base THEN ci END,CASE WHEN ci<>base THEN bi.money_in END,CASE WHEN ci<>base THEN ri END),
  (t,j,ao.linked_gl_account_id,0,vo,2,'Transfer out',CASE WHEN co<>base THEN co END,CASE WHEN co<>base THEN bo.money_out END,CASE WHEN co<>base THEN ro END);
 IF diff<>0 THEN INSERT INTO journal_lines(tenant_id,entry_id,account_id,debit,credit,line_no,memo) VALUES(t,j,fx_realised_account(t),greatest(diff,0),greatest(-diff,0),3,'Realised FX'); END IF;
 UPDATE journal_entries SET status='posted',posted_at=now() WHERE id=j;
 UPDATE bank_transactions SET transfer_pair_id=pair,is_transfer=true,status='matched',match_confidence='high',matched_record_type='transfer',matched_record_id=pair::text,journal_entry_id=j,fx_gain_loss=CASE WHEN id=o THEN -diff END WHERE id IN(o,i);
 INSERT INTO audit_log(tenant_id,user_id,action,entity_type,entity_id,details) VALUES(t,uid,'bank_transfer_paired','bank_transactions',pair::text,jsonb_build_object('out',o,'in',i,'out_base',vo,'in_base',vi,'fx',diff,'journal',j,'notes',note));
 RETURN pair; END $$;
REVOKE ALL ON FUNCTION public._finance_transfer_pair(uuid,uuid,uuid,uuid,text) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.finance_transfer_pair(t uuid, out_txn uuid, in_txn uuid, notes text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF NOT finance_schedule_manager(t) THEN RAISE EXCEPTION 'Owner or admin required'; END IF; RETURN _finance_transfer_pair(t,out_txn,in_txn,auth.uid(),left(coalesce(notes,''),500)); END $$;
REVOKE ALL ON FUNCTION public.finance_transfer_pair(uuid,uuid,uuid,text) FROM anon;

CREATE OR REPLACE FUNCTION public.finance_transfer_pending(t uuid, from_account uuid, to_account uuid, out_txn uuid, in_txn uuid, d date, amount_out numeric, amount_in numeric, notes text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ident uuid; BEGIN
 IF NOT finance_schedule_manager(t) THEN RAISE EXCEPTION 'Owner or admin required'; END IF;
 IF from_account=to_account OR NOT EXISTS(SELECT 1 FROM bank_accounts WHERE tenant_id=t AND id=from_account) OR NOT EXISTS(SELECT 1 FROM bank_accounts WHERE tenant_id=t AND id=to_account) THEN RAISE EXCEPTION 'Choose two business accounts'; END IF;
 IF (out_txn IS NULL)=(in_txn IS NULL) THEN RAISE EXCEPTION 'Pick the one statement line you already have'; END IF;
 IF out_txn IS NOT NULL AND NOT EXISTS(SELECT 1 FROM bank_transactions x WHERE x.tenant_id=t AND x.id=out_txn AND x.bank_account_id=from_account AND x.money_out=amount_out AND x.transfer_pair_id IS NULL) OR in_txn IS NOT NULL AND NOT EXISTS(SELECT 1 FROM bank_transactions x WHERE x.tenant_id=t AND x.id=in_txn AND x.bank_account_id=to_account AND x.money_in=amount_in AND x.transfer_pair_id IS NULL) THEN RAISE EXCEPTION 'Statement line unavailable'; END IF;
 PERFORM finance_assert_open(t,d);
 INSERT INTO finance_pending_transfers(tenant_id,from_account,to_account,out_txn,in_txn,transfer_date,amount_out,amount_in,notes,created_by) VALUES(t,from_account,to_account,out_txn,in_txn,d,round(amount_out,2),round(amount_in,2),left(coalesce(notes,''),500),auth.uid()) RETURNING id INTO ident;
 RETURN ident; END $$;
REVOKE ALL ON FUNCTION public.finance_transfer_pending(uuid,uuid,uuid,uuid,uuid,date,numeric,numeric,text) FROM anon;

CREATE OR REPLACE FUNCTION public.finance_transfer_autopair() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p finance_pending_transfers; pair uuid; BEGIN
 SELECT * INTO p FROM finance_pending_transfers WHERE tenant_id=NEW.tenant_id AND status='waiting' AND abs(NEW.txn_date-transfer_date)<=3 AND (out_txn IS NULL AND from_account=NEW.bank_account_id AND coalesce(NEW.money_out,0)=amount_out OR in_txn IS NULL AND to_account=NEW.bank_account_id AND coalesce(NEW.money_in,0)=amount_in) ORDER BY abs(NEW.txn_date-transfer_date),created_at LIMIT 1;
 IF p.id IS NULL THEN RETURN NEW; END IF;
 BEGIN
  pair:=_finance_transfer_pair(NEW.tenant_id,coalesce(p.out_txn,NEW.id),coalesce(p.in_txn,NEW.id),p.created_by,p.notes);
  UPDATE finance_pending_transfers SET status='paired',pair_id=pair,out_txn=coalesce(out_txn,NEW.id),in_txn=coalesce(in_txn,NEW.id) WHERE id=p.id;
 EXCEPTION WHEN others THEN RAISE WARNING 'Pending transfer not paired: %',SQLERRM; END;
 RETURN NEW; END $$;
DROP TRIGGER IF EXISTS finance_transfer_autopair ON public.bank_transactions;
CREATE TRIGGER finance_transfer_autopair AFTER INSERT ON public.bank_transactions FOR EACH ROW EXECUTE FUNCTION public.finance_transfer_autopair();