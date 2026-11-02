DO $do$ DECLARE s text:=pg_get_functiondef('public.finance_schedule_approve(uuid,uuid,date)'::regprocedure); a text:=$a$SELECT md5(to_jsonb(i)::text) INTO checkstamp FROM invoices i WHERE$a$; b text:=$b$SELECT md5(to_jsonb(i)::text) INTO checkstamp FROM expense_bills i WHERE$b$; BEGIN
 IF position(a in s)=0 OR position(b in s)=0 THEN RAISE EXCEPTION 'approval alias patch missing'; END IF;
 s:=replace(s,a,$x$SELECT md5(to_jsonb(src_doc)::text) INTO checkstamp FROM invoices src_doc WHERE$x$);
 s:=replace(s,b,$y$SELECT md5(to_jsonb(src_doc)::text) INTO checkstamp FROM expense_bills src_doc WHERE$y$);
 EXECUTE s; END $do$;