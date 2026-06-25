CREATE OR REPLACE FUNCTION public.sync_grn_from_invoice(_invoice_id uuid, _tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _grn_id uuid;
  _disputed boolean := false;
  _inserted integer := 0;
BEGIN
  IF _invoice_id IS NULL OR _tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing invoiceId or tenantId');
  END IF;

  IF NOT (public.is_super_admin(auth.uid()) OR public.user_has_tenant(auth.uid(), _tenant_id)) THEN
    RAISE EXCEPTION 'Not authorized to sync GRN for this tenant';
  END IF;

  SELECT id INTO _grn_id
  FROM public.goods_received_notes
  WHERE invoice_id = _invoice_id
    AND tenant_id = _tenant_id
  LIMIT 1;

  IF _grn_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'No GRN exists for invoice');
  END IF;

  DELETE FROM public.grn_items
  WHERE grn_id = _grn_id
    AND tenant_id = _tenant_id;

  INSERT INTO public.grn_items (
    grn_id,
    invoice_line_item_id,
    product_master_id,
    description,
    quantity_invoiced,
    quantity_received,
    accepted_qty,
    accepted_price,
    qty_difference,
    unit,
    unit_cost,
    receiving_reason,
    receiving_note,
    tenant_id
  )
  SELECT
    _grn_id,
    li.id,
    li.product_master_id,
    COALESCE(NULLIF(li.description, ''), '(no description)'),
    COALESCE(li.quantity, 0),
    COALESCE(li.accepted_qty, li.quantity, 0),
    COALESCE(li.accepted_qty, li.quantity, 0),
    CASE
      WHEN COALESCE(li.accepted_price, 0) > 0 THEN li.accepted_price
      WHEN COALESCE(li.net_unit_cost, 0) > 0 THEN li.net_unit_cost
      ELSE COALESCE(li.unit_price, 0)
    END,
    COALESCE(li.accepted_qty, li.quantity, 0) - COALESCE(li.quantity, 0),
    COALESCE(NULLIF(li.unit, ''), 'each'),
    CASE
      WHEN COALESCE(li.net_unit_cost, 0) > 0 THEN li.net_unit_cost
      WHEN COALESCE(li.accepted_price, 0) > 0 THEN li.accepted_price
      ELSE COALESCE(li.unit_price, 0)
    END,
    li.receiving_reason,
    li.receiving_note,
    _tenant_id
  FROM public.invoice_line_items li
  LEFT JOIN public.product_master pm
    ON pm.id = li.product_master_id
   AND pm.tenant_id = li.tenant_id
  WHERE li.invoice_id = _invoice_id
    AND li.tenant_id = _tenant_id
    AND COALESCE(pm.creates_stock_movement, true) IS DISTINCT FROM false;

  GET DIAGNOSTICS _inserted = ROW_COUNT;

  SELECT EXISTS (
    SELECT 1
    FROM public.invoice_line_items li
    WHERE li.invoice_id = _invoice_id
      AND li.tenant_id = _tenant_id
      AND COALESCE(li.accepted_qty, li.quantity, 0) <> COALESCE(li.quantity, 0)
  ) INTO _disputed;

  UPDATE public.goods_received_notes
  SET status = CASE WHEN _disputed THEN 'disputed' ELSE 'confirmed' END
  WHERE id = _grn_id
    AND tenant_id = _tenant_id;

  RETURN jsonb_build_object('ok', true, 'grn_id', _grn_id, 'inserted', _inserted, 'disputed', _disputed);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_grn_from_invoice(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_grn_from_invoice(uuid, uuid) TO service_role;