## Problem
`useInvoiceData.updateInvoice` deletes all `invoice_line_items` and re-inserts them, so the FK `grn_items.invoice_line_item_id` (ON DELETE SET NULL) is nulled on every save. `syncGrnFromInvoice` then can't match existing GRN rows by line id, so edits become duplicate inserts and the old rows stay as orphans.

## Fix — rewrite `src/utils/syncGrnFromInvoice.ts` to be authoritative
Stop relying on `invoice_line_item_id` survival. After the invoice save, the freshly inserted `invoice_line_items` are the source of truth.

New behaviour:
1. Look up the GRN for the invoice (same as today). If none, exit.
2. Re-fetch the current `invoice_line_items` for this invoice from the DB (post-save) — these have the new IDs and the latest accepted_qty / accepted_price / net_unit_cost / etc.
3. Load `product_master.creates_stock_movement` for those product ids, filter out non-stock lines.
4. Delete ALL existing `grn_items` for this GRN (tenant-scoped).
5. Insert one `grn_item` per stock-bearing invoice line, using the same field mapping and cost fallback chain currently in the file (quantity_invoiced, quantity_received = accepted_qty, accepted_qty, accepted_price, qty_difference, unit_cost, description, unit, receiving_reason, receiving_note, invoice_line_item_id pointing at the new line id).
6. Recompute GRN status: `disputed` if any line has accepted_qty ≠ quantity, else `confirmed`. Update `goods_received_notes.status`.

## Caller change — `src/components/procurement/ProcurementInvoicesTab.tsx`
`handleSaveEdit` no longer needs to pass `editedLines`. Update the call to just:

```ts
syncGrnFromInvoice(selectedInvoice.id, { tenantId }).catch(() => {});
```

Update the function signature in `syncGrnFromInvoice.ts` accordingly (drop the `editedLines` argument).

## Why this works
- Authoritative re-sync means the GRN always matches the saved invoice, regardless of how `updateInvoice` mutates line IDs.
- No orphan rows, no duplicates.
- Same field mapping and cost fallback as today, so downstream stock-on-hand math is unchanged.
- Still fire-and-forget; invoice save is never blocked.

## Out of scope
- Not changing `useInvoiceData.updateInvoice` (delete+reinsert is used elsewhere and altering it risks regressions).
- Not changing `autoCreateGrnFromInvoice` (only runs on first save, where the FK is intact).
- No schema changes.