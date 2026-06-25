## Fix: PM/Master price ignores invoice supplier when multiple `product_suppliers` rows exist

### Diagnosis
For BER-0001 (Strawberry 250g) `product_master.purchase_unit_cost = 40`, but two `product_suppliers` rows exist:
- Green Valley HK → $40
- VegFresh HK → $36

When the invoice supplier is Green Valley HK, the line still shows `PM/Master: $36`. The cause is in `src/utils/productMasterResolver.ts` → `resolveProductMatch`: the hydration fallbacks return the first matching row without checking `invoiceSupplier`:

```ts
if (supplierEntryId) {
  const byEntryId = products.find(p => p.supplier_entry_id === supplierEntryId);
  if (byEntryId) return byEntryId; // <-- no supplier guard
}
if (productMasterId) {
  ...
  const byId = products.find(p => p.id === productMasterId);
  if (byId) return byId; // <-- supplier-scoped variant exists above, but this final fallback wins when supplier_entry_id already pointed to wrong supplier
}
```

So a stored `supplier_entry_id` from a prior match (or just row ordering on `product_master_id`) overrides the correct supplier.

### Fix — edit only `src/utils/productMasterResolver.ts`

In `resolveProductMatch`, when `invoiceSupplier` is provided, every hydration fallback must prefer the supplier-matched row. Specifically:

1. **supplier_entry_id branch**: if a `byEntryId` hit is found but its supplier doesn't match `invoiceSupplier`, attempt to re-resolve to the same `product_master_id` with the correct supplier first; only fall back to `byEntryId` if no supplier-matched sibling exists.

   ```ts
   if (supplierEntryId) {
     const byEntryId = products.find(p => p.supplier_entry_id === supplierEntryId);
     if (byEntryId) {
       if (!invoiceSupplier || supplierMatch(byEntryId.supplier, invoiceSupplier)) return byEntryId;
       const supplierSibling = products.find(
         p => p.id === byEntryId.id && supplierMatch(p.supplier, invoiceSupplier)
       );
       if (supplierSibling) return supplierSibling;
       return byEntryId;
     }
   }
   ```

2. **product_master_id branch**: keep the existing supplier-scoped lookup, but when no SKU/supplier match is found and `invoiceSupplier` is provided, skip the un-scoped `byId` fallback (return null instead of a wrong-supplier row).

   ```ts
   if (productMasterId) {
     if (code) {
       const byIdAndSku = products.find(p => p.id === productMasterId && (p.external_sku || "").trim().toLowerCase() === code);
       if (byIdAndSku) return byIdAndSku;
     }
     if (invoiceSupplier) {
       const byIdAndSupplier = products.find(p => p.id === productMasterId && supplierMatch(p.supplier, invoiceSupplier));
       if (byIdAndSupplier) return byIdAndSupplier;
       // do NOT fall through to un-scoped byId when we know the supplier
     } else {
       const byId = products.find(p => p.id === productMasterId);
       if (byId) return byId;
     }
   }
   ```

3. **internal_sku branch**: same pattern — when `invoiceSupplier` is provided, only return the supplier-scoped row; otherwise keep the existing "unique-match-only" behavior we added previously.

   ```ts
   if (internalSku) {
     if (invoiceSupplier) {
       const byInternalAndSupplier = products.find(p => p.internal_sku === internalSku && supplierMatch(p.supplier, invoiceSupplier));
       if (byInternalAndSupplier) return byInternalAndSupplier;
       // when invoice supplier known, do not return a different-supplier row
     } else {
       const allForSku = products.filter(p => p.internal_sku === internalSku);
       if (allForSku.length === 1) return allForSku[0];
     }
   }
   ```

`resolveExactMatch` already guards each branch with `invoiceSupplier`-first lookups; leave its prior behavior intact (it has no `supplier_entry_id` or `product_master_id` branches, and the recent unique-match-only `internal_sku` fallback stays).

### Out of scope
No DB changes, no UI changes. After this fix, BER-0001 on a Green Valley HK invoice will resolve to the Green Valley `product_suppliers` row and show `PM/Master: $40`. The same logic applies to every multi-supplier item.