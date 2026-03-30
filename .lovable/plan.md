
Fix the autocomplete so typing “spicy potato” shows all attached variants, not just the current invoice supplier’s items.

What I found
- The records do exist in the backend for “Spicy Potato Wedges”:
  - Jebsen Beverage → “Spicy Potato Wedges (2.3kg x 6pk)”
  - Ming Kee Seafood → “Spicy Potato Wedges 1kg x 10pk”
- `ProductAutocomplete.tsx` is already rendering entries with unique keys, so the earlier key fix is not the blocker anymore.
- The real blocker is in `src/components/invoices/InvoiceScanner.tsx`:
  - it builds `supplierFilteredPM`
  - both autocomplete fields use `products={supplierFilteredPM}`
  - that filter only keeps rows whose supplier matches the current invoice supplier
- So when you type “spicy potato”, any attached item from a different supplier is intentionally filtered out before the dropdown even renders.

Implementation plan

1. Update autocomplete source in `InvoiceScanner`
- Stop passing the strictly supplier-filtered list into the name/code autocomplete.
- Pass a smarter list that prioritizes current-supplier matches first, but still includes other attached variants for the same internal product / similar supplier product names.

2. Replace hard filtering with ranked results
- In `InvoiceScanner.tsx`, replace `supplierFilteredPM` with a ranked product list:
  - first: exact/close current supplier matches
  - then: other product master entries
- This keeps the best matches at the top without hiding valid attached variants.

3. Improve matching behavior in `ProductAutocomplete`
- For `searchField="name"`, search across both:
  - `supplier_product_name`
  - `internal_product_name`
- Optionally also search a combined text blob so typing “spicy potato” matches both packaging variants consistently.

4. Make each dropdown row more distinguishable
- Expand the visible label in `ProductAutocomplete.tsx` so each option shows enough detail to tell variants apart:
  - supplier product name
  - internal name when different
  - supplier
  - purchase unit / pack text if available
- This is important because same-supplier variants can differ only by packaging.

5. Verify both places using this component
- Apply the same autocomplete behavior to:
  - invoice scan flow in `InvoiceScanner.tsx`
  - manual invoice edit flow in `ProcurementInvoicesTab.tsx`
- This keeps “search by attached items” consistent everywhere.

Technical notes
- Files to update:
  - `src/components/invoices/InvoiceScanner.tsx`
  - `src/components/invoices/ProductAutocomplete.tsx`
  - possibly `src/components/procurement/ProcurementInvoicesTab.tsx`
- Main code change:
  - remove the strict supplier-only restriction as the source for autocomplete suggestions
  - use ranking instead of exclusion
- No database changes are needed.

Expected result
- Typing “spicy potato” will show both attached entries.
- Current supplier items can still appear first.
- Different packaging variants from the same or different suppliers will remain selectable instead of disappearing.
