ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS fx_base_cleared numeric NOT NULL DEFAULT 0;
ALTER TABLE public.expense_bills ADD COLUMN IF NOT EXISTS fx_base_cleared numeric NOT NULL DEFAULT 0;
ALTER TABLE public.credit_notes ADD COLUMN IF NOT EXISTS fx_base_cleared numeric NOT NULL DEFAULT 0;
ALTER TABLE public.bank_accounts ADD COLUMN IF NOT EXISTS group_label text;
COMMENT ON COLUMN public.bank_accounts.group_label IS 'Bank group shown on Bank & cash; default bank name + main statement account number.';
COMMENT ON COLUMN public.invoices.fx_base_cleared IS 'Base value already cleared by foreign settlements (fx_settle).';

-- One settlement rule for every foreign payment route.
CREATE OR REPLACE FUNCTION public.fx_settle(t uuid, doc_type text, doc_id uuid, original_paid numeric, cash_base numeric, pay_date date, apply boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b text; cur text; rate numeric; base_total numeric; orig_total numeric; orig_bal numeric; cleared numeric; part numeric; gl numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM tenant_members WHERE tenant_id=t AND user_id=auth.uid()) AND NOT is_platform_admin() AND auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT coalesce(base_currency,'HKD') INTO b FROM tenants WHERE id=t;
 IF doc_type='invoice' THEN SELECT currency,fx_rate,total_amount,original_total,original_balance,fx_base_cleared INTO cur,rate,base_total,orig_total,orig_bal,cleared FROM invoices WHERE id=doc_id AND tenant_id=t FOR UPDATE;
 ELSIF doc_type='bill' THEN SELECT currency,fx_rate,total_amount,original_total,original_balance,fx_base_cleared INTO cur,rate,base_total,orig_total,orig_bal,cleared FROM expense_bills WHERE id=doc_id AND tenant_id=t FOR UPDATE;
 ELSIF doc_type='credit_note' THEN SELECT currency,fx_rate,original_amount,original_currency_amount,original_remaining,fx_base_cleared INTO cur,rate,base_total,orig_total,orig_bal,cleared FROM credit_notes WHERE id=doc_id AND tenant_id=t FOR UPDATE;
 ELSE RAISE EXCEPTION 'Unknown document type %',doc_type; END IF;
 IF base_total IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;
 IF coalesce(upper(cur),b)=b OR orig_total IS NULL OR coalesce(rate,0)<=0 THEN
  RETURN jsonb_build_object('foreign',false,'base_cleared',round(cash_base,2),'gain_loss',0);
 END IF;
 orig_bal:=coalesce(orig_bal,orig_total);
 IF original_paid<=0 OR original_paid>orig_bal+0.005 THEN RAISE EXCEPTION 'Payment of % exceeds the % % still owed',original_paid,orig_bal,cur; END IF;
 IF original_paid>=orig_bal-0.005 THEN part:=round(base_total-coalesce(cleared,0),2); ELSE part:=round(original_paid*rate,2); END IF;
 gl:=part-round(coalesce(cash_base,0),2);
 IF apply THEN
  IF doc_type='invoice' THEN UPDATE invoices SET original_balance=greatest(orig_bal-original_paid,0),fx_base_cleared=coalesce(cleared,0)+part WHERE id=doc_id;
  ELSIF doc_type='bill' THEN UPDATE expense_bills SET original_balance=greatest(orig_bal-original_paid,0),fx_base_cleared=coalesce(cleared,0)+part WHERE id=doc_id;
  ELSE UPDATE credit_notes SET original_remaining=greatest(orig_bal-original_paid,0),fx_base_cleared=coalesce(cleared,0)+part WHERE id=doc_id; END IF;
 END IF;
 RETURN jsonb_build_object('foreign',true,'currency',cur,'rate',rate,'base_cleared',part,'gain_loss',gl,'original_remaining',greatest(orig_bal-original_paid,0));
END $$;
REVOKE ALL ON FUNCTION public.fx_settle(uuid,text,uuid,numeric,numeric,date,boolean) FROM anon;

