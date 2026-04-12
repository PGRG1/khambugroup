

## Plan: Enhance Duplicate SKU Warning with Product Name

### Changes

**`src/components/procurement/ProductMasterTab.tsx`**:

1. Change `duplicateSku` state from `boolean` to `string | null` to store the matched product's internal product name (or `null` if no match).

2. Update the `useEffect` (line 179-186): instead of `products.some(...)`, use `products.find(...)` and store `matchedProduct.internal_product_name` in state.

3. Update the warning banner (line 506-508) to show both the SKU and the internal product name:
   - `⚠ SKU "MET-122" already exists — "Chilled Rib Eye Roll Black Angus". Saving will add a new supplier entry (e.g. different weight/pack size) to this product.`

4. Update the confirmation dialog (line 597-600) to also display the product name and clarify the use case:
   - `A product with SKU "MET-122" ("Chilled Rib Eye Roll Black Angus") already exists. This will add a new supplier entry to the existing product — useful when the same supplier sells different weights or pack sizes under the same internal SKU. Continue?`

5. Update all boolean checks (`if (duplicateSku)`, ternary uses) to check `duplicateSku !== null` instead.

### No other files affected.

