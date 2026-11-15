CREATE OR REPLACE FUNCTION public.map_new_sales_line(p_intake uuid, p_printed text, p_kind text, p_category text DEFAULT NULL, p_settles_to text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.sales_receipt_intakes%ROWTYPE; scope uuid; existing uuid; new_id uuid; name text;
BEGIN
  SELECT * INTO i FROM public.sales_receipt_intakes WHERE id = p_intake;
  IF NOT FOUND OR i.status <> 'needs_review' THEN RAISE EXCEPTION 'This report is no longer waiting'; END IF;
  IF NOT (public.is_platform_admin() OR (public.access_level(i.tenant_id, 'revenue') >= 2 AND i.venue_id IS NOT NULL AND public.can_see_venue(i.tenant_id, i.venue_id))) THEN
    RAISE EXCEPTION 'Only managers of this venue can answer this'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sales_report_lines WHERE tenant_id = i.tenant_id AND is_active)
     OR EXISTS (SELECT 1 FROM public.sales_report_lines WHERE tenant_id = i.tenant_id AND is_active AND legacy_field IS NOT NULL) THEN
    RAISE EXCEPTION 'This client is not set up line by line'; END IF;
  -- Only a line that is actually printed on this held report, stored exactly as printed.
  SELECT btrim(x->>'printed') INTO name
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(i.tentative_values->'lines') = 'array' THEN i.tentative_values->'lines' ELSE '[]'::jsonb END) x
   WHERE lower(btrim(x->>'printed')) = lower(btrim(coalesce(p_printed, ''))) AND btrim(x->>'printed') <> '' LIMIT 1;
  IF name IS NULL THEN RAISE EXCEPTION 'That line is not on this report'; END IF;
  IF p_kind = 'sales' AND p_category IS NULL THEN RAISE EXCEPTION 'Choose a sales group'; END IF;
  -- Same scope the reader uses: the venue's own setup when it has one, otherwise all venues.
  scope := CASE WHEN EXISTS (SELECT 1 FROM public.sales_report_lines WHERE tenant_id = i.tenant_id AND venue_id = i.venue_id AND is_active) THEN i.venue_id END;
  SELECT id INTO existing FROM public.sales_report_lines
   WHERE tenant_id = i.tenant_id AND is_active AND venue_id IS NOT DISTINCT FROM scope AND lower(btrim(printed_name)) = lower(name);
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  INSERT INTO public.sales_report_lines (tenant_id, venue_id, printed_name, kind, category, settles_to, sort_order, is_active, created_by)
  VALUES (i.tenant_id, scope, name, p_kind, CASE WHEN p_kind = 'sales' THEN p_category END, CASE WHEN p_kind = 'payment' THEN coalesce(p_settles_to, 'bank') END,
          coalesce((SELECT max(sort_order) + 1 FROM public.sales_report_lines WHERE tenant_id = i.tenant_id), 1), true, auth.uid())
  RETURNING id INTO new_id;
  INSERT INTO public.audit_log (tenant_id, user_id, action, entity_type, entity_id, details)
  VALUES (i.tenant_id, auth.uid(), 'sales_line_mapped', 'sales_report_lines', new_id::text,
          jsonb_build_object('intake', i.id, 'printed', name, 'kind', p_kind, 'category', p_category, 'settles_to', p_settles_to));
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.map_new_sales_line(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.map_new_sales_line(uuid, text, text, text, text) TO authenticated;