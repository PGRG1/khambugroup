CREATE OR REPLACE FUNCTION public.journal_line_fx_from_source()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE e record; c text; r numeric; b text;
BEGIN
 IF NEW.currency IS NOT NULL THEN RETURN NEW; END IF;
 SELECT source_type,source_id,tenant_id INTO e FROM journal_entries WHERE id=NEW.entry_id;
 IF e.source_id IS NULL THEN RETURN NEW; END IF;
 IF e.source_type='expense_bill' THEN SELECT currency,fx_rate INTO c,r FROM expense_bills WHERE id::text=e.source_id;
 ELSIF e.source_type='invoice' THEN SELECT currency,fx_rate INTO c,r FROM invoices WHERE id::text=e.source_id;
 ELSE RETURN NEW; END IF;
 SELECT coalesce(base_currency,'HKD') INTO b FROM tenants WHERE id=e.tenant_id;
 IF c IS NULL OR c=b OR coalesce(r,0)<=0 THEN RETURN NEW; END IF;
 NEW.currency:=c; NEW.fx_rate:=r; NEW.original_amount:=round((coalesce(NEW.debit,0)-coalesce(NEW.credit,0))/r,6);
 RETURN NEW; END $function$;