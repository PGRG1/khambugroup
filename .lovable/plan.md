## Goal

Backfill GRNs for all 1,139 historical invoices that have `grn_id IS NULL`, then repoint the Inventory On Hand view to read from `grn_items.accepted_qty` instead of `invoice_line_items`. No inventory wipe is needed because no persisted stock table exists today — the Inventory tab derives quantities live.

## Pre-check results (already gathered)

- Invoice statuses present: `paid`, `unpaid`, `disputed`. No `confirmed` value.
- All 1,139 invoices have `grn_id IS NULL`.
- No trigger posts `grn_items` → inventory. Only `trg_update_po_status_on_grn_confirm` exists on `goods_received_notes`.
- No `stock_on_hand` table. `InventoryOnHandTab` aggregates `invoice_line_items.quantity / .total` per `product_master_id` via the `get_inventory_aggregates` RPC (with client-side fallback).

## Step 1 — Backfill GRNs (one-off admin script)

Add a temporary admin-only utility, invoked from a button in `src/components/procurement/ReceivingTab.tsx` (top-right, labelled "Backfill GRNs from historical invoices", visible only to admins).

Behaviour:
1. Fetch every invoice with `grn_id IS NULL` for the active tenant — all statuses included (paid, unpaid, disputed), per user choice.
2. For each invoice, sequentially call the existing `autoCreateGrnFromInvoice(invoiceId, { tenantId, userId })`. No new GRN logic.
3. Per-invoice try/catch. Log:
   - success: `GRN created for invoice <id> → <grn_number>`
   - skipped: `Skipped invoice <id> — GRN already exists`
   - failure: `Failed to create GRN for invoice <id>` + error
4. After the loop, log and toast: `Backfill complete: X created, Y skipped, Z failed`.
5. Failures do not block other invoices. The button stays available so the user can re-run after fixing data issues; the function is already idempotent.

No invoice records, line items, or other tables are modified beyond the existing `invoices.grn_id` link that `autoCreateGrnFromInvoice` already writes.

## Step 2 — Repoint inventory read source to GRN

Replace the inventory data source so displayed Qty On Hand and Avg Cost come from accepted GRN lines, not invoices. This avoids any double-count once GRNs exist.

Changes:

1. **New SQL migration** — replace the `get_inventory_aggregates` RPC so it aggregates from `grn_items` joined to `goods_received_notes` where `status IN ('confirmed','disputed')`:
   - `total_qty` = `SUM(grn_items.accepted_qty)` grouped by `product_master_id`
   - `total_spend` = `SUM(grn_items.accepted_qty * grn_items.unit_cost)` grouped by `product_master_id`
   - Tenant-scoped via `tenant_id = current setting / passed arg` consistent with the existing function signature.
   - Grant EXECUTE to `authenticated` and `service_role`.

2. **Client fallback in `InventoryOnHandTab.tsx`** — update the fallback path (used if the RPC errors) to read from `grn_items` + `goods_received_notes` instead of `invoice_line_items`. Same shape, same aggregation keys, so the rest of the component is unchanged.

No UI, no KPI labels, no other components touched.

## Step 3 — Verification (run in the same admin utility, after Step 1)

After backfill finishes, run and surface in the toast / console:
- Count of invoices with `grn_id IS NULL` → expect 0 (or the number of explicit failures).
- Count of `goods_received_notes` rows → expect ≥ original eligible invoice count.
- Sanity: top 5 `product_master_id` by `SUM(grn_items.accepted_qty)` vs the same aggregation from `invoice_line_items.quantity` — for items with no qty diffs, totals should match.

## Out of scope

- No `stock_on_hand` table, no per-venue persisted balances, no GRN→inventory trigger. The Inventory tab stays a live aggregation, now sourced from GRNs.
- No changes to `autoCreateGrnFromInvoice`, the invoice confirmation flow, the Invoice Scanner, or any UI other than the temporary backfill button and the inventory data source swap.
- No data deletion. No edits to invoice line items.

## Files touched

- `src/components/procurement/ReceivingTab.tsx` — admin-only "Backfill GRNs" button + handler that loops `autoCreateGrnFromInvoice`.
- `src/utils/backfillGrnsFromInvoices.ts` — new helper containing the loop, logging, and post-run verification queries.
- `supabase/migrations/<timestamp>_grn_inventory_aggregates.sql` — replace `get_inventory_aggregates` to read from `grn_items`.
- `src/components/procurement/InventoryOnHandTab.tsx` — update the client-side fallback aggregation to use `grn_items` instead of `invoice_line_items`. No UI changes.
