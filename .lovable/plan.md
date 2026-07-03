## Scope
`src/pages/RevenueTargets.tsx` only — `DailyRegister` main row + expanded section + `ServicePeriodTable`. No backend changes. `EventTable` / `EventDialog` stay defined but unused.

## 1. Main row: fully read-only aggregate
Remove the `isSinglePeriodVenue` inline-edit branch from the main row entirely:
- Delete `spLine`, `canInlineEdit`, `effGuest/effSpg`, `guestPrefill/spgPrefill`, `inlineMgrRev` scoped to the main row. Keep `agg`, `stat`, `act`, `actRev`, `statRev`.
- Mgr Rev cell → `fmtHKD(agg.revenue)` (or "Not set" only when `anyDraft`). No badge.
- Mgr Guests cell → `fmtInt(agg.guests)`. No `<Input>`.
- Mgr SPG cell → `fmtHKD(agg.spendPerGuest)`. No `<Input>`.
- `mgrRev` used by performance/deltas = `agg.revenue`.

## 2. Remove "+ Event" button
Delete the `<Button …>+ Event</Button>` JSX and remove the `eventFor` state, `setEventFor`, and `<EventDialog>` render since nothing else opens it. **Keep the `Plus` import** — it's used elsewhere in this file (e.g. Set Up / Initialize draft rows action).

## 3. Expanded section: nested sub-rows, not a boxed sub-table
Replace the `<tr><td colSpan={16}>…ServicePeriodTable…</td></tr>` wrapper with per-period sub-rows rendered directly inside the parent `<tbody>` so columns align with the parent header:

```text
[ ] 01 Mon  Assembly  Normal   Stat…   Mgr…   Act…   MgrG   ActG   MgrSPG  ActSPG  ΔMgr  ΔStat  Perf   [Save/Approve/Status]
              └─ Full Day        —       …      …      [inp]  …     [inp]   …      —     —     —      [badge] [Use Stat] [Not Op]
```

Structure per expanded parent row: one leading empty `<td>` (chevron gutter), then a colSpan-2 sub-label cell ("Full Day" / period name) styled `border-l-2 border-primary/30 pl-6`, then aligned data cells reusing the parent columns. Density: `py-1.5`, no `p-3` wrapper, no "Normal Service" header when only service-period lines exist and no events.

Inline `ServicePeriodTable`'s per-line rendering directly into the parent map rather than keeping it as a standalone component with its own `<thead>` — guarantees column alignment and removes the duplicate header. Each period renders as its own indented sub-row; editing (Guest/SPG inputs, source badge, Use Statistical, Not Op / Reactivate) lives only on these sub-rows.

## 4. Token-driven badge styling
- **Operating Status chip**: `variant="outline" text-muted-foreground border-border` — fades into background.
- **Performance badge**:
  - Future: `variant="outline" text-muted-foreground border-border`
  - On / above: `bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))] border-[hsl(var(--success)/0.3)]`
  - Below: `bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))] border-[hsl(var(--destructive)/0.3)]`
- **Source badge** (only inside expanded sub-row):
  - Statistical: `variant="outline" text-muted-foreground border-border`
  - Manager Adjusted: `bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))] border-[hsl(var(--primary)/0.3)]`

Delta columns (`Act vs Mgr`, `Act vs Stat`) swap `text-emerald-500` / `text-rose-500` → `text-[hsl(var(--success))]` / `text-[hsl(var(--destructive))]` for consistency.

## 5. Input styling
Sub-row Guest/SPG `<Input>`s use:
`className="h-7 w-24 text-right text-xs border-border/60 focus-visible:ring-1 focus-visible:ring-primary/40 bg-background [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"`
Prefill state keeps `text-muted-foreground`; edited state → `text-foreground`.

## 6. Alignment & type polish
- Date cell (`{r.date.slice(8)}`): `text-foreground font-medium` — kill any inherited link-blue styling.
- Every numeric column cell gets `tabular-nums` — audit to ensure no override strips it, especially on delta cells wrapped in template-string classNames.
- Right-aligned numeric columns already use `text-right px-2`; keep.

## Non-goals
- No changes to `--primary` / `--chart-N` / `--success` / `--destructive` definitions in `index.css`.
- No Event UI reintroduction.
- No backend / RPC / schema changes.
- Monthly rollup KPIs, ServicePeriods page, `StatusChip` elsewhere unaffected.

## Verification
- Collapsed row for every venue/day: no `<Input>`, no source badge, no "+ Event" button.
- Expanding any row (single-period Assembly OR multi-period venue): editable Guest/SPG appear only inside indented sub-rows, each with its own source badge and "Use Statistical" / "Not Op" action.
- Performance badge renders in success/destructive/muted token colors across Future / On-above / Below.
- Sub-rows visually attach to parent (left border accent + indent), column-aligned with the parent header — no duplicate `<thead>`, no boxed background card.
- `npm run build` completes without TypeScript errors.
