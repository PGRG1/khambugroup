
# Daily Sales — Audit Report (no code changes)

Route: `/sales-data` → `src/pages/DataPage.tsx` → `src/components/dashboard/DataTable.tsx` fed by `src/hooks/useSalesData.ts`.

---

## 1) Data-flow findings

### 1a. Venue master vs hardcoded UI list — BROKEN
The venue list on this page is a hardcoded string array; it does not read the `venues` master table.

- `src/components/dashboard/DataTable.tsx:338` — `const venues = ["All", "Assembly", "Caliente", "Hanabi", "Events"];` (filter chips)
- `src/components/dashboard/ManualInput.tsx:128-131` — `<option>`s hardcoded to those same four
- `src/components/dashboard/ReceiptScanner.tsx:128, 187, 347-348` — only accepts Assembly/Caliente (defaults everything else to Assembly)
- `src/types/sales.ts:5,28` — `venue: "Assembly" | "Caliente" | "Hanabi" | "Events"`
- `src/utils/salesUtils.ts:7,176,181` — Zod enum + `parseExcelRow` reject anything not in that set (silently `return null`, so those spreadsheet rows are dropped without warning)

Actual `venues` table (tenant `…beef`, active):
`Arca, Assembly, Caliente, Hanabi` (+ inactive `Off-Site / Stall`).

Consequences:
- **Arca** is a real active venue in the master table but is invisible in Daily Sales filters, in the Manual Entry dropdown, in the Receipt Scanner, and would be rejected by Excel upload and the Zod schema. Any Arca sale cannot enter through this page.
- **Events** appears in the UI filter but is **not a venue** — it is a `revenue_sources` row (currently `is_active=false`). No `sales_records.venue = 'Events'` row exists (DB confirms 0). The chip does nothing except return an empty table.
- If someone ever inserts `venue = 'Events'` via SQL or another surface, the Daily Sales table would show it but `useUnmappedVenues` (which iterates the real `venues` master) would not flag it, and the Zod validator would reject the same value on re-upload → silent asymmetry.

### 1b. Hanabi flow — currently EMPTY, not broken
`SELECT venue, COUNT(*) FROM sales_records` → only `Assembly` (281) and `Caliente` (280). Hanabi has zero rows. The UI paths (filter chip, month totals, "All Venues" aggregation via `matches()` at `DataTable.tsx:139`) would include Hanabi rows correctly *if any existed*, because filtering is a strict `r.venue !== venueFilter` string compare and totals sum all filtered rows. So Hanabi is not being silently dropped — it just has no data to display. Worth confirming with the user whether Hanabi sales are supposed to be ingested here.

### 1c. Tenant scoping — WEAK on the main fetch
`src/hooks/useSalesData.ts:89-91`:
```ts
const rows = (await fetchAllRows("sales_records", "*", { col: "date", asc: true }))
  .filter((row) => row.tenant_id === tenantId);
```
RLS on `sales_records` will protect it, but the hook fetches **every row the caller can see** and filters client-side. Mutations (`update/delete/getRecordById`) correctly add `.eq("tenant_id", tenantId)`. The read path should do the same server-side (`.eq("tenant_id", tenantId)` inside `fetchAllRows`) for defence-in-depth and to avoid over-fetching if the user ever gains multi-tenant visibility. Not currently causing incorrect numbers for a single-tenant user, but it is inconsistent with the rest of the codebase.

### 1d. Casing / typos / null venues
No casing drift in DB today (only exact `Assembly`/`Caliente` present). But because the client uses `===` string compare and there is no DB check-constraint tying `sales_records.venue` to `venues.name`, any future casing mistake (e.g. `"assembly"`, trailing space) would silently disappear from every filter and from `useUnmappedVenues` (which only iterates the master list). No safeguard exists on the page today.

### 1e. Date grouping / month boundaries — OK, with one caveat
- `safeMonthKey` (`DataTable.tsx:30`) prefers the raw `YYYY-MM-DD` string slice, avoiding TZ drift. ✅
- Date range filter uses `new Date(r.date)` and compares against local `from`/`to` (`toEnd.setHours(23,59,59,999)`). Fine for HKT users; would be off-by-one for a viewer whose browser TZ is west of UTC on the boundary day. Minor.
- URL projection uses `from.toISOString().slice(0,10)` which converts local midnight to UTC → for a user east of UTC this can serialise the previous calendar day. Cosmetic (chip label) rather than a totals bug.
- `handlePeriodSelect` (`:266`) constructs month bounds in local time correctly.

### 1f. Events double-counting risk
Currently no `sales_records.venue = 'Events'` rows exist, and `revenue_sources.Events` is inactive. So no double-counting today. Once someone activates a revenue-source dimension, keeping `Events` as both a venue chip and a source will cause confusion. It should be removed from the venue enum outright.

---

## 2) Design / UX findings on `/sales-data`

Flagged **broken** vs **suboptimal**.

### Broken
- **B1. Hardcoded venue enum** (`DataTable.tsx:338`, `types/sales.ts:5`, `salesUtils.ts:7`). Missing Arca, includes non-venue Events. See 1a.
- **B2. Receipt Scanner accepts only Assembly/Caliente** (`ReceiptScanner.tsx:128,187`) even though the dropdown lists them. Scanning a Hanabi receipt silently becomes an Assembly record.
- **B3. Excel upload silently drops rows** with unknown venues (`salesUtils.ts:176` returns `null`). No user-facing warning about which rows were rejected.
- **B4. Loading state**: `DataPage.tsx:23-29` renders raw text `"Loading data..."` — the batch-1 convention is skeletons. Regression vs the rest of finance.

