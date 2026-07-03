## Scope
`src/pages/RevenueTargets.tsx` only — extend the monthly to-date computation and restructure the KPI row into 4 headline cards + a secondary reference row.

## Changes

### 1. Extend monthly to-date accumulation
In the same loop that already builds `managerRevenueToDate` / `managerGuestsToDate`, also accumulate:
- `statRevenueToDate` — sum of `p.statistical.statisticalTargetAmount` for `p.date <= asOf`
- `statGuestsToDate` — sum of `p.statistical.statisticalGuestTarget` for `p.date <= asOf`

Derive and return alongside existing fields:
- `actualSpgToDate = monthly.actualSpg` (actuals only accrue on completed days, so already to-date)
- `statSpgToDate = statGuestsToDate > 0 ? statRevenueToDate / statGuestsToDate : null`

### 2. Restructure KPI row

**Row 1 — 4 equal-weight headline cards** (replace current mixed headline set):

1. **Actual vs Manager** — `(actualRevenue / managerRevenueToDate - 1) * 100`
   - Subtext: `HK$ {actualRevenue} of HK$ {managerRevenueToDate} planned to date`
   - Colored via `C.pos` / `C.neg`
2. **Actual vs Statistical** — `(actualRevenue / statRevenueToDate - 1) * 100`
   - Subtext: `Model accuracy — {completedDays} days tracked`
   - Colored via `C.pos` / `C.neg`
3. **Required Daily Pace** — compute `remaining = monthly.managerRevenue - monthly.actualRevenue`, then three cases:
   - `remainingDays === 0` → value `HK$ 0`, subtext `Month complete`
   - `remaining <= 0` (already ahead of full-month plan) → value `HK$ 0`, subtext `Target already exceeded · {remainingDays} days left` (avoids showing a nonsensical negative pace to someone glancing at it)
   - Otherwise → `fmtHKD(remaining / remainingDays) + "/day"`, subtext `HK$ {remaining} remaining · {remainingDays} days left`
   - Neutral/primary tone in all three cases (operational, not good/bad)
4. **Actual SPG vs Statistical SPG** — `statSpgToDate ? (actualSpgToDate / statSpgToDate - 1) * 100 : null`
   - Subtext: `HK$ {actualSpgToDate?.toFixed(0)} vs HK$ {statSpgToDate?.toFixed(0)} model`
   - Colored via `C.pos` / `C.neg`

All four styled identically — no single emphasized/bordered card.

**Row 2 — secondary reference row**, demoted (smaller text, `text-muted-foreground` labels), keeping `grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5`:
- Statistical Revenue, Manager Revenue, Actual Revenue, Manager Guests, Actual Guests

## Non-goals
- No changes to Daily Revenue Performance chart, Target Summary panel, or Daily Register.
- No backend/RPC changes.

## Verification
- Four headline cards render on one row at desktop width with equal visual weight.
- Required Daily Pace: sensible values mid-month; `Month complete` when `remainingDays === 0`; `Target already exceeded` (floored at HK$ 0) when actuals already meet/exceed the full-month plan.
- Both "vs Statistical" cards use to-date denominators (avoids full-month distortion bug).
- Secondary 5-card row renders below, visually demoted.
