

## Fix: ProductAutocomplete not showing results for some product names

### Problem
When typing a product name like "Gourmet's Kitchen Oil" in the autocomplete, no suggestions appear even though the product exists under the current supplier (e.g., Ming Kee). This happens because the `supplierFilteredPM` filter is too restrictive — it excludes all products that don't have a supplier match, meaning products where the supplier field is empty or slightly different get dropped entirely.

### Root cause
In both `InvoiceScanner.tsx` and `ProcurementInvoicesTab.tsx`, the `supplierFilteredPM` / `editFilteredPM` filter:
1. **Excludes products with no supplier** (`if (!p.supplier) return false`) — products in the PM that lack a supplier entry are invisible
2. **Only shows supplier-matched products** — if a product exists in the PM but isn't specifically mapped to the current invoice's supplier, it won't appear even though the user needs to match it

The autocomplete should show **all** products but **prioritize** supplier-matched ones, so users can still find and match any PM product.

### Fix

**File: `src/components/invoices/InvoiceScanner.tsx`** (~line 177-189)
- Change `supplierFilteredPM` to include ALL products, but sort supplier-matched ones to the top
- Products matching the current supplier appear first, followed by all others

**File: `src/components/procurement/ProcurementInvoicesTab.tsx`** (equivalent `editFilteredPM`)
- Apply the same sorting logic

**File: `src/components/invoices/ProductAutocomplete.tsx`** (line 49-61)
- Update the `suggestions` memo to prioritize supplier-matched results first, then others
- Keep the limit at 8 but ensure supplier matches always appear before non-supplier matches

### Implementation detail
```typescript
// InvoiceScanner.tsx — replace filter with sort-to-top
const supplierFilteredPM = useMemo(() => {
  if (!productMaster || !current) return productMaster || [];
  const supplierName = current.supplier_name || "";
  if (!supplierName) return productMaster;
  const normSupplier = normalizeSupplierName(supplierName);
  // Sort: supplier matches first, then everything else
  return [...productMaster].sort((a, b) => {
    const aMatch = a.supplier && (normalizeSupplierName(a.supplier) === normSupplier) ? 0 : 1;
    const bMatch = b.supplier && (normalizeSupplierName(b.supplier) === normSupplier) ? 0 : 1;
    return aMatch - bMatch;
  });
}, [productMaster, current?.supplier_name]);
```

This ensures every PM product is searchable, but supplier-specific matches rank higher in the dropdown.

