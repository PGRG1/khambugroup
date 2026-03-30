ALTER TABLE product_suppliers
  ADD COLUMN IF NOT EXISTS stock_uom text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS stock_qty numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS base_unit_type text NOT NULL DEFAULT 'g',
  ADD COLUMN IF NOT EXISTS base_unit_qty numeric NOT NULL DEFAULT 1;

UPDATE product_suppliers ps
SET stock_uom = pm.stock_uom,
    stock_qty = pm.stock_qty,
    base_unit_type = pm.base_unit_type,
    base_unit_qty = pm.base_unit_qty
FROM product_master pm
WHERE ps.product_master_id = pm.id;