

## Plan: Fix Product Master Save Issues + Add Duplicate SKU Confirmation

### Problem 1: Data not saving properly
When creating a new product with a duplicate internal SKU, the `createProduct` function silently reuses the existing `product_master` row **without updating its shared fields** (internal product name, categories, costs, etc.). So the new values you entered appear lost — the row keeps its old data.

**Fix**: When a duplicate SKU is found during creation, update the existing `product_master` row with the new shared fields before inserting the supplier entry.

### Problem 2: No duplicate SKU warning
When entering an internal SKU that already exists, there's no confirmation prompt.

**Fix**: Add a real-time check in the create dialog. When the user types an internal SKU that already exists, show a warning banner. On save, show a confirmation dialog asking "A product with SKU X already exists. Add a new supplier entry to the existing product?"

### Technical Changes

**`src/hooks/useProductMaster.ts`** — `createProduct` function:
- When duplicate SKU is found, also run an `update` on the existing `product_master` row with the new shared fields (internal_product_name, categories, unit, unit_cost, status, notes, cost fields)

**`src/components/procurement/ProductMasterTab.tsx`**:
- Add state for duplicate SKU detection (`duplicateSku: boolean`)
- Add a `useEffect` or `onBlur` on the internal_sku input that checks against existing products
- Show a yellow warning badge/banner below the SKU field when duplicate detected (e.g. "⚠ SKU already exists — saving will add a supplier entry to the existing product")
- Add a confirmation dialog (`AlertDialog`) that triggers on save when duplicate is detected, asking the user to confirm before proceeding

