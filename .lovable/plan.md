## Scope
`src/pages/RevenueTargets.tsx` only — replace the current `SectionCard` toolbar + `MultiSelect` popovers with a single inline chip toolbar. No changes below the toolbar; filtering logic is unchanged.

## Layout (single `card-glass` bar, one row, left → right)

1. **Month navigator** — `‹ July 2026 ›`, unchanged behavior.
2. Divider `h-5 w-px bg-border mx-1`.
3. **Venue Scope**
   - Label `VENUE SCOPE` in `text-[11px] text-muted-foreground uppercase tracking-wide`.
   - Outlined pill buttons: `All` + one per `activeVenues` from `useVenues()` (never hardcoded).
   - Multi-select toggle: clicking `All` clears `venueIds`; clicking a venue removes it from/adds it to `venueIds` (and implicitly leaves `All` inactive whenever `venueIds.length > 0`).
   - Selected style: `border-primary text-primary bg-primary/10`; unselected: `border-border text-muted-foreground`.
4. Divider.
5. **Day of Week**
   - Label `DAY OF WEEK`.
   - Pills: `All` + reuse existing `WEEKDAYS` const (`Sun…Sat`).
   - Reuse the darker filled active style from the Service Period weekday selector: selected `bg-primary text-primary-foreground border-primary`, unselected `bg-transparent border-border text-muted-foreground`.
   - Same `All` vs individual toggle behavior as Venue Scope, driving `weekdays`.
6. Divider.
7. **Periods** (text-link toggles, no border/bg)
   - `All Periods` + one entry per distinct **name** across `opPeriods` filtered to currently-selected venues (fallback to all `effectiveVenueIds` when none picked), deduped by name — rollup-only periods already excluded by `opPeriods`.
   - Build a `nameToIds` map so clicking a name toggles the set of underlying `servicePeriodIds` for that name across venues. A name is "selected" when every ID for that name is in `servicePeriodIds`.
   - Style: unselected `text-muted-foreground hover:text-foreground`, selected `text-primary font-medium underline underline-offset-4`.
8. Divider.
9. **Status** (existing operating-status filter, preserved)
   - Same text-link style as Periods, driving `operatingStatuses` over the existing `STATUSES` array (`normal`, `mixed`, `events_only`, `closed`) with a leading `All` link.
10. **Right-aligned group** (`ml-auto` + small gap): existing `Set Up This Month` (only when `effectiveVenueIds.length > 0` and `managerLines.length === 0`) OR the refresh icon button (`handleRecomputeStat`) with tooltip `Refresh data`. Same conditional logic as today.

## Component structure

- Remove the `MultiSelect` popover component (or leave defined but unused — prefer removing to keep the file lean since no other caller uses it).
- Replace the outer `<SectionCard className="!p-3">` with a `card-glass rounded-xl px-3 py-2 flex flex-wrap items-center gap-2` container so the bar reads as one continuous strip.
- Introduce small local presentational helpers inside the file (not exported): `<GroupLabel>`, `<PillToggle variant="outlined|filled">`, `<LinkToggle>`, `<Divider>` — kept private to this file to avoid cross-page churn.

## Non-goals
- No popover, no collapse, no `Filters` button.
- No changes to filtering logic, analytics, KPI row, charts, register, or any section below the toolbar.
- No new hooks or state — reuse `filters` from `useRevenueTargetFilters` and existing setters (`setVenues`, `setPeriods`, `setWeekdays`, `setStatuses`).

## Verification
- Toolbar renders on one row at desktop width in a single `card-glass` container with vertical dividers between groups.
- Venue pills exactly match `activeVenues` from `useVenues()` (Assembly, Caliente, Hanabi, Off-Site-Stall, Arca in the current data) — no `Events` unless a real venue row exists.
- Day-of-Week pills use the filled active style already established in the Service Period form.
- Periods and Status render as plain underlined-when-active text links, no border/bg.
- `All` and individual selections never coexist visually (`All` is active iff the corresponding list is empty).
- Load the page fresh with no URL params AND with an explicitly empty `?rt_venues=` — both should render `All` as active on Venue Scope and Day of Week; individual pills should activate correctly when the URL includes real IDs/weekdays.
- Set Up This Month / Refresh button still appears in the same conditions and works.
