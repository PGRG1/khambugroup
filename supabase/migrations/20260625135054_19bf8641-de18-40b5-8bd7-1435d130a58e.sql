DO $$
DECLARE
  r record;
  _grn_id uuid;
  _disputed boolean;
BEGIN
  FOR r IN
    SELECT DISTINCT g.invoice_id, g.tenant_id
    FROM goods_received_notes g
    WHERE g.invoice_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM grn_items gi WHERE gi.grn_id = g.id AND gi.invoice_line_item_id IS NULL)
      AND EXISTS (SELECT 1 FROM grn_items gi WHERE gi.grn_id = g.id)
  LOOP
    SELECT id INTO _grn_id FROM goods_received_notes
      WHERE invoice_id = r.invoice_id AND tenant_id = r.tenant_id LIMIT 1;
    IF _grn_id IS NULL THEN CONTINUE; END IF;

    DELETE FROM grn_items WHERE grn_id = _grn_id AND tenant_id = r.tenant_id;

    INSERT INTO grn_items (
      grn_id, invoice_line_item_id, product_master_id, description,
      quantity_invoiced, quantity_received, accepted_qty, accepted_price,
      qty_difference, unit, unit_cost, receiving_reason, receiving_note, tenant_id
    )
    SELECT
      _grn_id, li.id, li.product_master_id,
      COALESCE(NULLIF(li.description,''),'(no description)'),
      COALESCE(li.quantity,0),
      COALESCE(li.accepted_qty, li.quantity, 0),
      COALESCE(li.accepted_qty, li.quantity, 0),
      CASE WHEN COALESCE(li.accepted_price,0)>0 THEN li.accepted_price
           WHEN COALESCE(li.net_unit_cost,0)>0 THEN li.net_unit_cost
           ELSE COALESCE(li.unit_price,0) END,
      COALESCE(li.accepted_qty, li.quantity, 0) - COALESCE(li.quantity, 0),
      COALESCE(NULLIF(li.unit,''),'each'),
      CASE WHEN COALESCE(li.net_unit_cost,0)>0 THEN li.net_unit_cost
           WHEN COALESCE(li.accepted_price,0)>0 THEN li.accepted_price
           ELSE COALESCE(li.unit_price,0) END,
      li.receiving_reason, li.receiving_note, r.tenant_id
    FROM invoice_line_items li
    LEFT JOIN product_master pm ON pm.id = li.product_master_id AND pm.tenant_id = li.tenant_id
    WHERE li.invoice_id = r.invoice_id
      AND li.tenant_id = r.tenant_id
      AND COALESCE(pm.creates_stock_movement, true) IS DISTINCT FROM false;

    SELECT EXISTS (
      SELECT 1 FROM invoice_line_items li
      WHERE li.invoice_id = r.invoice_id AND li.tenant_id = r.tenant_id
        AND COALESCE(li.accepted_qty, li.quantity, 0) <> COALESCE(li.quantity, 0)
    ) INTO _disputed;

    UPDATE goods_received_notes
      SET status = CASE WHEN _disputed THEN 'disputed' ELSE 'confirmed' END
      WHERE id = _grn_id AND tenant_id = r.tenant_id;
  END LOOP;
END $$;