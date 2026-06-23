## Stock on Hand — Stock Count Baseline + Item Drill-Down

Two coordinated frontend-only changes to `src/components/procurement/InventoryOnHandTab.tsx` (and a new sibling component). No DB schema changes, no edits to the stock count entry flow, no sidebar/route changes.

### Part 1 — Recalculate Stock on Hand using last approved count + GRN since

In `InventoryOnHandTab.tsx` `fetchData` (inventory mode only), after loading `product_master`:

1. Fetch `stock_count_sessions` where `status='approved'`, ordered by `count_date` desc, scoped to `tenantId`.
2. Fetch matching `stock_count_items` (`session_id, product_master_id, counted_qty, unit_cost`) via `.in('session_id', sessionIds)`.
3. Build `lastCountMap: product_master_id → { counted_qty, count_date, session_id, unit_cost }` (first hit wins because sessions are date-desc).
4. Fetch `goods_received_notes` (id, received_date, venue, status, supplier_id, grn_number) with `status in ('confirmed','disputed')` via `fetchAllRows` (tenant scoped) — replaces / augments the existing RPC path for inventory mode.
5. Fetch `grn_items` (grn_id, product_master_id, accepted_qty, unit_cost) via `fetchAllRows`.
6. For each product, compute:
   - If `lastCount` exists: `qty = counted_qty + Σ accepted_qty (GRN.received_date > count_date)`; `spend = counted_qty * count.unit_cost + Σ (accepted_qty * gi.unit_cost)` for those same GRN rows.
   - Else: sum across all confirmed/disputed GRN rows (current fallback behaviour).
7. Pass into existing `lineAgg` shape plus a parallel `basisMap: id → { from_count, count_date }` held in state.

Exclude `financial_treatment` starting with `"Asset"` from inventory mode (already done in current code — keep as-is).

`mode === "deposits"` path: unchanged.

### Part 2 — Two new columns on the inventory table

Insert after "Qty On Hand":

- **Basis** — `<span className="chip chip-warn">Stock take</span>` when `from_count`, else `<span className="chip chip-neutral">GRN total</span>`.
- **Last count** — formatted `count_date` via `@/utils/format` `formatDate`, or `—`.

Update CSV export to include both columns. Sort keys: not required for the new columns (display only) to keep scope tight; if added, only `count_date` as a sortable key.

### Part 3 — Item drill-down sheet (inventory mode)

New component `src/components/procurement/InventoryItemSheet.tsx` modelled on `DepositTransactionSheet.tsx`:

- Right-side `Sheet` (`sm:max-w-[700px]`).
- Props: `item: { id, internal_sku, internal_product_name, qty_on_hand, avg_cost, cost_value, unit } | null`, `lastCount: { count_date, counted_qty, unit_cost, session_id } | null`, `onClose`.
- On open: fetch `grn_items` for `product_master_id = item.id` joined to `goods_received_notes` (id, grn_number, received_date, venue, supplier_id, status in confirmed/disputed) and `suppliers(name)`. Filter to rows after `lastCount.count_date` when present; otherwise show all.
- Header: title `name — SKU`, subtitle `qty units estimated on hand`, avg cost & total value chips.
- Body Section 1 — Last count card (highlighted) with date / counted qty / count value / "Approved" note. If null, muted "No stock count recorded yet…" panel.
- Body Section 2 — Movements table: pinned baseline row (if count exists), then GRN rows newest-first with running total computed in render order (ascending date for math, displayed desc — compute running totals from baseline forward then sort desc for display).
- Footer: baseline qty, GRN qty since, divider, Estimated on hand. No-count variant shows `Total GRN received` only.
- Loading skeleton + empty state ("No GRN receipts since the last stock count.").

Wire in `InventoryOnHandTab.tsx`:
- New `selectedItem` state. Inventory rows get `cursor-pointer hover:bg-primary/10` and `onClick` setter (mirrors the existing deposit pattern).
- Render `<InventoryItemSheet>` gated on `mode === 'inventory'`, passing `lastCount` from `basisMap`/`lastCountMap`.

### Out of scope

- `StockCounts.tsx` entry flow
- Auto-posting approved counts into GL/inventory
- Sidebar, routing, GRN creation, invoice scanner, deposit ledger, finance pages

### Files touched

- edit `src/components/procurement/InventoryOnHandTab.tsx`
- create `src/components/procurement/InventoryItemSheet.tsx`
