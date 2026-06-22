## Stock Counts module + System Config Procurement section

### 1. Migration `supabase/migrations/<ts>_stock_counts.sql`

Creates the sequence and three tables exactly as specified:
- `stock_locations` (venue, name, sort_order, is_active; UNIQUE(venue,name))
- `stock_count_sessions` (auto session_number `SC-YYYYMMDD-####`, venue, count_date, count_type, status, reference_mode, notes, created_by, approved_by/at)
- `stock_count_items` (session_id, product_master_id, location_id, last_count_qty, counted_qty, unit, unit_cost, notes, counted_by/at; UNIQUE(session_id, product_master_id))

For each table, in order:
1. `CREATE TABLE`
2. `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated; GRANT ALL ... TO service_role;`
3. `ENABLE ROW LEVEL SECURITY`
4. Policies — SELECT to authenticated using true; ALL writes gated by `has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')`

`updated_at` triggers on sessions + items via existing `update_updated_at_column()`.

Seed `app_config('stock_count_reference_mode' = "last_count")` (ON CONFLICT DO NOTHING) and add the per-key authenticated SELECT policy on `app_config`.

### 2. `src/pages/admin/SystemConfiguration.tsx` — append Procurement section

Add `ClipboardCheck`, `GripVertical` to lucide imports. Add `Separator` import. Add a `ProcurementSection` component following the same `SectionShell` pattern, then render it after `RevenueSourcesSection`.

**Part A — Reference mode**: Three option cards (none / last_count / expected). Reads + upserts `app_config.stock_count_reference_mode`. `last_count` has green "Recommended" pill; `expected` has gray "Coming soon" pill and is disabled via `opacity-40 pointer-events-none`. Selecting any enabled option immediately upserts.

**Separator** between parts.

**Part B — Stock locations**: Three underline-tab buttons (Assembly / Caliente / Hanabi). For active venue, list `stock_locations` ordered by `sort_order` with `@dnd-kit/sortable` drag handle, inline pencil-edit (Enter saves / Esc cancels / blur saves), trash delete (window.confirm; if FK-referenced from `stock_count_items` show toast error). Add-row at bottom inserts with `sort_order = max+1`. Reorder updates affected rows.

Section header `count` = total stock_locations across venues.

### 3. `src/pages/procurement/StockCounts.tsx` — replace stub

Single component with `selectedSessionId` state switching between list view and detail view.

**List view**
- Header with "Stock Counts" title + "New Count" button
- Filter bar: Venue select (All/Assembly/Caliente/Hanabi), Status select (All/In Progress/Pending Review/Approved)
- Table inside `card-glass rounded-xl overflow-hidden`. Columns: Session # | Venue | Date | Type | Status | Progress | Value | →
  - Header `bg-primary text-primary-foreground text-xs font-semibold`
  - Rows `hover:bg-accent/30 cursor-pointer`
  - Type/Status badges with the exact color mappings specified
  - Progress: `counted/total` bar (amber in progress, green approved)
  - Value: `unit_cost * counted_qty` sum, only shown for approved sessions, otherwise `—`
  - Trailing `ChevronRight`
- Row click → `setSelectedSessionId(id)`

**New count dialog** (Dialog max-w-md):
- Venue select, count date input
- Count type select (full/category/spot)
- Locations multi-select grid (only if any active locations for venue) with "No locations" dashed tile that clears all
- Notes textarea
- Submit:
  1. Read `app_config.stock_count_reference_mode`
  2. Insert session
  3. Fetch active `product_master`
  4. For each, look up last approved count qty for same venue (most recent `stock_count_items.counted_qty` joined to approved session)
  5. Bulk-insert `stock_count_items` rows (one per product, with `unit_cost` from product_master)
  6. Set `selectedSessionId` to the new session and close dialog

**Detail view** (the user's spec was truncated mid-sentence at "Set</body>"; the remaining detail view spec was cut off):

Before writing the detail view, I need clarification on what it should contain. I'll implement a minimal working detail view as a starting point — header with session metadata, back button, items table with editable `counted_qty` inputs, "Submit for review" → status=`pending_review`, "Approve" (admin/manager only) → status=`approved`. Variance column = `counted_qty - last_count_qty`. This can be refined in a follow-up.

### Files touched
- `supabase/migrations/<new>.sql` (new)
- `src/pages/admin/SystemConfiguration.tsx` (append section)
- `src/pages/procurement/StockCounts.tsx` (replace stub)

No other files modified. `@dnd-kit/sortable` is already in the project (used elsewhere).

### Question before I build

The detail-view spec was cut off mid-sentence ("6. Set</body>"). Do you want me to:
- **(A)** Proceed with the minimal detail view described above (items table with editable counted_qty, submit-for-review, approve, variance column), or
- **(B)** Wait for you to paste the rest of the detail-view spec before I implement?