CREATE OR REPLACE FUNCTION public.finance_fx_fee_account(t uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ident uuid; BEGIN SELECT id INTO ident FROM chart_of_accounts WHERE tenant_id=t AND code='FX-FEE'; IF ident IS NULL THEN INSERT INTO chart_of_accounts(tenant_id,code,name,account_type,normal_side,sort_order,description) VALUES(t,'FX-FEE','Bank charges · card FX fees','expense','debit',9890,'Card currency conversion differences and foreign transaction fees') RETURNING id INTO ident; END IF; RETURN ident; END $$;

-- Realised FX account lookup usable by payment routes (no owner gate; payment routes already authorise).
CREATE OR REPLACE FUNCTION public.fx_realised_account(t uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ident uuid; BEGIN SELECT id INTO ident FROM chart_of_accounts WHERE tenant_id=t AND code='FX-R'; IF ident IS NULL THEN INSERT INTO chart_of_accounts(tenant_id,code,name,account_type,normal_side,sort_order,description) VALUES(t,'FX-R','FX gains/losses · realised','other_expense','debit',9900,'Foreign exchange below operating costs; signed losses and gains') RETURNING id INTO ident; END IF; RETURN ident; END $$;

-- Card/foreign-price rule.
CREATE OR REPLACE FUNCTION public.fx_card_charge(t uuid, doc_type text, doc_id uuid, txn uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b text; cur text; rate numeric; orig numeric; posted boolean; d date; bt record; expected numeric; charged numeric; newrate numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM tenant_members WHERE tenant_id=t AND user_id=auth.uid()) AND NOT is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT coalesce(base_currency,'HKD') INTO b FROM tenants WHERE id=t;
 IF doc_type='bill' THEN SELECT currency,fx_rate,original_total,approval_status='posted',bill_date INTO cur,rate,orig,posted,d FROM expense_bills WHERE id=doc_id AND tenant_id=t;
 ELSIF doc_type='invoice' THEN SELECT currency,fx_rate,original_total,review_status='Approved',invoice_date INTO cur,rate,orig,posted,d FROM invoices WHERE id=doc_id AND tenant_id=t;
 ELSE RAISE EXCEPTION 'Unknown document type'; END IF;
 SELECT x.*, coalesce(upper(a.currency),b) acur INTO bt FROM bank_transactions x JOIN bank_accounts a ON a.id=x.bank_account_id WHERE x.id=txn AND x.tenant_id=t;
 IF bt.id IS NULL OR coalesce(upper(cur),b)=b OR orig IS NULL OR bt.acur<>b THEN RETURN jsonb_build_object('applies',false); END IF;
 charged:=abs(coalesce(bt.amount,0)); expected:=round(orig*coalesce(rate,0),2);
 IF abs(bt.transaction_date-d)>7 OR expected<=0 OR abs(charged-expected)>expected*0.06 THEN RETURN jsonb_build_object('applies',false,'reason','No card or bank line within 7 days and 6%'); END IF;
 IF NOT posted THEN
  newrate:=round(charged/orig,8);
  IF doc_type='bill' THEN UPDATE expense_bills SET fx_rate=newrate,fx_rate_source='card charge',total_amount=charged WHERE id=doc_id;
  ELSE UPDATE invoices SET fx_rate=newrate,fx_rate_source='card charge',total_amount=charged WHERE id=doc_id; END IF;
  RETURN jsonb_build_object('applies',true,'mode','rate','rate',newrate,'base',charged,'fx',0);
 END IF;
 RETURN jsonb_build_object('applies',true,'mode','fee','base',expected,'charged',charged,'fee',charged-expected,'fee_account',finance_fx_fee_account(t));
END $$;
REVOKE ALL ON FUNCTION public.fx_card_charge(uuid,text,uuid,uuid) FROM anon;

-- Bill payments: foreign bills clear base at their own rate; difference to realised FX.
CREATE OR REPLACE FUNCTION public.post_expense_bill_payment(p_payment_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid(); v_uname TEXT; p RECORD; b RECORD; e_id UUID; acc_ap UUID; acc_bank UUID; v_total_paid NUMERIC;
  s jsonb; v_cleared numeric; v_gl numeric := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid,'admin'::public.app_role) THEN RAISE EXCEPTION 'Not authorized: admin role required'; END IF;
  SELECT * INTO p FROM public.expense_bill_payments WHERE id = p_payment_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF p.journal_entry_id IS NOT NULL THEN RETURN jsonb_build_object('already_posted', true, 'journal_entry_id', p.journal_entry_id); END IF;
  SELECT * INTO b FROM public.expense_bills WHERE id = p.bill_id;
  SELECT display_name INTO v_uname FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  SELECT account_id INTO acc_ap FROM public.account_mapping_rules WHERE rule_type='accounts_payable' LIMIT 1;
  IF acc_ap IS NULL THEN RAISE EXCEPTION 'Accounts Payable account not mapped'; END IF;
  IF p.payment_method='cash' THEN SELECT account_id INTO acc_bank FROM public.account_mapping_rules WHERE rule_type='cash_payment_clearing' LIMIT 1;
  ELSIF p.bank_account_id IS NOT NULL THEN SELECT linked_gl_account_id INTO acc_bank FROM public.bank_accounts WHERE id = p.bank_account_id;
  ELSE SELECT account_id INTO acc_bank FROM public.account_mapping_rules WHERE rule_type='bank_payment_clearing' AND match_key='' LIMIT 1; END IF;
  IF acc_bank IS NULL THEN RAISE EXCEPTION 'No bank/cash account resolved for payment'; END IF;
  v_cleared := p.amount;
  IF p.original_amount IS NOT NULL AND b.original_total IS NOT NULL THEN
    s := public.fx_settle(b.tenant_id,'bill',b.id,p.original_amount,p.amount,p.payment_date,true);
    v_cleared := (s->>'base_cleared')::numeric; v_gl := (s->>'gain_loss')::numeric;
    UPDATE public.expense_bill_payments SET cash_base_amount=p.amount, fx_gain_loss=v_gl WHERE id=p.id;
  END IF;
  INSERT INTO public.journal_entries (entry_date, memo, source_type, source_id, venue, status, created_by)
  VALUES (p.payment_date, 'Payment for bill '||COALESCE(b.bill_number,''), 'expense_bill_payment', p.id::text, b.venue, 'draft', v_uid) RETURNING id INTO e_id;
  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo) VALUES (e_id, acc_ap, v_cleared, 0, b.venue, 1, 'AP settle');
  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo) VALUES (e_id, acc_bank, 0, p.amount, b.venue, 2, p.payment_method);
  IF abs(v_gl) > 0.004 THEN
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit, venue, line_no, memo) VALUES (e_id, public.fx_realised_account(b.tenant_id), greatest(-v_gl,0), greatest(v_gl,0), b.venue, 3, 'Realised FX');
  END IF;
  UPDATE public.journal_entries SET status='posted', posted_at=now() WHERE id = e_id;
  UPDATE public.expense_bill_payments SET journal_entry_id = e_id WHERE id = p.id;
  IF b.original_total IS NOT NULL AND p.original_amount IS NOT NULL THEN
    UPDATE public.expense_bills SET paid_amount = fx_base_cleared, payment_status = CASE WHEN coalesce(original_balance,0) <= 0.005 THEN 'paid' ELSE 'partial' END WHERE id = b.id;
  ELSE
    SELECT COALESCE(SUM(amount),0) INTO v_total_paid FROM public.expense_bill_payments WHERE bill_id = b.id;
    UPDATE public.expense_bills SET paid_amount = v_total_paid, payment_status = CASE WHEN v_total_paid >= total_amount THEN 'paid' WHEN v_total_paid > 0 THEN 'partial' ELSE 'unpaid' END WHERE id = b.id;
  END IF;
  INSERT INTO public.expense_bill_audit (bill_id, event_type, actor_id, actor_name, details)
  VALUES (b.id, 'payment_posted', v_uid, v_uname, jsonb_build_object('journal_entry_id', e_id, 'amount', p.amount, 'fx_gain_loss', v_gl));
  RETURN jsonb_build_object('success', true, 'journal_entry_id', e_id, 'base_cleared', v_cleared, 'gain_loss', v_gl);
