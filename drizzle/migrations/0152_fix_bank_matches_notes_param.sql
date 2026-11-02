DO $do$ DECLARE s text:=pg_get_functiondef('public.finance_confirm_bank_matches(uuid,uuid,jsonb,text)'::regprocedure); BEGIN
 IF position('left(notes,3000)' in s)=0 THEN RAISE EXCEPTION 'notes patch missing'; END IF;
 s:=replace(s,'left(notes,3000)','left(finance_confirm_bank_matches.notes,3000)');
 EXECUTE s; END $do$;