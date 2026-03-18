

## Plan: Fix Supplier Dropdown, Code Column, and Scanner Issues

### Three issues to address:

---

### Issue 1: Supplier dropdown in Invoice Edit (ProcurementInvoicesTab)

**Root cause:** The edit form at line 463 of `ProcurementInvoicesTab.tsx` uses the full `suppliers` list (which has 9 entries including multiple "SAISON" variants). It needs to be filtered to only show suppliers from the Product Master, matching what the scanner already does.

**The `suppliers` table has:** Multiple SAISON variants ("SAISON Food Service LIMITED", "SAISON Food Service LIMITED\n膳食服務有限公司", etc.) — none of which match the Product Master name "Saison Food Service Ltd".

**Fix in `ProcurementInvoicesTab.tsx`:**
- Derive `productMasterSupplierOptions` from the `productMaster` state (which already fetches `product_suppliers` data including supplier names)
- Extract unique supplier names from `productMaster` entries
- Use fuzzy matching (normalize by stripping "Ltd", "Limited", "Co", Chinese chars) to link them to supplier IDs from the `suppliers` table
- If no match found, show the Product Master name anyway with a `pm:` prefix (like the scanner does)
- Use this filtered list in both the edit form supplier dropdown AND anywhere else suppliers are shown
- Apply the same `handleSupplierChange` pattern (create supplier on-the-fly for `pm:` prefixed values)

---

### Issue 2: Code column showing internal SKU when there's no external SKU

**Root cause:** In `ProductAutocomplete.tsx`, when `searchField === "code"`, it searches by `external_sku`. But it also shows results where `external_sku` is empty if the query matches any part of an empty string (since `"".includes("")` is true for short queries). When a product is selected via the description autocomplete, `selectProduct` correctly sets `item_code: product.external_sku || ""` — so the code should be blank.

The real issue is in the autocomplete suggestion display (line 115-125 of ProductAutocomplete.tsx): it always shows `p.external_sku` in the dropdown. And the `searchField === "code"` filter at line 47 will match products with empty `external_sku` when query is empty-ish.

**Fix in `ProductAutocomplete.tsx`:**
- For `searchField === "code"`: skip products where `external_sku` is empty/blank (add `&& p.external_sku.trim()` to the filter)
- This prevents showing products without external SKUs when searching by code

**Fix in `InvoiceScanner.tsx` `selectProduct`:**
- Already sets `item_code: product.external_sku || ""` — this is correct. No change needed here.

---

### Issue 3: Scanner not working

**Root cause:** The edge function logs show no invocations, and the `supabase/config.toml` only has `project_id` — no function configuration. The function should work since `supabase.functions.invoke()` includes auth headers automatically. However, the function may not be deployed or there could be a build error preventing the scanner UI from rendering.

**Investigation needed during implementation:**
- Check if there are any TypeScript/build errors in InvoiceScanner.tsx that prevent it from rendering
- Verify the edge function is deployed by checking function list
- Test the scanner by having the user try uploading a file and checking console/network logs

**Potential fix:** If the config.toml needs the function listed, add it. But typically Lovable auto-deploys edge functions without explicit config entries.

---

### Summary of file changes:

1. **`src/components/procurement/ProcurementInvoicesTab.tsx`** — Add `productMasterSupplierOptions` useMemo (same pattern as InvoiceScanner) and use it in the edit form supplier dropdown instead of raw `suppliers`

2. **`src/components/invoices/ProductAutocomplete.tsx`** — For `searchField === "code"`, filter out products with empty `external_sku`

3. **`src/components/invoices/InvoiceScanner.tsx`** — Verify scanner works; check for any broken code from previous edits

