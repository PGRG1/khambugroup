DO $$ DECLARE d text;BEGIN
SELECT pg_get_functiondef('public._rebuild_journal_from_operations_impl(uuid,uuid,text)'::regprocedure) INTO d;
d:=replace(d,'WHERE bt.tenant_id = p_tenant_id','WHERE bt.tenant_id = p_tenant_id AND (coalesce(bt.is_manual,false) OR EXISTS(SELECT 1 FROM public.bani_accounting_reviews ar WHERE ar.tenant_id=p_tenant_id AND ar.source_type=''bank_transaction'' AND ar.source_id=bt.id AND ar.status=''posted''))');EXECUTE d;
END $$;
CREATE OR REPLACE FUNCTION public.bani_accounting_paused_enqueue() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NEW.status='queued' AND EXISTS(SELECT 1 FROM bani_accounting_settings WHERE tenant_id=NEW.tenant_id AND paused_reason IS NOT NULL) THEN NEW.status:='asked';NEW.reasons:='["Bani couldn''t check this (AI unavailable)"]';NEW.checked_at:=now();END IF;RETURN NEW;END $$;
CREATE TRIGGER bani_queue_pause_guard BEFORE INSERT OR UPDATE ON public.bani_accounting_reviews FOR EACH ROW EXECUTE FUNCTION public.bani_accounting_paused_enqueue();