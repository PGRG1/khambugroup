## Scope
`src/pages/RevenueTargets.tsx` (DailyRegister + ServicePeriodTable) and `src/components/revenue-targets/AdjustmentReasonDialog.tsx`. No backend changes. `EventTable`/`EventDialog` remain defined but unrendered.

## 1. Fix "Use Statistical" (structural bug)

The current guard `stat.servicePeriodId === l.servicePeriodId` never matches because the Full-Day stat row's `servicePeriodId` is the venue rollup, not an operational period. Replace with a single-period-venue check driven by `periods`:

```ts
const isSinglePeriodVenue = periods.filter(
  (p) => p.venueId === l.venueId && p.isActive && !p.isRollupOnly,
).length === 1;
const canUseStat = isSinglePeriodVenue
  && stat?.statisticalGuestTarget != null
  && stat?.statisticalSpendPerGuest != null;
```

Wherever the ServicePeriodTable currently reads `statForPeriod.*` for Stat Rev / Guests / SPG, read from `stat` directly and gate display on `isSinglePeriodVenue` (else render `"—"`). The `Use Statistical` button is disabled unless `canUseStat`; tooltip is:
- multi-period: `"No per-period benchmark — this venue has multiple service periods"`
- single-period, no benchmark: `"Statistical benchmark unavailable for this day"`

## 2. Prefill Guest / SPG from statistical, muted until edited

In both `ServicePeriodTable` rows and the new single-period main row (see §3):

```ts
const effGuest = l.managerGuestTarget ?? stat?.statisticalGuestTarget ?? null;
const effSpg   = l.managerSpendPerGuestTarget ?? stat?.statisticalSpendPerGuest ?? null;
const guestPrefill = l.managerGuestTarget == null && stat?.statisticalGuestTarget != null;
const spgPrefill   = l.managerSpendPerGuestTarget == null && stat?.statisticalSpendPerGuest != null;
```

Bind inputs to `effGuest ?? ""` / `effSpg ?? ""`, styled `text-muted-foreground` when the prefill flag is true, otherwise `text-foreground`. Clearing an input writes `null`, restoring the muted prefill. Revenue is always `Guest × SPG`, read-only, no direct input.

## 3. Main row: inline-editable for single-period venues

In `DailyRegister`'s main row per (venue, date):

- **Single-period venue** (`opLines.length === 1` and that line is operational): render Mgr Guests / Mgr SPG as `<Input>`s with the §2 prefill/muted behavior, wired to `onEdit(opLines[0].id, …)`. Mgr Rev = `Guest × SPG` computed, read-only.
- **Multi-period venue**: leave the row exactly as today (read-only aggregate); editing happens inside the expanded ServicePeriodTable.

## 4. Source badge — Statistical vs Manager Adjusted

`resolveManagerSource` already exists near `performSaveDay` and both `managerSource: resolveManagerSource(t),` payload replacements are already in place — no changes needed there.

Render a badge:
- `"statistical_default"` or null → `<Badge variant="outline" className="text-[10px]">Statistical</Badge>`
- `"manual"` → `<Badge variant="default" className="text-[10px]">Manager Adjusted</Badge>`

Placement: on every ServicePeriodTable row (in the Actions cell — replace the existing "Statistical / Manager override" badge with the new label wording), and on the main DailyRegister row **only when single-period** (next to the Mgr Rev cell). No badge on multi-period main rows.

## 5. Reason-dialog trigger for real overrides

In `AdjustmentReasonDialog.tsx`, `manual_override` kind is already registered (previous work). Confirm the HEADING/HINT copy matches the spec; adjust if drifted.

In `saveDay`, the trigger order is already: `varianceExceedsThreshold` → `manual_override` transition → save. Verify the `hasManualOverrideTransition` computation matches the spec exactly (using `original.managerSource == null || === "statistical_default"`) and that no reference to any invented function remains.

## 6. New columns + performance badge in main row

Header changes (`<thead>`): after `Act vs Mgr` add columns `Act vs Stat` and `Performance` (distinct from the existing operating-status `StatusChip`, which stays).

Row rendering:
- Stat Rev cell: value on line 1, `<div className="text-[10px] text-muted-foreground">Median of prior {WEEKDAYS[wd]}s</div>` beneath (only when `stat` is present).
- Act vs Stat: `actRev != null && stat ? fmtHKD(actRev - stat.statisticalTargetAmount) : "—"`, coloured `text-emerald-500` if `>= 0`, `text-rose-500` if `< 0` (mirrors Act vs Mgr).
- Performance badge:
  - `actRev == null` → `<Badge variant="outline" className="text-[10px] text-muted-foreground">Future</Badge>`
  - `actRev >= mgrRev` → `<Badge className="text-[10px] bg-emerald-500/15 text-emerald-500 border-emerald-500/30">On / above</Badge>`
  - else → `<Badge className="text-[10px] bg-rose-500/15 text-rose-500 border-rose-500/30">Below</Badge>`

## Non-goals
- No backend/RPC/schema changes.
- Don't touch `EventTable`/`EventDialog` definitions or re-enable their rendering.
- Don't alter the existing operating-status `StatusChip` / status `Select`.

## Verification
- Untouched day: Guest/SPG show muted prefilled statistical values; badge "Statistical"; save fires no dialog.
- Edit + save: text weight normal; DB `manager_source = "manual"`; badge flips to "Manager Adjusted"; first divergence fires `manual_override` dialog.
- Aggregate day variance >15% still independently fires the existing `variance_threshold` dialog.
- Single-period venue: main row is inline-editable; "Use Statistical" applies real numbers.
- Multi-period venue: main row read-only, no badge; per-period editing/badges/"Use Statistical" all work inside the expanded ServicePeriodTable.
- `Act vs Stat` and Performance badge render correctly across Future / On-above / Below.
- Typecheck passes: `bunx tsgo --noEmit`, or `npm run build` as fallback if tsgo isn't available.
