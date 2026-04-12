

## Fix: Product matching returns wrong supplier entry due to shared product_master_id

### Root Cause
Two supplier entries share the same `product_master_id` (`29e4136d-...`):
- SKU `14189169148` → "CHILLED CUBE ROLL / 7 RIB G/F AUST 36 SOUTH"
- SKU `141189135M15` → "Chilled Cube Roll A' Aust 3.1K/Up Teys Classic"

Both are flattened into the `productMaster` array with `id: product_master_id`. When `findProductMatch` resolves by `product_master_id`, it uses `.find()` which returns the **first** entry — always the wrong one. Even though `selectEditProduct` correctly sets the description, the `hydrateEditLine` useEffect (line 352-356) immediately re-runs `findProductMatch`, finds the first entry by ID, and overwrites the description.

### Fix Strategy: use a composite key that distinguishes supplier entries

**Priority logic (as user requested):**
1. Match by External SKU first — if found, fill External Name from that exact supplier entry
2. If no External SKU match, fall back to matching by Name

### Changes

**1. `ProcurementInvoicesTab.tsx` — give each flattened entry a unique `supplier_entry_id`**
- In the data-loading `useEffect` (line 129-172), add `supplier_entry_id: s.id` (the `product_suppliers` row id) to each flattened entry
- Update `ProductMasterEntry` interface to include `supplier_entry_id?: string`
- Store `supplier_entry_id` on each `EditableInvoiceLine`

**2. `ProcurementInvoicesTab.tsx` — fix `findProductMatch` to prefer SKU match over ID match**
- When `line.product_master_id` is set AND `line.item_code` is set, first try exact SKU match. If found, return that specific entry instead of the first-by-ID entry.
- This ensures SKU `141189135M15` always resolves to "Chilled Cube Roll A' Aust 3.1K/Up Teys Classic", not the first entry for that product.

**3. `ProcurementInvoicesTab.tsx` — fix `hydrateEditLine` to preserve the correct supplier entry**
- When a line already has both `product_master_id` and `item_code`, ensure `findProductMatch` uses the item_code to disambiguate between multiple supplier entries sharing the same product_master_id.

**4. `ProductAutocomplete.tsx` — same interface update**
- Add `supplier_entry_id` to the `ProductMasterEntry` interface

**5. `InvoiceScanner.tsx` — apply same fix to scanner flow**
- Ensure `findProductMatch` equivalent in scanner also prioritizes SKU match

### Technical detail
The key change in `findProductMatch`:
```
// Before: ID match first, returns wrong entry
if (line.product_master_id) {
  return scopedProducts.find(p => p.id === line.product_master_id);
}

// After: SKU match takes priority, then ID match
const itemCode = (line.item_code || "").trim().toLowerCase();
if (itemCode) {
  const skuMatch = scopedProducts.find(p => p.external_sku.trim().toLowerCase() === itemCode);
  if (skuMatch) return skuMatch;
}
if (line.product_master_id) {
  // Only fall back to ID match if no SKU
  return scopedProducts.find(p => p.id === line.product_master_id);
}
```

### Files changed
- `src/components/procurement/ProcurementInvoicesTab.tsx` — reorder match priority in `findProductMatch`, update data loading
- `src/components/invoices/InvoiceScanner.tsx` — same match priority fix
- `src/components/invoices/ProductAutocomplete.tsx` — interface update

### Expected result
- Typing or selecting SKU `141189135M15` → External Name becomes "Chilled Cube Roll A' Aust 3.1K/Up Teys Classic"
- Typing or selecting SKU `14189169148` → External Name becomes "CHILLED CUBE ROLL / 7 RIB G/F AUST 36 SOUTH"
- Each supplier entry resolves independently even when sharing the same internal product

