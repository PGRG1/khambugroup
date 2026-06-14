## Goal

Layer an **asymmetric recovery engine** on top of the existing KPI module so monthly targets drive daily *minimums* that **rise when behind** but **never fall below the original daily expectation** when ahead.

Original monthly target and original daily expectations stay intact — recovery is computed on the fly, never written back over the baseline.

## Concepts

- **Monthly Target** — `kpi_targets` row with `target_period='month'` (the minimum to hit).
- **Daily Baseline** — `kpi_targets` rows with `target_period='day'`. One per DOW (Sun–Sat) when you want different weekday/weekend expectations, otherwise a single any-day row.
- **DOW Weights** — derived from the daily baselines. If only one baseline exists it's used as a flat weight; if per-DOW baselines exist, Friday/Saturday naturally carry more recovery weight because their baseline is larger.

## Math (pure, no DB writes)

```text
weight(d)        = baseline for the day-of-week of date d
MTD weight       = Σ weight(d) for completed days (1 .. today-1)
total weight     = Σ weight(d) for full month
MTD target       = monthlyTarget × MTD weight / total weight
MTD actual       = Σ kpi_actuals.actual_value (1 .. today-1)
MTD gap          = MTD target − MTD actual           (positive = behind)
remaining target = monthlyTarget − MTD actual
remaining weight = Σ weight(d) for today .. month end
required today   = remaining target × weight(today) / remaining weight   (only if behind)
adjusted minimum = max(baseline today, required today)
recovery add-on  = adjusted minimum − baseline today
```

When `MTD gap ≤ 0` → ahead → `required today = baseline today` (no relaxation).

## Status labels

- `Plan Protected` — ahead of MTD target, today's actual ≥ baseline.
- `Maintain Standard` — on track, no recovery needed.
- `Stretch Still Open` — ahead, today's actual not in yet (encourage further upside).
- `Recovery Required` — behind, adjusted minimum > baseline.
- `Critical Recovery` — behind by more than the critical threshold.

## Files

**New**
- `src/utils/kpiRecovery.ts` — pure calculator (inputs above, outputs all derived fields + status).
- `src/pages/kpis/KpiPlanner.tsx` — admin/operator view: pick KPI + venue + month, see per-day baseline / actual / MTD progress / adjusted minimum table, plus headline panel with the calculation breakdown.

**Updated**
- `src/utils/kpiAutoActual.ts` — add `computeAutoActualRange(kpiType, venueName, fromDate, toDate)` for MTD aggregation in one query.
- `src/pages/kpis/MyKpis.tsx` — for any auto-KPI tile that has a monthly target, render the simplified owner panel: Original today · Minimum today · Recovery add-on · Actual today · MTD target · MTD actual · MTD gap/surplus · status badge · Update Actual button. Tiles without a monthly target keep the current simple view.
- `src/App.tsx` — route `/kpis/planner` → `KpiPlanner` (admin/manager only).
- `src/components/AppSidebar.tsx` — add "KPI Planner" link under KPI Management.

## Out of scope (kept as-is)
- KPI Targets page (entry of monthly + per-DOW baselines already works).
- Assignment board, actions, alerts.

## Technical notes
- All calculations live in `kpiRecovery.ts` and are unit-testable.
- DB schema unchanged — recovery math is derived at render time.
- Trading days = every calendar day in the month by default; a future enhancement can subtract `hr_holidays` if you want closed-day handling.
