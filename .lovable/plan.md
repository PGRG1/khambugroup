## Goal

Rebuild the Count tab grid so it matches the spec exactly: kill the legacy single-Zone column/dropdown path entirely in multi-mode, restyle the multi-location grid to the portal design system (no neon dots, no inline colors), and make the location pills column-focus rather than row filters. Only `src/pages/procurement/StockCounts.tsx` changes.

## Changes in `StockCounts.tsx`

### 1. Remove legacy zone UI

In `CountTab`:
- Delete `DOT_COLORS` / `LOC_COLORS` usage in the grid headers and rows.
- Delete the legacy single-zone grid block (the `gridCols` table with the Zone column, the `Badge` for assigned location, and the `Select` "— assign —" dropdown). The fallback when `multiMode` is false becomes the **counted-only** grid: SKU | Item | Unit | Last count | Counted | Notes. No Zone column, no assign dropdown.
- Drop `hasZones`, the row-filtering branch `it.location_id !== zoneFilter`, and any related state that becomes unused.

### 2. Pills (column focus, not row filter)

Replace the pill block so that pills only render in `multiMode`:
- "All zones" pill first, then one pill per location in `sort_order`.
- No dots/icons.
- Style: reuse the existing `ZonePill` component but strip the colored dot prop usage. Active pill = `bg-primary text-primary-foreground`; inactive = `bg-muted/40 text-muted-foreground hover:bg-accent/30 border border-border`.
- State variable kept as `zoneFilter` (now means "focused location"). It never filters which rows are shown — remove the row-skip line. It only dims non-active location columns via `opacity-40`.

### 3. Multi-location grid restyle

Header row:
- `<tr className="bg-primary text-primary-foreground text-xs font-semibold uppercase tracking-wider">`
- Cells: SKU (80px, left), Item (auto, left), Unit (55px, center), Last count (75px, center, only when `showRef`), each location (80px, center, name only — no dot), Total (65px, center, add `bg-black/10` overlay on top of header), Notes (32px).
- Apply `opacity-40` to a location `<th>` when `zoneFilter !== 'all' && zoneFilter !== l.id`.

Body rows:
- `className="border-b border-border/40 hover:bg-accent/30 align-middle"`
- SKU: `font-mono text-xs text-muted-foreground`
- Item: `font-medium text-foreground`
- Unit: `text-center text-muted-foreground text-xs`
- Last count: `text-center italic text-muted-foreground`, value or `—`
- Location cell: centered `<Input type="number" placeholder="—" className="h-7 w-16 text-center text-sm mx-auto" />` (plus `ring-1 ring-green-500` flash). Same `opacity-40` dim when other location is focused.
- Total cell: `className="text-center font-semibold bg-muted/40 px-3 py-2 tabular-nums"`. Computed live from controlled input state (see below) — `—` when all null.
- Notes: existing `NotesCell`, 32px column.

Inner table wrapper: `overflow-x-auto`; `style={{ minWidth: \`${680 + activeLocations.length * 85}px\` }}`.

### 4. Live Total

Currently location inputs are uncontrolled (`defaultValue`) and Total only reflects last server snapshot. Add a per-cell controlled draft state `draft: Map<string, string>` keyed by `${itemId}|${locId}` so the Total recomputes on every keystroke:
- Initialize draft from `locQtys` when items load and on session reload.
- `onChange` updates draft.
- `onBlur` keeps current upsert behavior: writes value (or null when blank) to `stock_count_location_qtys`, recomputes total from draft, updates `stock_count_items.counted_qty`, and triggers the green ring for 1.5s.
- Total cell sums the numeric values in draft for that row; `—` if all blank/NaN.

### 5. Blur behavior (unchanged contract)

On blur, only fire when the parsed value differs from the previously saved `locQtys` value. Skip work otherwise so unchanged blurs don't write.

### 6. Things that stay exactly as-is

Category grouping, group open/close, progress bar, Uncounted-only toggle, status workflow buttons, Summary tab, list view, New Count dialog, System Configuration, migrations. No other file touched.

## File touched

- `src/pages/procurement/StockCounts.tsx`
