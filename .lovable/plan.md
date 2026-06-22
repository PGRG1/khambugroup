# Transfers Page

Build the venue-to-venue Transfers feature at `/procurement/transfers`. Two new tables, one full-page React component replacing the current stub. No stock movement logic — just a logged paper trail.

## 1. Database migration

New sequence + two tables:

- `transfer_number_seq` — auto-numbers transfers as `TRF-YYYYMMDD-0001`.
- `public.transfers` — header row: from/to venue, optional from/to `stock_locations`, status (`draft` / `confirmed` / `received` / `cancelled`), transfer date, notes, created_by, received_by, received_at.
- `public.transfer_items` — line items: FK to transfer + `product_master`, quantity_sent, quantity_received, unit, unit_cost, notes. Unique on (transfer_id, product_master_id).

Access rules (plain English):
- Any signed-in user can view transfers and their items.
- Only admins and managers can create, edit, confirm, receive, or cancel transfers and their line items.

Plus: GRANTs to authenticated/service_role, RLS enabled, `updated_at` triggers on both tables using the existing `update_updated_at_column()` function.

## 2. `src/pages/procurement/Transfers.tsx`

Single component, list/detail pattern like `StockCounts.tsx`. State: `selectedTransferId` (null → list, set → detail) and `dialogOpen` for the New Transfer modal.

### List view

- Header: page title "Transfers" + primary `New Transfer` button.
- Filter bar: From venue, To venue, Status, date/month filter.
- `card-glass rounded-xl` table:
  - Columns: Transfer # · From → To (with `ArrowRight` icon) · Date · Items count · Status badge · Value · `ChevronRight`.
  - Status badges per spec (draft/confirmed/received/cancelled color map).
  - Value = Σ(quantity_sent × unit_cost); shows "—" for drafts.
- Row click → opens detail.

### New Transfer dialog

`max-w-lg`. Fields:
- From venue + To venue (2-col). Inline error if equal.
- From location + To location (2-col, optional, filtered by selected venue from `stock_locations`, only rendered when locations exist).
- Transfer date (defaults today).
- Items table: searchable product picker from `product_master` (active only, via `fetchAllRows`), Qty, Unit (auto from product, editable), Unit cost (auto from product, editable), remove button, `Add item` action. Min 1 item to submit.
- Notes textarea.

Submit: insert `transfers` (status `draft`) + bulk insert `transfer_items`, then open the new transfer's detail view and close the dialog.

### Detail view

- Back button → clears `selectedTransferId`.
- Header left: `transfer_number · From → To` (xl bold, ArrowRight between venues), then date + status badge below.
- Header right (status-driven actions):
  - draft: `Confirm Transfer` (blue) → status `confirmed`; `Cancel` (destructive, sm) → status `cancelled`, disabled if any line has `quantity_received`.
  - confirmed: `Mark as Received` (green) → opens Receive dialog.
  - received/cancelled: no actions.

Tabs (underline style): **Items** (default) and **Details**.

**Items tab** — `card-glass` table with columns SKU · Item · Unit · Qty Sent · Qty Received · Unit Cost · Total · Notes. Qty Received colored green/amber/red vs Qty Sent when status is `received`, otherwise "—". Footer row sums total value. When status is `draft`, an `Edit items` button above the table enables inline add/remove of rows.

**Details tab** — 2-col grid of read-only label/value pairs: Transfer # · Status · From venue · To venue · From location · To location · Transfer date · Created by · Received by · Received at · Notes (full width).

### Receive dialog

`max-w-md`. Table of items with editable `Qty Received` (pre-filled with `quantity_sent`), plus Received date and Notes. On confirm: update each `transfer_items.quantity_received`, then set transfer `status='received'`, `received_by=auth user`, `received_at=now()`.

### Styling

All visuals reuse the existing portal system: `card-glass`, `rounded-xl`, `bg-primary text-primary-foreground` table headers, `border-border/40` dividers, `hover:bg-accent/30`, `text-muted-foreground` secondary, `font-display` headings, tabular-nums for numbers.

## Out of scope

- No stock movement / inventory deduction (later phase).
- No CSV export wiring yet (use `downloadCSV` later if asked).
- No other files touched besides `Transfers.tsx` and the new migration.

## Technical notes

- Tables fetched via standard supabase client; `product_master` list via `fetchAllRows` to bypass the 1000-row cap.
- Venues hardcoded to Assembly / Caliente / Hanabi per spec.
- `stock_locations` filtered by `venue` column and ordered by `sort_order`.
- Status transitions guarded client-side; RLS guards server-side.