END;
$function$;

-- Fix: journal_entries.source_id is text.
CREATE OR REPLACE FUNCTION public.finance_fx_payment_prepare(t uuid, src text, ident uuid, d date, original numeric, paid_rate numeric, bank uuid, ref text DEFAULT ''::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ DECLARE s jsonb;b text;booked numeric;cash numeric;loss numeric;ap uuid;gl uuid;fx uuid;q uuid;bs jsonb;ls jsonb;st jsonb;BEGIN
IF NOT finance_schedule_manager(t) THEN RAISE EXCEPTION 'Owner or admin required';END IF;PERFORM finance_assert_open(t,d);PERFORM pg_advisory_xact_lock(hashtextextended('fx:'||t::text,0));s:=finance_fx_payment_source(t,src,ident);SELECT coalesce(base_currency,'HKD') INTO b FROM tenants WHERE id=t;
IF s IS NULL OR coalesce(s->>'currency',b)=b OR coalesce((s->>'fx_rate')::numeric,0)<=0 OR original<=0 OR paid_rate<=0 OR d<coalesce(s->>'bill_date',s->>'invoice_date')::date THEN RAISE EXCEPTION 'Booked foreign source and positive payment amount/rate required';END IF;
IF src='bill' AND s->>'approval_status'<>'posted' OR src='invoice' AND s->>'review_status'<>'Approved' THEN RAISE EXCEPTION 'Approve/book source first';END IF;
IF NOT EXISTS(SELECT 1 FROM journal_entries WHERE tenant_id=t AND status='posted' AND (id::text=s->>'journal_entry_id' OR source_type=src AND source_id=ident::text)) THEN RAISE EXCEPTION 'Source must be posted first';END IF;
cash:=round(original*paid_rate,2);st:=fx_settle(t,src,ident,original,cash,d,false);booked:=(st->>'base_cleared')::numeric;loss:=-(st->>'gain_loss')::numeric;
SELECT to_jsonb(a),a.linked_gl_account_id INTO bs,gl FROM bank_accounts a WHERE tenant_id=t AND id=bank AND is_active;IF gl IS NULL THEN RAISE EXCEPTION 'Select a bank account linked to books';END IF;
SELECT account_id INTO ap FROM account_mapping_rules WHERE tenant_id=t AND rule_type='accounts_payable' LIMIT 1;IF ap IS NULL THEN SELECT id INTO ap FROM chart_of_accounts WHERE tenant_id=t AND code='2000' AND is_active;END IF;IF ap IS NULL THEN RAISE EXCEPTION 'Accounts payable mapping required';END IF;fx:=finance_fx_account(t,true);
ls:=jsonb_build_array(jsonb_build_object('account_id',ap,'debit',booked,'credit',0),jsonb_build_object('account_id',gl,'debit',0,'credit',cash));IF loss<>0 THEN ls:=ls||jsonb_build_array(jsonb_build_object('account_id',fx,'debit',greatest(loss,0),'credit',greatest(-loss,0)));END IF;
IF EXISTS(SELECT 1 FROM finance_entry_drafts WHERE tenant_id=t AND status='waiting' AND source_data->>'fx_source_id'=ident::text) THEN RAISE EXCEPTION 'A payment draft already waits for this source';END IF;
INSERT INTO finance_entry_drafts(tenant_id,kind,label,entry_date,reason,lines,source_data,source_key,status) VALUES(t,'fx_payment','Foreign payment · '||coalesce(s->>'vendor_name',s->>'invoice_number','Invoice'),d,'Payment at '||paid_rate||'; realised FX '||loss,ls,jsonb_build_object('fx_source',src,'fx_source_id',ident,'source_fingerprint',md5(s::text),'bank',bank,'bank_fingerprint',md5(bs::text),'original',original,'currency',s->>'currency','paid_rate',paid_rate,'booked',booked,'cash',cash,'loss',loss,'reference',ref), 'fx-payment:'||ident||':'||gen_random_uuid(),'waiting') RETURNING id INTO q;RETURN q;END $function$;

CREATE OR REPLACE FUNCTION public.finance_fx_draft_check(t uuid, q finance_entry_drafts)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN IF q.kind='fx_revaluation' THEN RAISE EXCEPTION 'FX revaluation approval is not available yet. The draft is retained; no posting has occurred.';END IF;END $function$;

UPDATE public.bank_accounts SET group_label = trim(coalesce(bank_name,'Bank')) WHERE group_label IS NULL;