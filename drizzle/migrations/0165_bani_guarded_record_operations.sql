ALTER TABLE public.bani_pending_actions DROP CONSTRAINT bani_pending_actions_kind_check;
ALTER TABLE public.bani_pending_actions ADD CONSTRAINT bani_pending_actions_kind_check CHECK (kind IN ('mark_closed_days','open_sales_scanner','open_invoice_scanner','people','create_alert_ask','set_revenue_target','set_purchasing_budget','send_team_notification','expense_meter_coverage','log_waste','approve_bill','resolve_receipt_intake'));
CREATE OR REPLACE FUNCTION public.bani_operation_prepare(t uuid,k text,ident uuid,reason text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b expense_bills; r sales_receipt_intakes; p jsonb; a uuid; title text; detail text; challenge text; ls jsonb; v uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT user_has_tenant(auth.uid(),t) OR k NOT IN ('approve_bill','resolve_receipt_intake') THEN RAISE EXCEPTION 'Action unavailable'; END IF;
 IF access_level(t,CASE WHEN k='approve_bill' THEN 'expenses' ELSE 'revenue' END)<2 OR money_level(t)<>'everything' THEN RAISE EXCEPTION 'Edit and financial detail access required'; END IF;
 IF k='approve_bill' THEN
  SELECT * INTO b FROM expense_bills WHERE tenant_id=t AND id=ident;
  IF b.id IS NULL OR b.venue_id IS NULL OR NOT can_see_venue(t,b.venue_id) THEN RAISE EXCEPTION 'Bill unavailable'; END IF;
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')) THEN RAISE EXCEPTION 'Existing bill approval authority required'; END IF;
  IF b.approval_status NOT IN ('draft','pending_review','approved') OR b.journal_entry_id IS NOT NULL OR b.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'Only unposted bills can be approved'; END IF;
  IF b.recurring_rule_id IS NOT NULL OR b.combined_venues OR b.cost_allocation_mode='split' OR EXISTS(SELECT 1 FROM expense_bill_allocations WHERE tenant_id=t AND bill_id=ident AND capitalize) THEN RAISE EXCEPTION 'Use the existing selected monthly or split-bill review'; END IF;
  PERFORM finance_assert_open(t,b.bill_date);
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]'::jsonb) INTO ls FROM expense_bill_allocations x WHERE tenant_id=t AND bill_id=ident;
  IF jsonb_array_length(ls)=0 THEN RAISE EXCEPTION 'Bill allocations need review'; END IF;
  FOR v IN SELECT DISTINCT ven.id FROM expense_bill_allocations x JOIN venues ven ON ven.tenant_id=t AND ven.name=x.venue WHERE x.tenant_id=t AND x.bill_id=ident LOOP IF NOT can_see_venue(t,v) THEN RAISE EXCEPTION 'Allocation venue access required'; END IF; END LOOP;
  challenge:='POST '||coalesce(nullif(b.bill_number,''),right(b.id::text,8));
  title:='Approve and post bill '||coalesce(nullif(b.bill_number,''),right(b.id::text,8));
  detail:=coalesce(b.vendor_name,'Supplier')||' · '||b.bill_date::text||' · '||coalesce(b.venue,'Venue')||E'\nBooks this existing bill immediately. Does not pay it. No instant Undo; posted originals stay immutable.';
  p:=jsonb_build_object('record_id',ident,'before',to_jsonb(b),'lines_before',ls,'challenge',challenge,'link','/expenses/bills?bill='||ident::text);
 ELSE
  IF reason IS NULL OR reason NOT IN ('already_recorded','not_needed') THEN RAISE EXCEPTION 'Choose already recorded or not needed'; END IF;
  SELECT * INTO r FROM sales_receipt_intakes WHERE tenant_id=t AND id=ident;
  IF r.id IS NULL OR r.venue_id IS NULL OR NOT can_see_venue(t,r.venue_id) OR r.status<>'needs_review' OR r.posted_record_id IS NOT NULL THEN RAISE EXCEPTION 'Receipt review unavailable'; END IF;
  title:='Clear receipt review · '||r.source_name;
  detail:=CASE reason WHEN 'already_recorded' THEN 'Already recorded' ELSE 'Not needed' END||E'\nClears only the review queue. Keeps the source and figures. Never records sales or posts money.';
  p:=jsonb_build_object('record_id',ident,'before',to_jsonb(r),'resolution',reason);
 END IF;
 INSERT INTO bani_pending_actions(tenant_id,user_id,kind,title,detail,payload) VALUES(t,auth.uid(),k,left(title,200),detail,p) RETURNING id INTO a;
 RETURN jsonb_build_object('ok',true,'action_id',a,'title',title,'detail',detail,'challenge',challenge,'amount',CASE WHEN k='approve_bill' THEN b.total_amount ELSE NULL END,'currency',CASE WHEN k='approve_bill' THEN (SELECT base_currency FROM tenants WHERE id=t) ELSE NULL END,'note','Card prepared. Nothing saved. Financial posting requires review and the exact typed confirmation.');
