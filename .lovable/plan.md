# Quick Add to Product Master from the invoice scanner

Let an unmatched scanned line become a real Product Master item in one click, with the full setup (categories, UOM conversions, GL mapping) deferred to the Product Master tab later.

## The flow

On any unmatched line in the scanner (next to the existing "Did you mean?" suggestion chip) add a **+ Quick add** button. It opens a small popover pre-filled from the scanned line:

- Internal name (defaults to the scanned description)
- Internal SKU (auto-generated, e.g. `QA-0001`, editable)
- Supplier (locked to the invoice supplier)
- External SKU / external name (from the scanned line)
- Purchase UOM + unit cost (from the scanned line)

Confirm creates:
- one `product_master` row (status `Draft`, no categories, no financial treatment, no GL account)
- one `product_suppliers` row linking it to this invoice's supplier

The line is then immediately linked to the new product, exactly as if it had been matched — no re-scan, no page change.

A **Quick add all unmatched** button sits next to the existing "Resolve unmatched with AI" button, creating one draft product per remaining unmatched line in a single review list.

## Where you follow up later

Procurement → **Products** (Product Master tab). Quick-added items appear there like any other product, and are findable two ways that already exist:

- the **Mapping** filter → `Unmapped` (no financial treatment / GL account yet)
- the **Status** filter → `Draft` (new value, added alongside Active/Inactive)

A small "Needs setup (N)" pill at the top of the Product Master tab jumps straight to that filtered view. Editing a draft and saving a financial treatment + GL account is what promotes it to Active — same 2-click edit flow as today, nothing new to learn.

Also surfaced in the scanner review: a note that quick-added items still need categorisation, so nothing silently slips through.

## Guardrails

- Duplicate protection: before creating, the same fuzzy matcher runs; if something scores high the popover shows "This looks like <product> — link instead?" so we don't seed near-duplicates.
- Existing internal SKU reuse: if the typed SKU already exists, the new supplier entry is attached to that existing product rather than creating a second one (the current `createProduct` behaviour).
- Drafts have no GL account, so they cannot be posted to a wrong account by accident — invoice approval already blocks on unmapped items where it does today; that behaviour is unchanged.

## Technical notes

- New component `src/components/invoices/QuickAddProductPopover.tsx`, used from `InvoiceScanner.tsx` (unmatched row) and reusable from `ProcurementInvoicesTab.tsx`.
- Creation goes through the existing `useProductMaster().createProduct` — no new tables, no schema change. `status: "Draft"` is a new value in the existing text column.
- After creation, refresh the product master list and call the scanner's existing `selectProduct(i, entry)` so all matched fields (SKU, UOM, master price) populate through the normal path.
- SKU generator: max existing `QA-####` + 1, computed client-side from the loaded product list.
- `ProductMasterTab.tsx`: add `Draft` to the status filter options and the "Needs setup" pill.
