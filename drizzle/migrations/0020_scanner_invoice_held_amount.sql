DO $do$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.create_scanner_invoice_with_attachments(uuid,jsonb,jsonb,jsonb)'::regprocedure) INTO d;
  IF position('held_amount' in d) = 0 THEN
    d := replace(d, 'has_disputes, disputed_amount, source_origin', 'has_disputes, disputed_amount, held_amount, source_origin');
    d := replace(d, E'COALESCE((p_invoice->>''disputed_amount'')::numeric, 0),\n    ''scanner''', E'COALESCE((p_invoice->>''disputed_amount'')::numeric, 0),\n    GREATEST(COALESCE(NULLIF(p_invoice->>''held_amount'', '''')::numeric, 0), 0),\n    ''scanner''');
    IF position('held_amount' in d) = 0 OR position('GREATEST(COALESCE(NULLIF(p_invoice' in d) = 0 THEN
      RAISE EXCEPTION 'Could not patch create_scanner_invoice_with_attachments';
    END IF;
    EXECUTE d;
  END IF;
END
$do$;