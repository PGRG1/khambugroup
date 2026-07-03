# Revenue Targets — Finish Pass

Scope: `src/pages/RevenueTargets.tsx` only. No backend, no theme, no other pages.

## Part 1 — Functional fixes

**1a. Drop duplicate Service Period Setup**
- Remove `<ServicePeriodSetupSheet ... />` from header (line ~614) and delete the `ServicePeriodSetupSheet` component block (function runs from ~1554 to end of file).
- Drop now-unused imports: `Settings2` from lucide-react, `Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger`.

**1b. Unify Generate → Initialize into "Set Up This Month"**
- Add handler `handleSetUpMonth`: `await generateStatistical(effectiveVenueIds); const r = await ensureMonth(effectiveVenueIds);` then single toast: `"Benchmarks generated · {r.inserted} draft target rows created"`.
- In the filter bar (replacing the current `Initialize draft rows` block at ~671):
  - If `managerLines.length === 0 && effectiveVenueIds.length > 0` → show prominent primary button `Set Up This Month` (Sparkles/Plus icon).
  - Else → show small icon-only outline button (RefreshCw icon) with `title="Recompute benchmarks only"` that calls `generateStatistical` alone.
- Remove any standalone "Generate Statistical" button rendered elsewhere in header/filter row.

**1c. Multi-period venue hint in `ServicePeriodTable`**
- When rendering a line whose `managerSource !== 'statistical_default'` AND no `stat` value exists for that (venue, period, date), render a muted inline note under the empty target input: *"No automatic benchmark — this venue has multiple service periods. Set manually or click Apply Statistical if a period-level benchmark exists."*
- Detection: venue has >1 operational period in `allPeriods` for that venue.

**1d. Override reason dialog coverage**
- Currently `requestReason` only fires for `not_operating` status changes and a variance-threshold check. Extend to every manual cell edit path in `ServicePeriodTable` (revenue / guests / SPG commits + Apply Statistical revert) so any commit whose value diverges from the `statistical_default` seed triggers the dialog.

## Part 2 — Visual pass (brand tokens only)

**2a. Recolor `C` constant** (top of file, ~line 51):
```ts
const C = {
  stat:    "hsl(var(--chart-8))",
  manager: "hsl(var(--primary))",
  actual:  "hsl(var(--chart-3))",
  pos:     "hsl(var(--success))",
  neg:     "hsl(var(--destructive))",
  grid:    "hsl(var(--border))",
};
```

**2b. Line hierarchy — apply to every chart in the page** (Daily Revenue Performance, Cumulative Pace, Daily Variance, Guest Performance, Spend/Guest, and any variance/driver line charts):
- Statistical: `strokeWidth={1.5} strokeDasharray="4 3" dot={false} opacity={0.6}`
- Manager: `strokeWidth={2} dot={false}`
- Actual: `strokeWidth={2.75} dot={{ r: 3, strokeWidth: 0, fill: "hsl(var(--chart-3))" }}`

**2c. KPI hierarchy**
- Replace current single 6-card grid with two rows:
  - Row 1: one emphasized card "Actual vs Manager" showing `((actual/manager)-1)*100%`, colored via `C.pos`/`C.neg`, styled `border-2 border-primary/30` with larger value text.
  - Row 2 (`grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5`): Statistical Revenue, Manager Revenue, Actual Revenue, Manager Guests, Actual Guests. Drop Actual SPG (already surfaced in Target Summary via RollupCell).
- Every KPI label gets a leading 4px `<span className="inline-block h-1 w-1 rounded-full mr-1.5" style={{ background: C.stat|C.manager|C.actual }} />` matching its data source (skip for the emphasized delta card).

**2d. Collapse deep analytics**
- Wrap the sections currently at ~849 (Day-of-Week Analysis), ~827 (Revenue Variance Drivers), and ~909–941 (Venue Target Performance + Service-Period Revenue Mix) in a shadcn `<Accordion type="single" collapsible>` with a single item `Detailed Analytics`, collapsed by default.
- Keep visible above the fold: header, filter bar, KPI row, Daily Revenue Performance + Target Summary, Cumulative Pace, Guest/SPG pair, then Daily Target Register.

**2e. Rhythm**
- Root container: change `space-y-3.5` → `space-y-4`.
- Ensure the emphasized "Actual vs Manager" card + Daily Revenue Performance chart fit within a 1440×900 viewport with no scroll on load (tighten KPI row to a single line height; hero chart height stays 320).

## Non-goals
No changes to `src/index.css`, `tailwind.config.ts`, backend RPCs, `/revenue/service-periods`, or other pages. No new design tokens.

## Verification
- `npm run build` completes without TypeScript errors.
- Empty month → only "Set Up This Month" visible; click generates + seeds with one combined toast.
- Populated month → small "Recompute benchmarks" icon button instead.
- No occurrences of `hsl(45 96%`, `hsl(152 76%`, or `hsl(199 90%` remain in this file.
- "Actual vs Manager" is the visually dominant KPI.
- Day-of-Week, Variance Drivers, Venue/Period Mix collapsed under "Detailed Analytics" by default.
- 1440px viewport: KPI row + hero chart visible without scroll.
