DO $m$
DECLARE d text := pg_get_functiondef('public.create_scanner_invoice_with_attachments'::regproc);
BEGIN
 IF position('original_unit_price' in d) > 0 THEN RETURN; END IF;
 IF position('scanned_description, scanned_item_code, printed_amount, source_line_no' in d)=0 OR position($q$NULLIF(x->>'source_line_no', '')$q$ in d)=0 THEN RAISE EXCEPTION 'scanner invoice function anchor not found'; END IF;
 d := replace(d,'scanned_description, scanned_item_code, printed_amount, source_line_no','scanned_description, scanned_item_code, printed_amount, source_line_no, original_unit_price, original_total');
 d := replace(d,$q$NULLIF(x->>'source_line_no', '')$q$,$q$NULLIF(x->>'source_line_no', ''),
      NULLIF(x->>'original_unit_price', '')::numeric,
      NULLIF(x->>'original_total', '')::numeric$q$);
 EXECUTE d;
END $m$;