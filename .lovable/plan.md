

## Fix: Allow duplicate Internal SKU for same product with different suppliers

### Problem
The `product_master` table has a `UNIQUE` constraint on `internal_sku`. When adding the same product with a different supplier (e.g., BEV-0112 from a second supplier), the insert fails because the SKU already exists. The intended design is that shared products use the same internal SKU and internal name, with distinct entries only in `product_suppliers`.

### Solution
Change the create flow: when the user enters an Internal SKU that already exists, look up the existing `product_master` row and add a new `product_suppliers` entry instead of inserting a new product_master record.

### Changes

**File: `src/hooks/useProductMaster.ts`**
1. In `createProduct`: Before inserting into `product_master`, check if a record with the same `internal_sku` already exists. If it does, skip the product_master insert and use the existing product's `id` to insert only a new `product_suppliers` entry.

**File: `src/components/procurement/ProductMasterTab.tsx`**
2. No structural changes needed — the existing form already collects all required fields. Optionally, when the user types an existing SKU in the "Add Product" dialog, auto-fill the Internal Product Name and category fields from the existing record (nice UX touch, but not required for the fix).

### Technical detail

```text
createProduct flow:
  1. Query product_master WHERE internal_sku = sku
  2. If found → use existing id, skip product_master insert
  3. If not found → insert new product_master row, get id
  4. Insert into product_suppliers with the id + supplier fields
```

