CREATE OR REPLACE FUNCTION public.settlement_clearing_venue(t uuid,b uuid,line_venue text) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE m public.payment_processor_merchants%ROWTYPE;v text; BEGIN SELECT mm.* INTO m FROM public.payment_processor_merchants mm JOIN public.payment_settlement_batches bb ON bb.merchant_id=mm.id AND bb.tenant_id=mm.tenant_id WHERE bb.id=b AND bb.tenant_id=t; IF NOT FOUND THEN RAISE EXCEPTION 'Settlement merchant missing';END IF;v:=coalesce(nullif(line_venue,''),m.venue);IF v IS NULL OR (m.venue IS NOT NULL AND v<>m.venue) OR (m.venue IS NULL AND NOT(v=ANY(coalesce(m.shared_venues,ARRAY[]::text[])))) THEN RAISE EXCEPTION 'Shared merchant requires explicit batch venue lines';END IF;RETURN v;END $$;
REVOKE ALL ON FUNCTION public.settlement_clearing_venue(uuid,uuid,text) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.settlement_clearing_venue(uuid,uuid,text) TO authenticated,service_role;
DO $patch$ DECLARE def text;old text;replacement text;BEGIN
SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE oid='public._rebuild_journal_from_operations_impl(uuid,uuid,text)'::regprocedure;
old:='    acc_clearing := NULL;
    SELECT account_id INTO acc_clearing FROM public.account_mapping_rules
      WHERE tenant_id=p_tenant_id AND rule_type=''payment_settlement_clearing'' AND match_key=sb.merchant_venue LIMIT 1;';
IF position(old in def)=0 THEN
old:=substring(def from '    acc_clearing := NULL;\n    SELECT account_id INTO acc_clearing FROM public.account_mapping_rules\n      WHERE tenant_id=p_tenant_id AND rule_type=''payment_settlement_clearing''[^;]+;');
END IF;
IF old IS NULL THEN RAISE EXCEPTION 'Settlement clearing anchor not found';END IF;
replacement:='    IF EXISTS(SELECT 1 FROM public.payment_settlement_lines l WHERE l.batch_id=sb.id AND l.tenant_id=p_tenant_id AND coalesce(nullif(l.venue,''''),sb.merchant_venue) IS NULL) THEN
      INSERT INTO public.ledger_audit_log(event_type,user_id,user_display_name,status,notes,tenant_id) VALUES(''settlement_clearing_skipped'',v_uid,v_uname,''skipped'',''Shared merchant needs explicit batch venue lines: ''||sb.id,p_tenant_id); CONTINUE;
    END IF;
    PERFORM public.settlement_clearing_venue(p_tenant_id,sb.id,l.venue) FROM public.payment_settlement_lines l WHERE l.batch_id=sb.id AND l.tenant_id=p_tenant_id;
    IF EXISTS(SELECT 1 FROM public.payment_settlement_lines l WHERE l.batch_id=sb.id AND l.tenant_id=p_tenant_id AND NOT EXISTS(SELECT 1 FROM public.account_mapping_rules a WHERE a.tenant_id=p_tenant_id AND a.rule_type=''payment_settlement_clearing'' AND a.match_key=public.settlement_clearing_venue(p_tenant_id,sb.id,l.venue))) THEN RAISE EXCEPTION ''Venue clearing mapping missing'';END IF;
    acc_clearing:=NULL;';
def:=replace(def,old,replacement);
def:=replace(def,'    IF acc_clearing IS NOT NULL THEN
      FOR sl IN
        SELECT l.gross_amount AS amount, l.payment_type AS payment_method','    IF EXISTS(SELECT 1 FROM public.payment_settlement_lines WHERE batch_id=sb.id AND tenant_id=p_tenant_id) THEN
      FOR sl IN
        SELECT public.settlement_clearing_venue(p_tenant_id,sb.id,l.venue) AS clearing_venue, l.gross_amount AS amount, l.payment_type AS payment_method');
def:=replace(def,'        v_pm_key := lower(COALESCE(sl.payment_method,''''));','        SELECT account_id INTO acc_clearing FROM public.account_mapping_rules WHERE tenant_id=p_tenant_id AND rule_type=''payment_settlement_clearing'' AND match_key=sl.clearing_venue LIMIT 1;
        v_pm_key := lower(COALESCE(sl.payment_method,''''));');
def:=replace(def,'                  sb.merchant_venue, v_ln,
                  COALESCE(v_labels','                  sl.clearing_venue, v_ln,
                  COALESCE(v_labels');
def:=replace(def,'''payment_settlement_clearing'', sb.merchant_venue, ''mapped''','''payment_settlement_clearing'', sl.clearing_venue, ''mapped''');
EXECUTE def;END $patch$;