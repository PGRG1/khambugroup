## Goal
Add inline GRN-receiving columns (Accepted Qty, Difference, Reason, Note) to the existing Invoice Scanner line-item table, with row highlighting, Status auto-flip to Disputed, and persistence of receiving data into a GRN on confirmation. No other parts of the page change.

## Scope
Only `src/components/invoices/InvoiceScanner.tsx` for UI/state, plus a small backend migration to persist receiving data and generate the GRN. Everything else (header, summary, existing columns, footer, scan/save/duplicate, pricing/tax logic) is untouched.

## Frontend changes (InvoiceScanner.tsx)

1. Extend the in-memory line shape with four optional fields:
   - `accepted_qty: string` (defaults to `quantity` on load / when `quantity` changes and user hasn't overridden)
   - `receiving_reason: string` (one of the 14 options, or empty; auto-set to `"matched"` when difference is 0)
   - `receiving_note: string`
   - `accepted_qty_touched: boolean` (so we only auto-track `quantity` until the user edits Accepted Qty)
   When the scanner first populates `line_items`, seed `accepted_qty = quantity` and `receiving_reason = "matched"`.

2. Insert four `<th>` columns between Stock Qty and Purch. Cost, with widths 90 / 80 / 160 / 140 px, matching the existing header styling.

3. Insert four `<td>` cells per row in the same position:
   - Accepted Qty: numeric `<Input>` styled like Purch. Cost/Discount, `min=0`, decimals allowed, updates `accepted_qty` and sets `accepted_qty_touched=true`.
   - Difference: read-only span. `diff = Number(accepted_qty) - Number(quantity)`. Render `0` muted, negative in red (`-n`), positive in green (`+n`), tabular-nums.
   - Reason: when `diff === 0`, render a muted "Matched" chip (no select). Otherwise a compact `<select>` with the 14 options in the specified order; red border when value is empty.
   - Note: compact `<Input>` with placeholder "Add note…", `maxLength=500`. Show a tiny red dot when `receiving_reason === "other"` and note is empty. (Multi-line expansion deferred to a textarea swap on focus inside the same cell.)

4. Row highlight: compute a `receivingRowClass` per line and merge with the existing `rowClass` (preserve current unmatched/sku/price classes; receiving highlight wins only when the existing class is empty so we don't double-tint). Mapping:
   - diff 0 → none
   - diff < 0 + reason ∈ {short_delivery, partial_delivery, not_received} → amber
   - diff < 0 + reason ∈ {damaged, broken, poor_quality, rejected, wrong_item_received} → red
   - diff > 0 + reason ∈ {extra_quantity_received, free_promotional_quantity, supplier_over_delivery} → green
   - diff ≠ 0 + reason empty → amber (needs attention)
   Implemented with inline `style` using the exact `rgba()` values + 3px left border, since these are one-off tints.

5. Status auto-flip:
   - Derive `hasDispute = line_items.some(l => Number(l.accepted_qty||0) !== Number(l.quantity||0))`.
   - Track `previousStatus` in a ref. When `hasDispute` becomes true and current status ≠ "disputed", store previousStatus and set status to "disputed". When `hasDispute` becomes false, restore previousStatus (only if status still === "disputed").
   - Render an inline warning next to the Status field when disputed: "Invoice disputed — quantity differences must be resolved before approval."
   - Save Draft remains enabled; final approval/confirm action is disabled while `hasDispute` is true OR any disputed line has empty reason OR any "other" reason has empty note.

6. Disputed-blocking validation only gates the confirm/approve button — Scan Another, Save Draft, Duplicate are untouched.

## Backend changes

1. Migration: add receiving columns to `invoice_line_items`:
   - `accepted_qty numeric`
   - `qty_difference numeric` (generated or set by app)
   - `receiving_reason text`
   - `receiving_note text`
   No RLS or grant changes (table already configured).

2. On invoice confirmation (existing approval path), in addition to current behaviour:
   - Insert a row in `goods_received_notes` linked to the invoice (supplier, venue, invoice_id, received_by, received_at).
   - Insert one `grn_items` row per invoice line using `accepted_qty` (not `quantity`) for the received quantity; copy reason/note.
   - Write audit entries capturing invoiced qty, accepted qty, difference, reason, note, confirming user (reusing the existing audit/ledger logging hook for invoice approval; one entry per line or one summary entry with line payload).
   - Pricing/tax/Total continue to use `quantity` and existing fields — no change.

3. The invoice header amounts and the line `total` stay computed from `quantity` × `unit_price` − `discount`, unchanged.

## What stays exactly as-is
Header fields, top summary chips, all existing columns/inputs, footer totals & buttons, extraction/matching/pricing/tax logic, item-status badges, drag-to-reorder, supplier-filtered autocomplete.

## Files to touch
- `src/components/invoices/InvoiceScanner.tsx` — new fields in line state, 4 header cells, 4 body cells, row-highlight merge, Status auto-flip + warning + confirm-button gating.
- Migration: add 4 columns to `invoice_line_items`.
- Invoice confirmation handler (will locate during build — likely in `InvoiceScanner.tsx` save/confirm path or a shared hook) to write GRN + grn_items + audit on approval.

## Out of scope
Header redesign, summary chip changes, modals/drawers, mobile column stacking, changes to other invoice tabs (`ProcurementInvoicesTab`, `LineItemsTab`), and any non-invoice screens.
