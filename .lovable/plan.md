## Daily Revenue KPI + Drag-and-Drop Assignment Board

Build on the existing `kpi_cards` / `kpi_targets` / `kpi_assignments` / `kpi_actuals` schema. Three separate cards grouped into a "Daily Trading" bundle, assigned via a drag-and-drop board, with actuals auto-pulled from `sales_data`.

### 1. Seed the three KPI cards

Insert (idempotent) three rows into `kpi_cards`:

| kpi_name | kpi_type | unit |
|---|---|---|
| Daily Revenue | `daily_revenue` | currency |
| Daily Guests | `daily_guests` | number |
| Daily Cheques | `daily_cheques` | number |

`kpi_category = "daily_trading"` on all three so they render as one bundle in the UI.

### 2. KPI bundles (lightweight grouping)

New table `public.kpi_bundles`:
- `name` (e.g. "Daily Trading")
- `description`

New table `public.kpi_bundle_cards`:
- `bundle_id`, `kpi_card_id`, `sort_order`

Seed one bundle "Daily Trading" with the three cards above. Bundles let admins drag a whole bundle onto a user in one drop (assigns all 3 cards at once), and keep the door open for future bundles (e.g. "Weekly Cost Control").

### 3. Auto-fill actuals from sales_data

Extend `useKpiActuals` with a `computeAutoActual(card, venueId, date)` helper that reads `sales_data`:
- `daily_revenue` → `SUM(subtotal + service_charge)` for that venue/day
- `daily_guests` → `SUM(guests)`
- `daily_cheques` → `SUM(orders)` (the project already treats "orders" as cheques)

On the My KPIs page, when a tile's `kpi_type` is one of those three, skip the manual input dialog and show the live auto value next to the target. A small "↻ Refresh" button writes the latest value into `kpi_actuals` (so history is preserved). Targets are still set in KPI Targets.

### 4. Drag-and-drop Assignment Board

Replace `src/pages/kpis/KpiAssignments.tsx` table with a board (`KpiAssignmentBoard.tsx`):

```text
┌──────────────────────┬────────────────────────────────────────────┐
│  LIBRARY (left)      │  USERS (right, one column per user)        │
│                      │  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  Bundles             │  │ Alice    │ │ Bob      │ │ Carol    │    │
│  ▢ Daily Trading     │  │ Manager  │ │ GM       │ │ Finance  │    │
│                      │  │──────────│ │──────────│ │──────────│    │
│  Individual cards    │  │ Daily Rev│ │ MTD Rev  │ │          │    │
│  ▢ Daily Revenue     │  │ Daily Gst│ │          │ │          │    │
│  ▢ Daily Guests      │  │ Daily Chq│ │          │ │          │    │
│  ▢ Daily Cheques     │  │  × ×  ×  │ │  ×       │ │          │    │
│  ▢ MTD Revenue       │  └──────────┘ └──────────┘ └──────────┘    │
└──────────────────────┴────────────────────────────────────────────┘
```

- Library lists bundles (top) and individual cards (bottom). Each item is `draggable`.
- Each user column lists their active assignments as chips. Drop target = the user column.
- On drop: open a small venue picker (multi-select chips for Assembly / Caliente / Hanabi / Events / All Venues). Confirm → bulk insert into `kpi_assignments` (one row per card × venue). If a bundle was dropped, expand to all member cards.
- Click `×` on a chip removes that assignment (delete row).
- Search box at the top of the user column filters users; admin can also toggle "show by role" to group by role instead of individual users.
- Library cards already assigned to a user are still draggable (re-drop = pick more venues).

Use native HTML5 drag-and-drop (no new dependency). The existing `KpiAssignments.tsx` "table" view stays accessible behind a toggle for keyboard users.

### 5. Sidebar / routing

The KPI section already has "KPI Assignment" — rename the route content to the new board, keep URL `/kpis/assignments`.

### Files to add / change

- `supabase/migrations/...` — `kpi_bundles`, `kpi_bundle_cards` with GRANTs + RLS (admin/manager write, authenticated read); seed Daily Trading bundle + three cards.
- `src/hooks/useKpiBundles.ts` — new.
- `src/hooks/useKpi.ts` — add `computeAutoActual` + helper to fetch sales_data per (venue, date).
- `src/pages/kpis/KpiAssignmentBoard.tsx` — new board UI (replaces page body of `KpiAssignments.tsx`).
- `src/pages/kpis/MyKpis.tsx` — auto-fill branch for the three daily cards, "Refresh from sales" button.

### Out of scope

- Composite single-card UI (rejected — going with grouped separate cards).
- Manual entry for the three daily cards (rejected — auto from sales_data).
- Role-based auto-assign rules (could come later; today's board still supports drag-onto-role via the toggle).
