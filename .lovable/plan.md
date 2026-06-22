# Stock Counts Module + Procurement System Config

Build the full Stock Counts page (replacing the stub) and add a Procurement section to System Configuration. Touch only the three files listed plus a new migration.

## 1. Database migration

New tables: `stock_locations`, `stock_count_sessions`, `stock_count_items` (+ `sc_number_seq` sequence for auto-numbered `SC-YYYYMMDD-NNNN` session numbers).

- `stock_locations`: per-venue counting zones (venue, name, sort_order, is_active), unique on (venue, name).
- `stock_count_sessions`: session_number, venue, count_date, count_type (full/category/spot), status (in_progress/pending_review/approved), reference_mode (last_count/none/expected), notes, created_by, approved_by/at.
- `stock_count_items`: session_id, product_master_id, location_id, last_count_qty, counted_qty, unit, unit_cost, notes, counted_by/at. Unique on (session_id, product_master_id).
- GRANTs to `authenticated` + `service_role`; RLS enabled.
- Policies: authenticated SELECT; admin/manager full write via `has_role()`.
- `updated_at` triggers on sessions + items.
- Seed `app_config` with `stock_count_reference_mode = "last_count"` (idempotent) and add an authenticated-read policy for that single key.

## 2. SystemConfiguration.tsx — add Procurement SectionShell

Append one new `SectionShell` (icon: `ClipboardCheck`, title "Procurement", count = total stock_locations rows) below the existing Revenue Sources section. Matches existing collapsed-by-default pattern.

**Part A — Reference mode**: three option cards (radio-dot style) bound to `app_config.stock_count_reference_mode`. Auto-upsert on change. Options: None (blind), Last count qty (Recommended pill, default), Expected on hand (disabled, "Coming soon" pill).

**Part B — Stock locations**: underline-tab venue switcher (Assembly / Caliente / Hanabi). Per-venue list of locations with:
- `@dnd-kit/sortable` drag-reorder (updates `sort_order` for affected rows).
- Inline pencil edit (Enter saves, Esc cancels, blur saves).
- Trash delete with `window.confirm`; if location is referenced in `stock_count_items`, show toast error instead.
- Add row inline (input + Add button), `sort_order = max + 1`.

## 3. StockCounts.tsx — replace stub

Two states controlled by `selectedSessionId` (null = list, set = detail).

### List view
- Header with "New Count" button + filter bar (venue / status selects).
- Sessions table in `card-glass`: Session # | Venue | Date | Type | Status | Progress | Value | →. Colored type & status badges per spec. Mini progress bar + fraction. Value `—` until approved. Row click → detail.

### New count dialog
- Dialog max-w-md with venue + date (grid), count type select, optional locations multi-select grid (renders only if locations exist for chosen venue, includes "No locations" tile), notes textarea.
- Submit flow: read reference_mode → insert session → fetch active product_master → look up last approved counted_qty per product for same venue → bulk insert `stock_count_items` → switch to detail view.

### Detail view
- Back button, header (session # · venue, date · type, status badge), action buttons:
  - `in_progress` → "Submit for review" (sets `pending_review`).
  - `pending_review` + admin → "Approve" (sets `approved`, approved_by, approved_at).
- Tabs: **Count** (default) | **Summary**, underline style.

**Count tab**: progress bar + count, All/Uncounted toggle, zone pills (only if any item has location_id) with rotating color scheme, items grouped by `product_master.level1_category`. Groups collapsed when fully counted, expanded otherwise. Grid columns adapt to reference_mode (none vs last_count/expected). Per row: SKU, item, unit, zone badge or inline `<Select>` to assign, reference qty (italic muted), counted qty input (auto-save on blur, green ring on success), notes popover.

**Summary tab**: four KPI cards (Items counted / Actual value / Variance vs last / Items with variance), variance table with color-coded badges (green ✓ = match, amber −N ≤20%, red −N >20%, blue +N), Export CSV button.

## Technical notes

- Currency/number/date formatting through `@/utils/format`.
- CSV export uses `@/utils/csvDownload` with UTF-8 BOM (project convention).
- Product fetch uses `fetchAllRows` to bypass 1000-row cap.
- Radix `<Select>` items are filtered for non-empty values.
- `@dnd-kit/sortable` is already a project dep (used elsewhere) — no new packages.
- All status/type colors inline per spec (this is the exception to `StatusBadge`, because the spec is explicit about Tailwind classes).
- No changes to `App.tsx`, sidebar, or any other file. Route `/procurement/stock-counts` already wired.

## Files touched

- `supabase/migrations/<new>.sql` — schema + RLS + grants + seed.
- `src/pages/admin/SystemConfiguration.tsx` — append Procurement section.
- `src/pages/procurement/StockCounts.tsx` — full replacement of stub.
