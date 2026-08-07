# External Name should come from the items master once a line is linked

## The issue

The External Name cell always shows the raw scanned text from the invoice (`description`), even after the line is linked to a product. In your screenshot the same product appears twice with different invoice wording ("HOEGAARDEN - 20L KEG Ref No. 6B15" vs the deposit line), and the confidence chip reports "Name differs" because it is comparing master wording against invoice wording. Saved invoice lines therefore carry supplier-specific OCR wording instead of the canonical supplier product name, so the same product reads differently across invoices.

This is the opposite side of the earlier fix: scanned text must be preserved as evidence, but it should not be what the cell displays or what gets saved once a link exists.

## The fix

1. **Linked lines display the master's supplier product name.** When a line has a `product_master_id`, the External Name cell shows the linked entry's `supplier_product_name` (falling back to the internal product name if the supplier name is blank). Same for External SKU: show the master's `external_sku` when linked.
2. **Scanned text stays as evidence, not as display.** `scanned_description` / `scanned_item_code` remain immutable and are still what matching scores against. The invoice wording is shown as small muted sub-text under the cell ("Invoice: HOEGAARDEN - 20L KEG Ref No. 6B15") plus a tooltip, so nothing is lost and mismatches stay visible.
3. **Drop the "Name differs" hold for wording-only differences.** Because the cell now shows the canonical name, the amber "Name differs" marker only appears when the scanned text genuinely conflicts with the master (conflicting brand/size tokens), not when it is simply longer or contains a supplier reference number. Size/unit conflicts still block auto-link exactly as they do today.
4. **Unlinked lines are unchanged.** They keep showing scanned text, editable, with Did you mean / Ask AI / Quick add.
5. **Unlink restores the scanned text** into the cell, as it does today.
6. **Save path writes the canonical name.** Lines saved with a link store the master supplier product name and external SKU; the scanned wording is kept only as evidence on the line, so downstream invoice records, GRNs, and pricing views stay consistent.

## Technical notes

- `src/components/invoices/InvoiceScanner.tsx`: in `linkEntryToLine` and `selectProduct`, set `description` / `item_code` to the entry's `supplier_product_name` / `external_sku` while leaving `scanned_*` untouched; render invoice wording as sub-text when it differs. Keep all scoring inputs on `scanned_*`.
- Same treatment for the auto-link path in `flagLineItemIssues` so scan-time links behave identically.
- `src/components/procurement/ProcurementInvoicesTab.tsx`: the manual invoice editor uses the same select handler — apply the same canonicalisation there so both entry points agree.
- Matching utilities (`productFuzzyMatch.ts`, `productMasterResolver.ts`) unchanged except relaxing the wording-only "name differs" hold; conflict detection for size/unit/brand stays.
- No database or edge-function changes; existing saved invoices are untouched.
