

## Fix: Use unique supplier entry IDs to distinguish products sharing the same product_master_id

### Problem
Both SKUs (`141189135M15` and `14189169148`) are flattened into the `productMaster` array with the same `id` value (the shared `product_master_id`). When `selectEditProduct` or `hydrateEditLine` resolves by `id`, `.find()` returns whichever entry appears first — always the wrong one.

### Root Cause
In the data-loading effect (line 142), every flattened entry gets `id: p.id` (the product_master_id). Two entries with different SKUs but the same master product end up with identical `id` values. The SKU-first priority in `findProductMatch` works, but the `onBlur` handler in `ProductAutocomplete` can call `onSelect` a second time after `handleSelect` already set the correct product, potentially overwriting it. Also, when `resolveExactMatch` fails (e.g., multiple supplier matches), no auto-select happens on blur, but the `updateEditLine` exact-match logic may also be racing with `selectEditProduct`.

### Fix — 3 changes

**1. Give each flattened entry a unique ID (`src/components/procurement/ProcurementInvoicesTab.tsx`)**

In the data-loading effect (line 129-172), use `supplier_entry_id` as a unique key alongside the shared `id`:
- Add `supplier_entry_id: s.id` (the `product_suppliers` row PK) to each supplier-sourced entry
- Update the `ProductMasterEntry` interface to include `supplier_entry_id?: string`

**2. Fix `ProductAutocomplete` onBlur to not overwrite a valid dropdown selection (`src/components/invoices/ProductAutocomplete.tsx`)**

The `onBlur` handler currently calls `onSelect` even after a dropdown click already called it. Add a flag (`justSelected`) that is set in `handleSelect` and checked in `onBlur` to skip the redundant call. This prevents the blur from potentially resolving to a different entry or re-triggering matching logic.

```typescript
const justSelectedRef = useRef(false);

const handleSelect = (product: ProductMasterEntry) => {
  justSelectedRef.current = true;
  onSelect(product);
  setOpen(false);
};

// In onBlur:
onBlur={(e) => {
  if (justSelectedRef.current) {
    justSelectedRef.current = false;
    return; // dropdown selection already handled it
  }
  const exactMatch = resolveExactMatch(e.currentTarget.value);
  if (exactMatch) onSelect(exactMatch);
}}
```

**3. Fix `resolveExactMatch` to handle multiple supplier entries from the same supplier (`src/components/invoices/ProductAutocomplete.tsx`)**

Currently, if `supplierMatches.length > 1` AND `exactMatches.length > 1`, it returns `undefined` — no auto-match happens. But for SKU searches, an exact SKU match should always be unique. Change logic to: if searching by `code` and there are exact SKU matches, return the first one (SKU is a unique identifier per supplier entry).

### Files changed
- `src/components/procurement/ProcurementInvoicesTab.tsx` — add `supplier_entry_id` to interface and data loading
- `src/components/invoices/ProductAutocomplete.tsx` — add `justSelectedRef` guard and fix `resolveExactMatch` for code searches

### Expected result
- Selecting SKU `141189135M15` from dropdown → External Name becomes "Chilled Cube Roll A' Aust 3.1K/Up Teys Classic"
- Selecting SKU `14189169148` from dropdown → External Name becomes "CHILLED CUBE ROLL / 7 RIB G/F AUST 36 SOUTH"
- No more race between dropdown click and blur overwriting the correct selection

