

## Fix: Allow reassigning a supplier entry to an existing Internal SKU

### Problem
The user has two separate `product_master` records for "Spicy Potato Wedges" (different packaging variants from Ming Kee). They want both supplier entries to share the same Internal SKU (MK-0014), but when editing one row's SKU to match the other, the system either:
- Updates the wrong product_master row, or
- Blocks via the split logic

What should happen: when the user changes an Internal SKU to one that **already exists** on a different `product_master` record, the system should **reassign** the supplier entry to that existing record (similar to how `createProduct` already reuses existing SKUs).

### Solution: "Merge on SKU match" in handleSave

When saving an edit where the Internal SKU changed:
1. Check if another `product_master` record already has that SKU
2. If yes → reassign this supplier entry (`product_suppliers` row) to the existing `product_master_id`
3. If the old `product_master` record has no remaining supplier entries, optionally clean it up
4. If no match → proceed with current logic (split or update)

### Changes

**File: `src/components/procurement/ProductMasterTab.tsx`** (~handleSave, lines 204-221)
- After detecting `skuChanged`, query `products` array to find an existing product with the new `internal_sku` (different from `editingProductId`)
- If found: call a new `reassignSupplier` function to move the supplier entry to the existing product, then delete the orphaned product_master if it has no other suppliers
- If not found: proceed with existing split/update logic

**File: `src/hooks/useProductMaster.ts`**
- Add `reassignSupplier(supplierEntryId, newProductMasterId)` — updates the `product_suppliers.product_master_id`
- Add `deleteProductIfOrphaned(productId)` — deletes a `product_master` row only if it has zero remaining `product_suppliers` entries

