
## Fix: Make External SKU / External Name truly free-editable

### Root cause
The blur snap-back in `ProductAutocomplete.tsx` has already been removed, but the fields are still being auto-resolved in the parent forms on every keystroke:
- `src/components/invoices/InvoiceScanner.tsx`
- `src/components/procurement/ProcurementInvoicesTab.tsx`
- `src/pages/Invoices.tsx`

Those handlers still call `resolveProductMatch(...)` while the user types. That causes the old matched product to be re-applied immediately from the other field, so delete/backspace never sticks.

### What to change
1. **Stop live auto-matching while typing**
   - In all 3 editors, let `item_code` and `description` behave as normal text inputs.
   - Remove `resolveProductMatch(...)` from the `onChange` path for these two fields.
   - When either field is manually edited, clear the linked PM metadata (`product_master_id`, `matched_sku`, internal name/UOM fields, price flags, unmatched state) unless the user explicitly chose a suggestion.

2. **Keep matching explicit**
   - Product hydration should only happen when the user:
     - clicks a dropdown suggestion, or
     - presses Enter on a highlighted suggestion.
   - `selectProduct` / `selectEditProduct` remain the only edit-time hydration path.

3. **Add exact-match re-linking at save time**
   - Since saves currently depend on live match state, add a small exact-only helper in `src/utils/productMasterResolver.ts`.
   - Use it during save in:
     - `InvoiceScanner.tsx`
     - `ProcurementInvoicesTab.tsx`
     - `Invoices.tsx`
   - This allows exact typed SKU/name values to reconnect on save without forcing live snap-back while editing.

4. **Scanner-specific cleanup**
   - In `InvoiceScanner.tsx`, stop using `flagLineItemIssues(...)` as a typing-time hydrator.
   - Keep it for initial scan/import analysis only, not for manual edits after the row is on screen.

### Files to update
- `src/components/invoices/InvoiceScanner.tsx`
- `src/components/procurement/ProcurementInvoicesTab.tsx`
- `src/pages/Invoices.tsx`
- `src/utils/productMasterResolver.ts`

### Expected result
- External SKU can be fully cleared and retyped.
- External Name can be fully cleared and retyped.
- Backspace, delete, paste, and free-text edits all stick.
- Selecting from autocomplete still fills both fields.
- Exact typed values can still reconnect to Product Master when saved.
- No database changes.

### Verification
Test all 3 surfaces:
1. clear External SKU only
2. clear External Name only
3. type a brand-new free-text value
4. clear then pick a new suggestion
5. save and reopen to confirm the edited values persist correctly
