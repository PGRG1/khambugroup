

## Plan: Filter Supplier Dropdown to Product Master Only

### Problem
The Supplier dropdown in the Invoice Scanner shows all suppliers from the `suppliers` table, but many are irrelevant. It should only show suppliers that have entries in the `product_suppliers` table (i.e., suppliers linked to actual products in the Product Master).

### Change

**`src/components/invoices/InvoiceScanner.tsx`** (line ~831)

Derive a filtered supplier list from the `productMaster` prop by extracting unique supplier names, then matching them against the `suppliers` prop. Replace the dropdown's data source with this filtered list.

```tsx
// Derive unique supplier names from productMaster
const productMasterSuppliers = useMemo(() => {
  if (!productMaster) return suppliers;
  const pmSupplierNames = new Set(
    productMaster.map(p => p.supplier?.toLowerCase()).filter(Boolean)
  );
  return suppliers.filter(s => pmSupplierNames.has(s.name.toLowerCase()));
}, [suppliers, productMaster]);
```

Then use `productMasterSuppliers` instead of `suppliers` in the `<SelectContent>` mapping on line 831.

The `matchOrCreateSupplier` function and other supplier references remain unchanged — they still use the full `suppliers` list for matching/creating during AI extraction.

