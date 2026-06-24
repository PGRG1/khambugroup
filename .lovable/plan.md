## Items Master — Yield Factors

Add `purchase_yield` and `cooking_yield` to the Items Master so recipe costing can account for trim/prep loss and cooking shrinkage. Existing items default to 100% (no behavior change).

### 1. Migration — `product_master`
Add two numeric columns, default `100`, NOT NULL:
- `purchase_yield`
- `cooking_yield`

No backfill needed beyond defaults.

### 2. `src/hooks/useProductMaster.ts`
- Extend `ProductMasterItem` with `purchase_yield: number` and `cooking_yield: number`.
- No changes to `ProductSupplierEntry` (yield is per product).
- Existing `createProduct` / `updateProduct` spread already carries the new fields through.

### 3. `src/components/procurement/ProductMasterTab.tsx`
- Add `purchase_yield: "100"` and `cooking_yield: "100"` to `EMPTY_FORM`.
- Add both fields to `FlatRow` and populate in `flatRows` (both branches) with `?? 100` fallback.
- Populate the two fields in `openEdit` with `String(p.purchase_yield ?? 100)` etc.
- Insert a new **Yield & Waste** section in the form dialog between "Purchase & Stock Units" and "Recipe Units", gated on `form.creates_stock_movement === true`. Two percentage inputs (1–100, step 0.1) with helper text, plus a summary strip showing Total yield (amber if <80%) and Effective cost per base unit.
- Update the **Recipe Units** cost display: when total yield <100% show raw cost struck through plus the yield-adjusted effective cost ("used in recipes"); otherwise keep the existing single line.
- Add validation in the save handler: both yields must parse and fall in [1, 100], else toast error and abort.
- Add `Purchase Yield (%)` and `Cooking Yield (%)` columns to the CSV export.

### Out of scope
GRN flow, `product_suppliers`, recipe/menu costing reads, sidebar, routing, other procurement pages. Recipe costing module will consume these fields when built — this prompt only stores and surfaces them.
