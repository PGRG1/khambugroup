CREATE OR REPLACE FUNCTION public.create_scanner_invoice_with_attachments(
  p_tenant_id uuid,
  p_invoice jsonb,
  p_line_items jsonb,
  p_attachments jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid := gen_random_uuid();
  v_file_url text;
  v_file_name text;
  v_invoice_number text := NULLIF(btrim(p_invoice->>'invoice_number'), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;
  IF p_tenant_id IS NULL OR NOT public.user_has_tenant(v_uid, p_tenant_id) THEN
    RAISE EXCEPTION 'Not authorised for this tenant.';
  END IF;
  IF p_attachments IS NULL
     OR jsonb_typeof(p_attachments) <> 'array'
     OR jsonb_array_length(p_attachments) = 0 THEN
    RAISE EXCEPTION 'A scanned invoice requires at least one durable source attachment.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_attachments) x
     WHERE COALESCE(btrim(x->>'path'), '') = ''
        OR x->>'path' NOT LIKE (p_tenant_id::text || '/%')
  ) THEN
    RAISE EXCEPTION 'Attachment path is outside this tenant folder.';
  END IF;

  SELECT string_agg(x->>'path', ',' ORDER BY COALESCE((x->>'sort_order')::int, 0)),
         string_agg(COALESCE(x->>'original_name', x->>'path'), ', ' ORDER BY COALESCE((x->>'sort_order')::int, 0))
    INTO v_file_url, v_file_name
    FROM jsonb_array_elements(p_attachments) x;

  INSERT INTO public.invoices (
    id,
    supplier_id,
    supplier_account_id,
    venue,
    venue_id,
    legacy_venue_name,
    invoice_number,
    invoice_date,
    due_date,
    status,
    subtotal,
    tax_amount,
    total_amount,
    discount,
    discount_type,
    notes,
    entered_by,
    file_url,
    file_name,
    received_date,
    payment_status,
    payment_method,
    dispute_notes,
    review_status,
    exception_note,
    ai_suggestions,
    ai_anomaly,
    ai_extract_meta,
    tenant_id,
    discount_mode,
    discount_rate,
    has_disputes,
    disputed_amount,
    source_origin
  ) VALUES (
    v_id,
    (p_invoice->>'supplier_id')::uuid,
    NULLIF(p_invoice->>'supplier_account_id', '')::uuid,
    p_invoice->>'venue',
    NULLIF(p_invoice->>'venue_id', '')::uuid,
    p_invoice->>'legacy_venue_name',
    v_invoice_number,
    (p_invoice->>'invoice_date')::date,
    NULLIF(p_invoice->>'due_date', '')::date,
    COALESCE(NULLIF(p_invoice->>'status', ''), 'unpaid'),
    COALESCE((p_invoice->>'subtotal')::numeric, 0),
    COALESCE((p_invoice->>'tax_amount')::numeric, 0),
    COALESCE((p_invoice->>'total_amount')::numeric, 0),
    COALESCE((p_invoice->>'discount')::numeric, 0),
    COALESCE(NULLIF(p_invoice->>'discount_type', ''), 'discount'),
    p_invoice->>'notes',
    v_uid,
    v_file_url,
    v_file_name,
    NULLIF(p_invoice->>'received_date', '')::date,
    COALESCE(NULLIF(p_invoice->>'payment_status', ''), 'unpaid'),
    p_invoice->>'payment_method',
    p_invoice->>'dispute_notes',
    COALESCE(NULLIF(p_invoice->>'review_status', ''), 'Under Review'),
    COALESCE(NULLIF(p_invoice->>'exception_note', ''), '-'),
    p_invoice->'ai_suggestions',
    p_invoice->'ai_anomaly',
    p_invoice->'ai_extract_meta',
    p_tenant_id,
    COALESCE(NULLIF(p_invoice->>'discount_mode', ''), 'fixed'),
    COALESCE((p_invoice->>'discount_rate')::numeric, 0),
    COALESCE((p_invoice->>'has_disputes')::boolean, false),
    COALESCE((p_invoice->>'disputed_amount')::numeric, 0),
    'scanner'
  );

  IF p_line_items IS NOT NULL AND jsonb_typeof(p_line_items) = 'array'
     AND jsonb_array_length(p_line_items) > 0 THEN
    INSERT INTO public.invoice_line_items
    SELECT (r).*
    FROM (
      SELECT jsonb_populate_record(
               NULL::public.invoice_line_items,
               x || jsonb_build_object('invoice_id', v_id, 'tenant_id', p_tenant_id)
             ) AS r
      FROM jsonb_array_elements(p_line_items) x
    ) s;
  END IF;

  INSERT INTO public.invoice_attachments
    (tenant_id, invoice_id, bucket, path, original_name, mime_type, size_bytes, checksum, sort_order, attached_by, attached_at)
  SELECT p_tenant_id, v_id,
         COALESCE(x->>'bucket', 'invoice-files'),
         x->>'path',
         COALESCE(x->>'original_name', x->>'path'),
         COALESCE(x->>'mime_type', 'application/octet-stream'),
         COALESCE((x->>'size_bytes')::bigint, 0),
         x->>'checksum',
         COALESCE((x->>'sort_order')::int, 0),
         v_uid, now()
  FROM jsonb_array_elements(p_attachments) x
  ORDER BY COALESCE((x->>'sort_order')::int, 0);

  INSERT INTO public.audit_log (tenant_id, user_id, user_display_name, action, entity_type, entity_id, details)
  SELECT p_tenant_id, v_uid,
         COALESCE((SELECT display_name FROM public.profiles WHERE user_id = v_uid), 'Unknown'),
         'attachment_link', 'invoice', v_id::text,
         jsonb_build_object('reason', 'scanner', 'invoice_number', v_invoice_number, 'attachments', p_attachments);

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_scanner_invoice_with_attachments(uuid, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_scanner_invoice_with_attachments(uuid, jsonb, jsonb, jsonb) TO authenticated;