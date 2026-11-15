-- Type in or fix a day for a client set up line by line: the amounts of its own report lines.
-- The day's usual figures (total, guests, service charge...) come from the lines, so every Revenue
-- page works unchanged. No accounting entry (payments are set up later). KHAMBU-style setups and
-- gift card / deposit lines are refused. Access uses access_level / can_see_venue only.
CREATE OR REPLACE FUNCTION public.save_sales_day_lines(p_tenant uuid, p_record uuid, p_venue uuid, p_date text, p_report text, p_lines jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.venues%ROWTYPE; v_old public.sales_records%ROWTYPE; rid uuid; use_venue boolean; d date; n int := 0;
  l record; k text; v_total_line numeric; v_sub_line numeric; v_sales numeric; v_svc numeric := 0; v_disc numeric := 0; v_tips numeric := 0;
  v_guests numeric := 0; v_orders numeric := 0; v_total numeric; v_subtotal numeric; v_before jsonb;
BEGIN
  IF p_record IS NOT NULL THEN
    SELECT * INTO v_old FROM public.sales_records WHERE id = p_record AND tenant_id = p_tenant FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'That sales day was not found'; END IF;
    IF v_old.deferred_feed THEN RAISE EXCEPTION 'This day has gift card or deposit figures; it waits for the payments setup'; END IF;
    p_venue := v_old.venue_id;
  END IF;
  SELECT * INTO v FROM public.venues WHERE id = p_venue AND tenant_id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose a venue'; END IF;
  IF public.access_level(p_tenant, 'revenue') < 2 OR NOT public.can_see_venue(p_tenant, v.id) THEN
    RAISE EXCEPTION 'Only managers of this venue can enter sales'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sales_report_lines WHERE tenant_id = p_tenant AND is_active)
     OR EXISTS (SELECT 1 FROM public.sales_report_lines WHERE tenant_id = p_tenant AND is_active AND legacy_field IS NOT NULL) THEN
    RAISE EXCEPTION 'This client is not set up line by line'; END IF;
  IF p_date !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Choose a date'; END IF;
  d := p_date::date;
  IF d > (now() AT TIME ZONE 'Asia/Hong_Kong')::date THEN RAISE EXCEPTION 'Sales cannot be entered for a future date'; END IF;
  use_venue := EXISTS (SELECT 1 FROM public.sales_report_lines WHERE tenant_id = p_tenant AND venue_id = v.id AND is_active);

  -- Every line must be in this venue's setup.
  FOR l IN SELECT btrim(x->>'printed') AS printed, NULLIF(x->>'amount','')::numeric AS amount
           FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_lines) = 'array' THEN p_lines ELSE '[]'::jsonb END) x LOOP
    CONTINUE WHEN l.amount IS NULL OR l.amount = 0;
    n := n + 1; IF n > 120 THEN RAISE EXCEPTION 'Too many lines'; END IF;
    k := NULL;
    SELECT s.kind INTO k FROM public.sales_report_lines s
     WHERE s.tenant_id = p_tenant AND s.is_active AND (CASE WHEN use_venue THEN s.venue_id = v.id ELSE s.venue_id IS NULL END)
       AND lower(btrim(s.printed_name)) = lower(l.printed);
    IF k IS NULL THEN RAISE EXCEPTION 'Not in the sales report setup: %', l.printed; END IF;
    CASE k
      WHEN 'total' THEN v_total_line := COALESCE(v_total_line, 0) + l.amount;
      WHEN 'subtotal' THEN v_sub_line := COALESCE(v_sub_line, 0) + l.amount;
      WHEN 'sales' THEN v_sales := COALESCE(v_sales, 0) + l.amount;
      WHEN 'service_charge' THEN v_svc := v_svc + l.amount;
      WHEN 'discount' THEN v_disc := v_disc + abs(l.amount);
      WHEN 'tip' THEN v_tips := v_tips + abs(l.amount);
      WHEN 'guests' THEN v_guests := v_guests + l.amount;
      WHEN 'orders' THEN v_orders := v_orders + l.amount;
      WHEN 'voucher_sold', 'voucher_used', 'deposit_taken', 'deposit_used' THEN
        RAISE EXCEPTION 'Gift card and deposit days wait for the payments setup';
      ELSE NULL;
    END CASE;
  END LOOP;
  v_total := COALESCE(v_total_line, v_sales + v_svc - v_disc);
  v_subtotal := COALESCE(v_sub_line, v_total - v_svc + v_disc);
  IF v_total IS NULL OR v_total <= 0 THEN RAISE EXCEPTION 'Enter the total, or the sales lines'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('finance-period:' || p_tenant::text, 0));
  PERFORM public.finance_assert_open(p_tenant, d);
  IF p_record IS NOT NULL AND v_old.date IS DISTINCT FROM p_date THEN PERFORM public.finance_assert_open(p_tenant, v_old.date::date); END IF;
  IF EXISTS (SELECT 1 FROM public.sales_records WHERE tenant_id = p_tenant AND venue_id = v.id AND date = p_date AND id IS DISTINCT FROM p_record) THEN
    RAISE EXCEPTION 'Sales are already recorded for % on %', v.name, p_date; END IF;

  IF p_record IS NULL THEN
    rid := gen_random_uuid();
    INSERT INTO public.sales_records (id, tenant_id, date, day, venue, venue_id, report_number, orders, guests, subtotal, service_charge, discount, total_sales, card_tips)
    VALUES (rid, p_tenant, p_date, to_char(d, 'Dy'), v.name, v.id, COALESCE(btrim(p_report), ''), round(v_orders)::int, round(v_guests)::int, v_subtotal, v_svc, -v_disc, v_total, -v_tips);
  ELSE
    rid := p_record;
    SELECT jsonb_agg(jsonb_build_object('printed', printed_name, 'amount', amount)) INTO v_before FROM public.sales_record_lines WHERE sales_record_id = rid;
    UPDATE public.sales_records SET date = p_date, day = to_char(d, 'Dy'), report_number = COALESCE(btrim(p_report), report_number), orders = round(v_orders)::int, guests = round(v_guests)::int,
      subtotal = v_subtotal, service_charge = v_svc, discount = -v_disc, total_sales = v_total, card_tips = -v_tips WHERE id = rid;
    DELETE FROM public.sales_record_lines WHERE sales_record_id = rid AND source <> 'fields';
  END IF;
  INSERT INTO public.sales_record_lines (tenant_id, sales_record_id, venue_id, line_id, printed_name, amount, source)
  SELECT p_tenant, rid, v.id, s.id, s.printed_name, NULLIF(x->>'amount','')::numeric, 'manual'
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_lines) = 'array' THEN p_lines ELSE '[]'::jsonb END) x
  JOIN public.sales_report_lines s ON s.tenant_id = p_tenant AND s.is_active
   AND (CASE WHEN use_venue THEN s.venue_id = v.id ELSE s.venue_id IS NULL END)
   AND lower(btrim(s.printed_name)) = lower(btrim(x->>'printed'))
  WHERE NULLIF(x->>'amount','')::numeric IS NOT NULL AND NULLIF(x->>'amount','')::numeric <> 0;

  INSERT INTO public.audit_log (tenant_id, user_id, action, entity_type, entity_id, details)
  VALUES (p_tenant, auth.uid(), CASE WHEN p_record IS NULL THEN 'sales_day_entered' ELSE 'sales_day_fixed' END, 'sales_records', rid::text,
          jsonb_build_object('venue', v.name, 'date', p_date, 'lines', p_lines, 'before', v_before, 'accounting', 'pending payments setup'));
  RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.save_sales_day_lines(uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_sales_day_lines(uuid, uuid, uuid, text, text, jsonb) TO authenticated;