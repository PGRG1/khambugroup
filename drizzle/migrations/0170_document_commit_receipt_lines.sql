-- Recording path for clients whose sales reports are set up line by line. Same guards as
-- document_commit_receipt (service role only, intake lock, permission, venue, independent read,
-- open period, no duplicate, not closed, balanced), but balance and verification work on the
-- client's own lines, resolved from its setup on the server. Saves the day and its lines; no
-- accounting entry (payments are set up later). KHAMBU-style clients cannot use it.
CREATE OR REPLACE FUNCTION public.document_commit_receipt_lines(p_intake uuid, p_verification jsonb, p_values jsonb, p_path text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  i public.sales_receipt_intakes%ROWTYPE; v public.venues%ROWTYPE; rid uuid; use_venue boolean;
  l record; k text; lid uuid; second numeric; n int := 0;
  total_line numeric; sales numeric; svc numeric := 0; disc numeric := 0; sub_line numeric;
  paid numeric := 0; tips numeric := 0; guests numeric := 0; orders numeric := 0; deferred numeric := 0; has_pay boolean := false;
  total numeric; subtotal numeric; d date;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Independent server verification required'; END IF;
  SELECT * INTO i FROM public.sales_receipt_intakes WHERE id = p_intake FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt intake missing'; END IF;
  IF i.status = 'posted' THEN RETURN jsonb_build_object('status','saved','recordId',i.posted_record_id,'journal','none'); END IF;
  IF NOT public.user_has_tenant(i.uploaded_by, i.tenant_id) OR NOT (public.has_role(i.uploaded_by,'admin') OR public.has_role(i.uploaded_by,'manager')) THEN
    RAISE EXCEPTION 'Receipt permission changed'; END IF;
  SELECT * INTO v FROM public.venues WHERE tenant_id = i.tenant_id AND name = p_values->>'venue';
  IF NOT FOUND OR NOT public.user_has_venue(i.uploaded_by, v.id) THEN RAISE EXCEPTION 'Venue unavailable'; END IF;
  IF p_verification IS NULL OR (p_verification->>'date') IS DISTINCT FROM (p_values->>'date') OR (p_verification->>'venue') IS DISTINCT FROM (p_values->>'venue') THEN
    RAISE EXCEPTION 'Independent date/venue verification required'; END IF;

  -- Only clients read line by line (a setup, none of it on fixed fields).
  IF NOT EXISTS (SELECT 1 FROM public.sales_report_lines WHERE tenant_id = i.tenant_id AND is_active)
     OR EXISTS (SELECT 1 FROM public.sales_report_lines WHERE tenant_id = i.tenant_id AND is_active AND legacy_field IS NOT NULL) THEN
    RAISE EXCEPTION 'This client is not set up line by line'; END IF;
  use_venue := EXISTS (SELECT 1 FROM public.sales_report_lines WHERE tenant_id = i.tenant_id AND venue_id = v.id AND is_active);

  -- Every line must be in the setup and agree with the independent read.
  FOR l IN SELECT btrim(x->>'printed') AS printed, NULLIF(x->>'amount','')::numeric AS amount
           FROM jsonb_array_elements(COALESCE(p_values->'lines','[]'::jsonb)) x LOOP
    CONTINUE WHEN l.amount IS NULL OR l.amount = 0;
    n := n + 1; IF n > 120 THEN RAISE EXCEPTION 'Too many lines'; END IF;
    k := NULL;
    SELECT s.kind INTO k FROM public.sales_report_lines s
     WHERE s.tenant_id = i.tenant_id AND s.is_active AND (CASE WHEN use_venue THEN s.venue_id = v.id ELSE s.venue_id IS NULL END)
       AND lower(btrim(s.printed_name)) = lower(l.printed);
    IF k IS NULL THEN RAISE EXCEPTION 'New line not in the setup: %', l.printed; END IF;
    second := NULL;
    SELECT NULLIF(y->>'amount','')::numeric INTO second FROM jsonb_array_elements(COALESCE(p_verification->'lines','[]'::jsonb)) y
     WHERE lower(btrim(y->>'printed')) = lower(l.printed) LIMIT 1;
    IF second IS NULL OR abs(abs(second) - abs(l.amount)) > 0.01 THEN RAISE EXCEPTION 'Independent amount verification disagrees: %', l.printed; END IF;
    CASE k
      WHEN 'total' THEN total_line := COALESCE(total_line, 0) + l.amount;
      WHEN 'subtotal' THEN sub_line := COALESCE(sub_line, 0) + l.amount;
      WHEN 'sales' THEN sales := COALESCE(sales, 0) + l.amount;
      WHEN 'service_charge' THEN svc := svc + l.amount;
      WHEN 'discount' THEN disc := disc + abs(l.amount);
      WHEN 'tip' THEN tips := tips + abs(l.amount);
      WHEN 'guests' THEN guests := guests + l.amount;
      WHEN 'orders' THEN orders := orders + l.amount;
      WHEN 'payment' THEN paid := paid + l.amount; has_pay := true;
      WHEN 'delivery' THEN paid := paid + l.amount; has_pay := true;
      WHEN 'voucher_used' THEN paid := paid + l.amount; deferred := deferred + abs(l.amount);
      WHEN 'deposit_used' THEN paid := paid + l.amount; deferred := deferred + abs(l.amount);
      WHEN 'voucher_sold' THEN deferred := deferred + abs(l.amount);
      WHEN 'deposit_taken' THEN deferred := deferred + abs(l.amount);
      ELSE NULL;
    END CASE;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_verification->'lines','[]'::jsonb)) y
             WHERE NULLIF(y->>'amount','')::numeric <> 0
               AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_values->'lines','[]'::jsonb)) x WHERE lower(btrim(x->>'printed')) = lower(btrim(y->>'printed')))) THEN
    RAISE EXCEPTION 'Independent read found a line that is not on the saved figures'; END IF;

  IF deferred > 0 THEN RAISE EXCEPTION 'Deferred revenue requires confirmation'; END IF;
  total := COALESCE(total_line, sales + svc - disc);
  subtotal := COALESCE(sub_line, total - svc + disc);
  IF total IS NULL OR total <= 0 OR NOT has_pay
     OR NOT (abs(paid - total) <= 0.01 OR abs(paid - tips - total) <= 0.01 OR abs(paid + tips - total) <= 0.01) THEN
    RAISE EXCEPTION 'Sales figures do not balance'; END IF;

  d := (p_values->>'date')::date;
  IF d > (now() AT TIME ZONE 'Asia/Hong_Kong')::date THEN RAISE EXCEPTION 'Future date cannot post'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('finance-period:' || i.tenant_id::text, 0));
  PERFORM public.finance_assert_open(i.tenant_id, d);
  IF EXISTS (SELECT 1 FROM public.sales_records WHERE tenant_id = i.tenant_id AND venue_id = v.id
             AND (date = p_values->>'date' OR (NULLIF(p_values->>'reportNumber','') IS NOT NULL AND report_number = p_values->>'reportNumber'))) THEN
    RAISE EXCEPTION 'Sales date/report already recorded'; END IF;
  IF EXISTS (SELECT 1 FROM public.venue_closures WHERE tenant_id = i.tenant_id AND venue_id = v.id AND date = d)
     OR EXISTS (SELECT 1 FROM public.venue_closure_rules WHERE tenant_id = i.tenant_id AND venue_id = v.id AND d >= start_date AND (end_date IS NULL OR d <= end_date)
                AND ((weekday IS NOT NULL AND weekday = extract(dow FROM d)) OR (weekday IS NULL AND end_date IS NOT NULL))) THEN
    RAISE EXCEPTION 'Venue marked closed'; END IF;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', i.uploaded_by, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', i.uploaded_by::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  rid := gen_random_uuid();
  INSERT INTO public.sales_records (id, tenant_id, date, day, venue, venue_id, report_number, orders, guests, subtotal, service_charge, discount, total_sales, card_tips, receipt_file_url, receipt_file_name)
  VALUES (rid, i.tenant_id, p_values->>'date', to_char(d, 'Dy'), v.name, v.id, COALESCE(p_values->>'reportNumber',''), round(orders)::int, round(guests)::int,
          subtotal, svc, -disc, total, -tips, p_path, i.source_name);
  INSERT INTO public.sales_record_lines (tenant_id, sales_record_id, venue_id, line_id, printed_name, amount, source)
  SELECT i.tenant_id, rid, v.id, s.id, s.printed_name, NULLIF(x->>'amount','')::numeric, 'receipt'
  FROM jsonb_array_elements(COALESCE(p_values->'lines','[]'::jsonb)) x
  JOIN public.sales_report_lines s ON s.tenant_id = i.tenant_id AND s.is_active
   AND (CASE WHEN use_venue THEN s.venue_id = v.id ELSE s.venue_id IS NULL END)
   AND lower(btrim(s.printed_name)) = lower(btrim(x->>'printed'))
  WHERE NULLIF(x->>'amount','')::numeric IS NOT NULL AND NULLIF(x->>'amount','')::numeric <> 0
  ON CONFLICT DO NOTHING;

  UPDATE public.sales_receipt_intakes SET status = 'posted', posted_record_id = rid, verification = p_verification, reasons = '[]', tentative_values = p_values WHERE id = i.id;
  INSERT INTO public.audit_log (tenant_id, user_id, action, entity_type, entity_id, details)
  VALUES (i.tenant_id, i.uploaded_by, 'document_posted', 'sales_records', rid::text,
          jsonb_build_object('intake', i.id, 'verified', 'independent_read', 'lines', n, 'accounting', 'pending payments setup'));
  RETURN jsonb_build_object('status', 'saved', 'recordId', rid, 'journal', 'none');
END $$;
REVOKE ALL ON FUNCTION public.document_commit_receipt_lines(uuid, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.document_commit_receipt_lines(uuid, jsonb, jsonb, text) TO service_role;