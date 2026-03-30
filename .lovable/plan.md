

## Fix: Per-supplier cost calculations in Product Master display

### Problem
When two suppliers share the same `product_master` record (same Internal SKU), the `cost_per_stock_unit` and `cost_per_base_unit` values displayed are identical because they are stored on the shared `product_master` row. In reality, each supplier has a different `purchase_unit_cost` (e.g., Ming Kee at 165.00 vs ONGO at 150.00), so the derived costs should differ per row.

### Root Cause
In `flatRows` (ProductMasterTab.tsx ~line 100), `cost_per_stock_unit` and `cost_per_base_unit` are taken directly from `p.*` (the shared product_master record). These should be recalculated on-the-fly using each supplier's `purchase_unit_cost`.

### Solution
Compute `cost_per_stock_unit` and `cost_per_base_unit` dynamically per-supplier-row instead of reading the stored product_master values.

Formulas (from existing logic):
- `cost_per_stock_unit = purchase_unit_cost / stock_qty`
- `cost_per_base_unit = purchase_unit_cost / base_unit_qty`

### Changes

**File: `src/components/procurement/ProductMasterTab.tsx`**

1. In the `flatRows` builder (~line 93-104, supplier entry branch): Replace `cost_per_stock_unit: p.cost_per_stock_unit` and `cost_per_base_unit: p.cost_per_base_unit` with dynamically calculated values:
   - `cost_per_stock_unit = s.purchase_unit_cost / (p.stock_qty || 1)`
   - `cost_per_base_unit = s.purchase_unit_cost / (p.base_unit_qty || 1)`

2. In the no-supplier fallback branch (~line 106-116): Keep using `p.cost_per_stock_unit` and `p.cost_per_base_unit` as-is (or recalculate from `p.purchase_unit_cost`).

This is a display-only change — no database or hook modifications needed.

