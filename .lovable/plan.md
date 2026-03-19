

## Plan: Five Invoice Scanner Improvements

### 1. Block duplicate invoice recording (not just warn)
Currently duplicates show a warning but allow "Save Anyway". Change behavior to **block** saving entirely for duplicates — remove the confirmation dialog and disable the save button when `is_duplicate` is true. The "Save All" flow should skip duplicates and report them.

**Files:** `src/components/invoices/InvoiceScanner.tsx`
- In `doSaveCurrent`: if duplicate detected, toast an error and return (no dialog)
- In `handleSaveAll`: skip invoices flagged as `is_duplicate`, count and report skipped
- Disable "Save This Invoice" button when `current.is_duplicate`
- Remove the duplicate confirmation `AlertDialog` entirely
- Change duplicate banner text to say "Cannot be recorded — already exists"

### 2. Fuzzy-match supplier name from AI to Product Master list
Currently `matchOrCreateSupplier` does exact lowercase match only. The AI reads the supplier name from the receipt (e.g. "Telford International Ltd") but the Product Master may have "Telford International". Apply the same `normalizeSupplierName` fuzzy logic (strip Ltd/Co, partial contains) already used for the dropdown.

**File:** `src/components/invoices/InvoiceScanner.tsx`
- Update `matchOrCreateSupplier` to:
  1. Exact match (existing)
  2. Normalized match using `normalizeSupplierName`
  3. Partial contains match (both directions)
  4. Only create new supplier if none of these match

### 3. Add ProductAutocomplete to the edit drawer line items
Currently the edit drawer in `ProcurementInvoicesTab.tsx` uses plain `Input` fields for description — no autocomplete/partial matching. Add `ProductAutocomplete` for both `item_code` and `description` fields, matching the scanner's behavior.

**File:** `src/components/procurement/ProcurementInvoicesTab.tsx`
- Import `ProductAutocomplete` component
- Replace the description `Input` in edit mode with `ProductAutocomplete` (searchField="name")
- Add an `item_code` field with `ProductAutocomplete` (searchField="code")
- On product select, update `item_code`, `description`, and `product_master_id` on the edit line

### 4. Clear notes field after AI extraction
The AI extracts notes (payment terms, remarks) from the invoice. The user wants notes blank for manual entry. Simply set `notes: ""` instead of `raw?.notes || ""` after parsing.

**File:** `src/components/invoices/InvoiceScanner.tsx` (line 329)
- Change `notes: raw?.notes || ""` to `notes: ""`

### 5. For Telford, prioritize External SKU (item_code) for matching
Currently the AI matching in the edge function compares description against SupplierName/Name and item_code against ExtSKU. For Telford specifically, the external code on the invoice IS the primary matching key. Update the product master matching instructions to emphasize: "If the invoice has an item/product code, ALWAYS try matching it against ExtSKU FIRST — this is the most reliable match."

**File:** `supabase/functions/parse-invoice/index.ts`
- In the `PRODUCT MASTER MATCHING` section (around line 136-146), add instruction: "PRIORITY: If the line item has an item_code/product code, match it against ExtSKU first. An exact ExtSKU match takes priority over description matching."
- Also update client-side `matchLineItemsToProductMaster` in `useInvoiceData.ts` to check `item_code` → `external_sku` match BEFORE description matching

### Technical Details

**Files changed:**
1. `src/components/invoices/InvoiceScanner.tsx` — block duplicates, clear notes, fuzzy supplier match
2. `src/components/procurement/ProcurementInvoicesTab.tsx` — add ProductAutocomplete to edit drawer
3. `supabase/functions/parse-invoice/index.ts` — prioritize ExtSKU matching
4. `src/hooks/useInvoiceData.ts` — reorder matching logic to check item_code→ExtSKU first

