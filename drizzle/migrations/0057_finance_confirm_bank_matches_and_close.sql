CREATE OR REPLACE FUNCTION public.finance_confirm_bank_match(p_tenant uuid,p_txn uuid,p_type text,p_target uuid,p_notes text DEFAULT '') RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE b public.bank_transactions; p public.payments; sb public.payment_settlement_batches; s public.sales_records;uid uuid:=auth.uid();j uuid;
BEGIN
IF uid IS NULL OR NOT public.has_role(uid,'admin') OR NOT (public.user_has_tenant(uid,p_tenant) OR public.is_super_admin(uid)) THEN RAISE EXCEPTION 'Finance access required';END IF;
PERFORM pg_advisory_xact_lock(hashtextextended('finance-bank:'||p_tenant::text,0));SELECT * INTO b FROM public.bank_transactions WHERE id=p_txn AND tenant_id=p_tenant FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Bank line unavailable';END IF;PERFORM public.finance_assert_open(p_tenant,b.txn_date);
IF EXISTS(SELECT 1 FROM public.bank_reconciliation_periods WHERE tenant_id=p_tenant AND bank_account_id=b.bank_account_id AND status='closed' AND b.txn_date BETWEEN period_start AND period_end) THEN RAISE EXCEPTION 'Bank period closed';END IF;
IF b.matched_record_id IS NOT NULL OR EXISTS(SELECT 1 FROM public.bank_transaction_matches WHERE tenant_id=p_tenant AND txn_id=b.id) THEN RAISE EXCEPTION 'Bank line already matched';END IF;
IF p_type='payment' THEN
SELECT * INTO p FROM public.payments WHERE id=p_target AND tenant_id=p_tenant FOR UPDATE;
IF NOT FOUND OR p.bank_transaction_id IS NOT NULL OR p.paid_from_account_id IS DISTINCT FROM b.bank_account_id OR p.amount IS DISTINCT FROM b.money_out OR b.money_out<=0 THEN RAISE EXCEPTION 'Payment does not match bank line';END IF;
UPDATE public.payments SET bank_transaction_id=b.id,match_status='matched' WHERE id=p.id AND tenant_id=p_tenant;
ELSIF p_type='settlement_batch' THEN
SELECT * INTO sb FROM public.payment_settlement_batches WHERE id=p_target AND tenant_id=p_tenant FOR UPDATE;
IF NOT FOUND OR sb.bank_transaction_id IS NOT NULL OR sb.net_settlement IS DISTINCT FROM b.money_in OR b.money_in<=0 OR sb.settlement_date<>b.txn_date OR sb.bank_account_id IS NOT NULL AND sb.bank_account_id<>b.bank_account_id THEN RAISE EXCEPTION 'Payout does not match bank line';END IF;
UPDATE public.payment_settlement_batches SET bank_transaction_id=b.id,bank_account_id=b.bank_account_id,status='matched' WHERE id=sb.id AND tenant_id=p_tenant;
ELSIF p_type='cash_deposit' THEN
SELECT * INTO s FROM public.sales_records WHERE id=p_target AND tenant_id=p_tenant;
IF NOT FOUND OR s.cash IS DISTINCT FROM b.money_in OR b.money_in<=0 OR s.date>b.txn_date THEN RAISE EXCEPTION 'Cash takings do not match deposit';END IF;
IF EXISTS(SELECT 1 FROM public.bank_transaction_matches WHERE tenant_id=p_tenant AND matched_type='cash_deposit' AND matched_id=p_target::text) THEN RAISE EXCEPTION 'Cash day already matched';END IF;
ELSE RAISE EXCEPTION 'Choose a supported source record';END IF;
INSERT INTO public.bank_transaction_matches(tenant_id,txn_id,matched_type,matched_id,amount,confidence,notes,created_by) VALUES(p_tenant,b.id,p_type,p_target::text,greatest(b.money_in,b.money_out),'high',left(coalesce(p_notes,''),3000),uid);
UPDATE public.bank_transactions SET matched_record_type=p_type,matched_record_id=p_target::text,status='matched',match_confidence='high',notes=left(coalesce(p_notes,''),3000) WHERE id=b.id AND tenant_id=p_tenant;
INSERT INTO public.audit_log(tenant_id,user_id,action,entity_type,entity_id,details) VALUES(p_tenant,uid,'match_bank_line','bank_transactions',b.id::text,jsonb_build_object('type',p_type,'target',p_target,'amount',greatest(b.money_in,b.money_out),'notes',p_notes));
END $$;
REVOKE ALL ON FUNCTION public.finance_confirm_bank_match(uuid,uuid,text,uuid,text) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.finance_confirm_bank_match(uuid,uuid,text,uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.finance_close_bank_period(p_tenant uuid,p_import uuid,p_note text DEFAULT '') RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE i public.bank_statement_imports;uid uuid:=auth.uid();system_amount numeric;diff numeric;result uuid;
BEGIN
IF uid IS NULL OR NOT public.has_role(uid,'admin') OR NOT (public.user_has_tenant(uid,p_tenant) OR public.is_super_admin(uid)) THEN RAISE EXCEPTION 'Finance access required';END IF;
PERFORM pg_advisory_xact_lock(hashtextextended('finance-bank:'||p_tenant::text,0));SELECT * INTO i FROM public.bank_statement_imports WHERE id=p_import AND tenant_id=p_tenant FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Statement unavailable';END IF;
IF EXISTS(SELECT 1 FROM public.bank_reconciliation_periods WHERE tenant_id=p_tenant AND bank_account_id=i.bank_account_id AND status='closed' AND period_start=i.period_start AND period_end=i.period_end) THEN RAISE EXCEPTION 'Bank period already closed';END IF;
IF EXISTS(SELECT 1 FROM public.bank_transactions b WHERE b.tenant_id=p_tenant AND b.bank_account_id=i.bank_account_id AND b.txn_date BETWEEN i.period_start AND i.period_end AND (b.status NOT IN('matched','cleared','posted') OR b.match_confidence='low' OR b.matched_record_id IS NULL AND b.journal_entry_id IS NULL)) THEN RAISE EXCEPTION 'Resolve bank exceptions first';END IF;
SELECT i.opening_balance+coalesce(sum(b.money_in-b.money_out),0) INTO system_amount FROM public.bank_transactions b WHERE b.tenant_id=p_tenant AND b.bank_account_id=i.bank_account_id AND b.txn_date BETWEEN i.period_start AND i.period_end;
diff:=round(i.closing_balance-system_amount,2);IF abs(diff)>=0.01 AND length(btrim(coalesce(p_note,'')))=0 THEN RAISE EXCEPTION 'Record the remaining difference before closing';END IF;
INSERT INTO public.bank_reconciliation_periods(tenant_id,bank_account_id,period_start,period_end,statement_balance,ledger_balance,difference,status,locked_by,locked_at,notes) VALUES(p_tenant,i.bank_account_id,i.period_start,i.period_end,i.closing_balance,system_amount,diff,'closed',uid,now(),left(p_note,3000)) RETURNING id INTO result;
UPDATE public.bank_transactions SET status='cleared' WHERE tenant_id=p_tenant AND bank_account_id=i.bank_account_id AND txn_date BETWEEN i.period_start AND i.period_end AND status IN('matched','posted');
INSERT INTO public.audit_log(tenant_id,user_id,action,entity_type,entity_id,details) VALUES(p_tenant,uid,'close_bank_period','bank_reconciliation_periods',result::text,jsonb_build_object('import_id',i.id,'difference',diff,'note',p_note));RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.finance_close_bank_period(uuid,uuid,text) FROM PUBLIC,anon;GRANT EXECUTE ON FUNCTION public.finance_close_bank_period(uuid,uuid,text) TO authenticated;