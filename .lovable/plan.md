

## Fix: Auto-match product on blur when user types an exact External SKU

### Problem
When the user types an External SKU (e.g. "141189135M15") into the SKU field and moves to the next field **without clicking a dropdown suggestion**, the External Name does not update. The `onSelect` callback (which updates both SKU and Name) only fires when the user explicitly clicks or presses Enter on a dropdown item. If the user types the full SKU and tabs away, the dropdown closes but no selection is made.

### Root Cause
The `ProductAutocomplete` component has no `onBlur` handler that auto-selects a product when the typed value exactly matches a product's `external_sku`. The dropdown closes on outside click, but `onSelect` is never called.

### Fix

**`src/components/invoices/ProductAutocomplete.tsx`**:
Add an `onBlur` handler to the `<Input>` that checks if the current typed value exactly matches a single product's `external_sku` (for `searchField="code"`) or `supplier_product_name` (for `searchField="name"`). If an exact match is found, call `onSelect(matchedProduct)` automatically.

```typescript
// Add onBlur to the Input element
onBlur={() => {
  // Auto-select if typed value exactly matches one product
  if (query.length > 0) {
    const exactMatch = products.find((p) => {
      if (searchField === "code") {
        return p.external_sku.trim().toLowerCase() === query;
      }
      return (p.supplier_product_name || p.internal_product_name || "").trim().toLowerCase() === query;
    });
    if (exactMatch) {
      onSelect(exactMatch);
    }
  }
}}
```

**`src/components/procurement/ProcurementInvoicesTab.tsx`** and **`src/components/invoices/InvoiceScanner.tsx`**:
No changes needed — the existing `onSelect` handlers (`selectEditProduct` / `selectProduct`) already correctly update both `item_code` and `description` fields.

### Files Changed
- `src/components/invoices/ProductAutocomplete.tsx` — add onBlur auto-match logic

### Why this fixes the reported issue
The user types SKU "141189135M15", tabs away, and the `onBlur` fires, finds the exact product match, and calls `onSelect` which updates both the External SKU and External Name fields. This works for both the Edit Invoice page and the Scanner.

