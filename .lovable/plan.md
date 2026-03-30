

## Fix: ProductAutocomplete not showing all supplier entries for same product

### Problem
When multiple suppliers share the same `product_master` record (same Internal SKU), the dropdown only shows one entry. This is because `key={p.id}` uses the `product_master.id`, which is identical across all supplier entries for the same product. React deduplicates elements with the same key.

### Solution
Use a composite key that includes both the product id and supplier name (or index) to ensure each supplier entry renders as a distinct dropdown item.

### Changes

**File: `src/components/invoices/ProductAutocomplete.tsx`**
- Line 123: Change `key={p.id}` to `key={`${p.id}-${p.supplier || idx}`}` so each supplier entry gets a unique key.

Single-line fix, no other changes needed.

