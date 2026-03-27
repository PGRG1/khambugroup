

## Fix Product Master CSV Download

### Problem
The CSV download maps data fields to different keys than what the `columns` array defines, causing mismatched headers and empty columns:

- CSV uses `recipe_uom` but columns define `base_unit_type`
- CSV uses `recipe_qty` but columns define `base_unit_qty`  
- CSV uses `cost_per_recipe_unit` but columns define `cost_per_base_unit`
- CSV includes `notes` but columns array has no `notes` entry (so no header match)

### Fix
Update the `downloadCSV` call (line 306-315) to use the same keys as the `columns` definition, so the CSV columns match the table exactly.

**File**: `src/components/procurement/ProductMasterTab.tsx` (lines 306-315)

Change the data mapping to use matching keys:
```typescript
downloadCSV(filtered.map(r => ({
  internal_sku: r.internal_sku,
  external_sku: r.external_sku,
  internal_product_name: r.internal_product_name,
  supplier_product_name: r.supplier_product_name,
  level1_category: r.level1_category,
  level2_category: r.level2_category,
  level3_category: r.level3_category,
  purchase_unit: r.purchase_unit,
  purchase_unit_cost: r.purchase_unit_cost.toFixed(2),
  stock_uom: r.stock_uom,
  stock_qty: r.stock_qty,
  cost_per_stock_unit: r.cost_per_stock_unit.toFixed(4),
  base_unit_type: r.base_unit_type,
  base_unit_qty: r.base_unit_qty,
  cost_per_base_unit: r.cost_per_base_unit.toFixed(4),
  supplier: r.supplier,
  status: r.status,
})), columns.map(c => ({ key: c.key, label: c.label })), "product_master")
```

This ensures every CSV column header matches its data key, and the exported file mirrors the on-screen table exactly.