### Suboptimal (design/UX)
- **U1. Page header**: `DataPage.tsx:40-43` uses a bespoke `text-gradient-gold` H1 + "N records" caption. Every other refactored page uses `<PageHeader>` (Home/Procurement/Finance batches). Inconsistent hierarchy.
- **U2. Action buttons** (`DataPage.tsx:31-34, 46-75`) hand-roll `primaryBtn`/`secondaryBtn` classes instead of `<Button variant=…>`. Height mismatch with the h-9 toolbar convention.
- **U3. Venue filter is a wrapping row of pill buttons** (`DataTable.tsx:441-453`). No visual grouping, no icon, no count-per-venue, no scroll on mobile — will overflow when venues grow beyond 4. Should be a segmented control or a `<Select>` on narrow viewports.
- **U4. Reconciliation banner** (`:383-411`) uses raw amber tokens (`text-amber-500`, `bg-amber-500/5`, `border-amber-500/40`) instead of the semantic `warn`/`destructive` design tokens used elsewhere. Won't retheme.
- **U5. Chip row + Clear-all** (`:415-434`) uses inline utility classes rather than the shared chip styles from `mem://index.md` (`.chip .chip-*`). Visual drift from the rest of the app.
- **U6. Toolbar layout**: DateFilter, venue pills, search, Mapping link, CSV button are all crammed into one row (`DataTableShell`). On tablet it wraps awkwardly; there is no scope line ("Showing X of Y records · filtered by …") separate from the chip row.
- **U7. No empty state art**: when filters return nothing, the cell just says "No records found." (`:522-525`). Batch-1 convention is a small illustration + a "Clear filters" CTA.
- **U8. Month header row** (`:531-548`) reuses `formatCurrency` for `orders`/`guests` counts → "1,234" is fine but they are not currency. Should use `fmtNum`, and the totals row should say `HK$` prefix for money columns to make the two visually distinct.
- **U9. HK$ formatting / truncation**:
  - `formatCurrency` returns a bare integer string with no `HK$` prefix (`salesUtils.ts:170-172`). Numbers on this page never show the currency mark — inconsistent with the memory rule "Currency = HK$ 1,234.56".
  - Numeric cells (`numCell` at `:314-333`) render `text-xs td-num` inside a fixed-width `<TableCell>`. On mobile at 320-360 px widths the Subtotal / Total columns can compress; there is no `whitespace-nowrap` on the number span, so long HK$ figures could wrap or clip depending on browser font metrics. User explicitly forbids truncation with ellipsis — currently there is no `text-ellipsis` in the cell but also no auto-shrink to guarantee full display; needs the Home/Procurement KPI auto-shrink treatment or `tabular-nums whitespace-nowrap` on every numeric cell.
- **U10. Mobile layout**: `DataTable` is a wide `<Table>` with 11 columns; no mobile card fallback. Horizontal scroll is the only option on phones. Batch-1 pattern is card-per-row < md.
- **U11. Chart legibility**: this page currently has **no charts** — just a table. Given the name "Daily Sales", a compact spark trend of daily totals across the visible date range (like `RevenueTrend`) would improve at-a-glance value; today the user has to read the month totals row. (This is a scope question, not a bug — flagging for your call.)
- **U12. Filter state visibility**: active filters live in chips at the top and again as the ring around the venue pill; the DateFilter component has its own internal chip. Three sources of truth → users can miss that a date is applied. Consolidate into one scope line.
- **U13. Numeric column headers "Ord / Gst / Svc / Disc"** (`:376-377`) are abbreviated to save width but are opaque without a tooltip. Add `title=` or expand on ≥ md.
- **U14. Sortable header target size**: `<button>` inside `<TableHead>` has no explicit height, ends up ~24 px — below the 44 px touch target the rest of the finance batch uses.
- **U15. Colour semantics**: negative discounts and mismatch warnings both use `text-destructive` (`:319-322`). Mismatched totals are a warning (fixable), not an error — should be `warn` token to match batches 1-2.
- **U16. Unmapped-venues banner** (`:398`) sends the user to `/finance/chart-of-accounts`, but the actual place to fix a revenue mapping is the Account Mappings tab within that page. Should deep-link with `?tab=mappings`.

---

## Recommended next step (still in plan mode — no edits)

Decisions I need from you before I write the fix plan:

1. **Venue source of truth**: switch the Daily Sales filter, ManualInput, ReceiptScanner and Excel validator to read from the `venues` master table (via `useVenues`)? This drops the hardcoded enum and would automatically surface Arca and any future venue. `SalesRecord.venue` would become `string`.
2. **Events**: remove `Events` from the venue enum entirely (it is a `revenue_sources` row, not a venue) — confirm?
3. **Hanabi**: no rows in DB today. Do you expect Hanabi sales to be ingested via this page, or is Hanabi captured in another system?
4. **Charts on Daily Sales**: add a compact daily trend spark + venue mix donut (U11) or keep table-only?
5. **Scope of visual refresh**: apply the same batch-1/2 finance treatment (`<PageHeader>`, `<KpiCard>` strip with daily/period totals, skeletons, mobile cards, semantic tokens, chip system, scope line, HK$ auto-shrink) — confirm you want the full pass?

Once you answer these I will produce the implementation plan.
