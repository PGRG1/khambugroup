## Context-aware Product Master form

In `src/components/procurement/ProductMasterTab.tsx`, make the create/edit product dialog hide supplier/stock/recipe fields when `form.creates_stock_movement === false`.

### Always visible
- Internal SKU, Internal Product Name
- Categories (Level 1/2/3)
- Financial Treatment
- COA Account Override
- `creates_stock_movement` toggle
- Notes

### Conditionally rendered (only when `form.creates_stock_movement === true`)
Each wrapped in `{form.creates_stock_movement && ( ... )}`:
1. Supplier dropdown
2. External SKU field
3. Supplier Product Name field
4. Purchase & Stock Units section (Purchase UOM, Purchase Cost, Stock UOM, Stock Qty, Cost per Stock Unit)
5. Recipe Units section (Recipe UOM, Recipe Qty, Standard Cost per Recipe Unit)

### Out of scope
- No changes to save logic, validation, schema, or defaults
- Hidden fields retain their values in `form` state and persist as-is on save
- No animations
- No changes to the table view, CSV export, or any other tab

### Verification
- Toggle off → only Internal SKU, Name, Categories, Financial Treatment, COA Override, toggle, Notes remain visible
- Toggle on → full form as today
- Editing an existing stock item with toggle on, flipping it off mid-edit, and saving preserves previously-set supplier/UOM values in the DB
