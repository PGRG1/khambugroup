CREATE OR REPLACE FUNCTION public.fx_card_charge(t uuid, doc_type text, doc_id uuid, txn uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b text; cur text; rate numeric; orig numeric; posted boolean; d date; bt record; expected numeric; charged numeric; newrate numeric;
BEGIN
 IF auth.uid() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tenant_members WHERE tenant_id=t AND user_id=auth.uid()) AND NOT is_platform_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT coalesce(base_currency,'HKD') INTO b FROM tenants WHERE id=t;
 IF doc_type='bill' THEN SELECT currency,fx_rate,original_total,approval_status='posted',bill_date INTO cur,rate,orig,posted,d FROM expense_bills WHERE id=doc_id AND tenant_id=t;
 ELSIF doc_type='invoice' THEN SELECT currency,fx_rate,original_total,review_status='Approved',invoice_date INTO cur,rate,orig,posted,d FROM invoices WHERE id=doc_id AND tenant_id=t;
 ELSE RAISE EXCEPTION 'Unknown document type'; END IF;
 SELECT x.id, x.txn_date, coalesce(x.money_out,0)+coalesce(x.money_in,0) amt, coalesce(upper(a.currency),b) acur INTO bt FROM bank_transactions x JOIN bank_accounts a ON a.id=x.bank_account_id WHERE x.id=txn AND x.tenant_id=t;
 IF bt.id IS NULL OR coalesce(upper(cur),b)=b OR orig IS NULL OR orig<=0 OR bt.acur<>b THEN RETURN jsonb_build_object('applies',false); END IF;
 charged:=abs(bt.amt); expected:=round(orig*coalesce(rate,0),2);
 IF abs(bt.txn_date-d)>7 OR expected<=0 OR abs(charged-expected)>expected*0.06 THEN RETURN jsonb_build_object('applies',false,'reason','No card or bank line within 7 days and 6%'); END IF;
 IF NOT coalesce(posted,false) THEN
  newrate:=round(charged/orig,8);
  IF doc_type='bill' THEN UPDATE expense_bills SET fx_rate=newrate,fx_rate_source='card charge',total_amount=charged WHERE id=doc_id;
  ELSE UPDATE invoices SET fx_rate=newrate,fx_rate_source='card charge',total_amount=charged WHERE id=doc_id; END IF;
  RETURN jsonb_build_object('applies',true,'mode','rate','rate',newrate,'base',charged,'fx',0);
 END IF;
 RETURN jsonb_build_object('applies',true,'mode','fee','base',expected,'charged',charged,'fee',charged-expected,'fee_account',finance_fx_fee_account(t));
END $$;
CREATE OR REPLACE FUNCTION public.fx_settle_guard() RETURNS void LANGUAGE sql AS $$ SELECT NULL::void $$;
DROP FUNCTION public.fx_settle_guard();