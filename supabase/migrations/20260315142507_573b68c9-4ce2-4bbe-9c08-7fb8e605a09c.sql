
UPDATE invoice_line_items li
SET description = pm.supplier_product_name
FROM product_master pm
WHERE li.product_master_id = pm.id
  AND pm.supplier_product_name IS NOT NULL
  AND pm.supplier_product_name != '';
