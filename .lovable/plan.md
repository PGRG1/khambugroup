

## Fix: Editing Internal SKU on one row should not affect other rows sharing the same product

### Problem
When two supplier entries share the same `product_master` record (same Internal SKU), editing the Internal SKU or Internal Product Name on one row updates the shared `product_master` record, changing both rows. The user needs to correct a mistakenly assigned SKU on just one supplier entry.

### Root Cause
In `handleSave` (ProductMasterTab.tsx line 189-201), `updateProduct(editingProductId, ...)` directly updates the shared `product_master` row. Both supplier entries point to the same `product_master_id`, so both are affected.

### Solution: "Split on SKU change"
When saving an edit, if the `internal_sku` has changed AND other supplier entries share the same `product_master_id`:

1. **Create a new `product_master` record** with the updated SKU/name/categories
2. **Reassign the current supplier entry** (`product_suppliers` row) to point to the new `product_master_id`
3. **Leave the original product_master untouched** so the other supplier entry is unaffected

If the SKU hasn't changed, or the product has only one supplier entry, update in place as before.

### Changes

**File: `src/hooks/useProductMaster.ts`**
- Add a new function `splitProduct(productId, supplierEntryId, updates)` that:
  1. Inserts a new `product_master` row with the updated fields
  2. Updates the `product_suppliers` row to point to the new product_master_id
  3. Refreshes the product list

**File: `src/components/procurement/ProductMasterTab.tsx`**
- In `handleSave`: Before calling `updateProduct`, check if `internal_sku` changed and the product has multiple supplier entries. If so, call `splitProduct` instead of `updateProduct`.

