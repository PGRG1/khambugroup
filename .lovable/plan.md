

## Plan: Base Unit Costing for Product Master + Menu Costing Updates

### 1. Database Migration — Add base unit fields to `product_master`

Add 4 new columns:

| Column | Type | Default |
|--------|------|---------|
| `purchase_unit` | text | `''` |
| `purchase_unit_cost` | numeric | `0` |
| `base_unit_type` | text | `'gms'` (one of: gms, mls, ea/pcs) |
| `base_unit_qty` | numeric | `1` |
| `cost_per_base_unit` | numeric | `0` |

`cost_per_base_unit` is stored but always derived in code as `purchase_unit_cost / base_unit_qty`.

Backfill existing rows: set `purchase_unit = unit`, `purchase_unit_cost = unit_cost`, `base_unit_qty = 1`, `cost_per_base_unit = unit_cost` so existing data has sensible defaults.

### 2. Product Master UI — Add new fields

Update `ProductMasterTab.tsx` and `useProductMaster.ts`:
- Add `purchase_unit`, `purchase_unit_cost`, `base_unit_type`, `base_unit_qty`, `cost_per_base_unit` to the interface and form
- In the create/edit dialog, add inputs for these fields
- Auto-calculate `cost_per_base_unit = purchase_unit_cost / base_unit_qty` on save
- Add columns to the table: Purchase Unit, Base Unit Type, Cost/Base Unit

### 3. Menu Costing — Use `cost_per_base_unit` instead of `unit_cost`

Update `MenuCostingTab.tsx`:
- When adding an ingredient, set `reference_cost = pm.cost_per_base_unit` (not `pm.unit_cost`)
- Column header: rename "Ref. Cost" to "Cost per Base Unit"
- Auto-set `unit_used` from `pm.base_unit_type` when a product is selected
- Show the cost per base unit preview when selecting a product

Update `useMenuCosting.ts`:
- `saveIngredient`: line_cost = `quantity_used × reference_cost` (already correct logic, just the input value changes)

### 4. Decimal Input Fix

Replace `value={field || ""}` patterns with proper string-based state for decimal inputs:
- Use `string` type for quantity_used and selling_price in form state
- Parse to number only on save
- This allows typing "0.01", "0.25" etc. without the input eating intermediate values

### Files Changed

1. **Migration SQL** — add 5 columns to `product_master`, backfill existing rows
2. **`src/hooks/useProductMaster.ts`** — add new fields to `ProductMasterItem` interface
3. **`src/components/procurement/ProductMasterTab.tsx`** — add new fields to form + table + dialog
4. **`src/components/procurement/MenuCostingTab.tsx`** — use `cost_per_base_unit`, auto-set unit, fix decimal inputs
5. **`src/hooks/useMenuCosting.ts`** — no structural changes needed (reference_cost already used for line_cost calc)