END $$;
REVOKE ALL ON FUNCTION public.bani_operation_prepare(uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bani_operation_prepare(uuid,text,uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.bani_operation_execute(t uuid,a uuid,decision text,confirmation text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c bani_pending_actions; b expense_bills; r sales_receipt_intakes; ls jsonb; j uuid; v uuid;
BEGIN
 SELECT * INTO c FROM bani_pending_actions WHERE id=a AND tenant_id=t AND user_id=auth.uid() FOR UPDATE;
 IF c.id IS NULL OR auth.uid() IS NULL OR NOT user_has_tenant(auth.uid(),t) OR c.kind NOT IN ('approve_bill','resolve_receipt_intake') THEN RAISE EXCEPTION 'Action unavailable'; END IF;
 IF access_level(t,CASE WHEN c.kind='approve_bill' THEN 'expenses' ELSE 'revenue' END)<2 OR money_level(t)<>'everything' THEN RAISE EXCEPTION 'Edit and financial detail access required'; END IF;
 IF decision='cancel' THEN
  IF c.status<>'pending' THEN RAISE EXCEPTION 'Already handled'; END IF;
  UPDATE bani_pending_actions SET status='cancelled',resolved_at=now() WHERE id=a;
  RETURN jsonb_build_object('ok',true,'message','Cancelled — nothing changed.');
 END IF;
 IF decision='undo' THEN
  IF c.kind<>'resolve_receipt_intake' OR c.status<>'confirmed' OR c.resolved_at<now()-interval '10 minutes' THEN RAISE EXCEPTION 'Safe Undo unavailable'; END IF;
  SELECT * INTO r FROM sales_receipt_intakes WHERE tenant_id=t AND id=(c.payload->>'record_id')::uuid FOR UPDATE;
  IF r.id IS NULL OR NOT can_see_venue(t,r.venue_id) OR to_jsonb(r) IS DISTINCT FROM c.payload->'after' THEN RAISE EXCEPTION 'Receipt changed — Undo refused'; END IF;
  UPDATE sales_receipt_intakes SET status='needs_review',verification=c.payload->'before'->'verification' WHERE id=r.id;
  UPDATE bani_pending_actions SET status='cancelled',payload=payload||jsonb_build_object('undone_by',auth.uid(),'undone_at',now()),resolved_at=now() WHERE id=a;
  RETURN jsonb_build_object('ok',true,'receipts_changed',true,'message','Undone — receipt returned to review.');
 END IF;
 IF decision<>'confirm' OR c.status<>'pending' OR c.expires_at<now() THEN RAISE EXCEPTION 'Action expired or already handled'; END IF;
 IF c.kind='approve_bill' THEN
  IF confirmation IS DISTINCT FROM c.payload->>'challenge' THEN RAISE EXCEPTION 'Type the exact posting confirmation'; END IF;
  IF NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')) THEN RAISE EXCEPTION 'Existing bill approval authority required'; END IF;
  SELECT * INTO b FROM expense_bills WHERE tenant_id=t AND id=(c.payload->>'record_id')::uuid FOR UPDATE;
  IF b.id IS NULL OR b.venue_id IS NULL OR NOT can_see_venue(t,b.venue_id) OR to_jsonb(b) IS DISTINCT FROM c.payload->'before' THEN RAISE EXCEPTION 'Bill changed — inspect it again'; END IF;
  PERFORM 1 FROM expense_bill_allocations WHERE tenant_id=t AND bill_id=b.id ORDER BY id FOR UPDATE;
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]'::jsonb) INTO ls FROM expense_bill_allocations x WHERE tenant_id=t AND bill_id=b.id;
  IF ls IS DISTINCT FROM c.payload->'lines_before' THEN RAISE EXCEPTION 'Allocations changed — inspect again'; END IF;
  FOR v IN SELECT DISTINCT ven.id FROM expense_bill_allocations x JOIN venues ven ON ven.tenant_id=t AND ven.name=x.venue WHERE x.tenant_id=t AND x.bill_id=b.id LOOP IF NOT can_see_venue(t,v) THEN RAISE EXCEPTION 'Allocation venue access required'; END IF; END LOOP;
  PERFORM finance_assert_open(t,b.bill_date);
  j:=approve_and_post_expense_bill(b.id);
  UPDATE bani_pending_actions SET status='confirmed',resolved_at=now(),payload=payload||jsonb_build_object('journal_entry_id',j,'confirmed_by',auth.uid()) WHERE id=a;
  RETURN jsonb_build_object('ok',true,'bills_changed',true,'message','Bill approved and posted — no payment made.','link',c.payload->>'link','undo_available',false);
 ELSE
  SELECT * INTO r FROM sales_receipt_intakes WHERE tenant_id=t AND id=(c.payload->>'record_id')::uuid FOR UPDATE;
  IF r.id IS NULL OR NOT can_see_venue(t,r.venue_id) OR to_jsonb(r) IS DISTINCT FROM c.payload->'before' THEN RAISE EXCEPTION 'Receipt changed — inspect again'; END IF;
  PERFORM resolve_sales_receipt_intake(r.id,c.payload->>'resolution');
  SELECT * INTO r FROM sales_receipt_intakes WHERE id=r.id;
  UPDATE bani_pending_actions SET status='confirmed',resolved_at=now(),payload=payload||jsonb_build_object('after',to_jsonb(r),'confirmed_by',auth.uid()) WHERE id=a;
  RETURN jsonb_build_object('ok',true,'receipts_changed',true,'message','Receipt review cleared — no sales recorded.','undo_available',true);
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.bani_operation_execute(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bani_operation_execute(uuid,uuid,text,text) TO authenticated;