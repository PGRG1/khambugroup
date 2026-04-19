
The user wants to add a **Revenue Target** feature to the Forecast Input page. They want to enter a monthly target (e.g. HK$ 800,000) and have the system distribute that target across each day of the month proportionally — using the **median** day-of-week pattern (so weekends get more, weekdays less, matching historical behavior).

Let me check the current forecast page structure to plan precisely.

Key questions I need to resolve in the plan:
- Where does the target input live? → Top of `ForecastInput.tsx`, next to the period selector.
- How to distribute? → Use historical sales weighted by day-of-week median share, then scale so days sum to target.
- Per venue or total? → User said "the revenue" (singular) for the month. I'll plan per-venue target with a total-target option, but default to per-venue since forecasts are per-venue.
- Persisted? → Store monthly targets in a new `revenue_targets` table.

## Plan: Monthly Revenue Target with smart daily distribution

### 1. New table `revenue_targets`
| column | type |
|---|---|
| id | uuid |
| year | int |
| month | int (1-12) |
| venue | text (Assembly/Caliente/Hanabi/Events, or 'TOTAL') |
| target_amount | numeric |
| created_by | uuid |
| created_at, updated_at | timestamptz |

Unique on `(year, month, venue)`. RLS: read all authenticated, write admin/manager.

### 2. UI: Target panel on Forecast Input page

Add a `RevenueTargetPanel` component at the top of `src/pages/ForecastInput.tsx`:

```
┌─ Monthly Revenue Target ──────────────────────────────┐
│  Month: [April 2026 ▾]   Venue: [All Venues ▾]        │
│  Target: HK$ [  800,000  ]   [Save]  [Apply to Days]  │
│                                                        │
│  Currently forecasted total:  HK$ 612,400  (76.5%)    │
│  Gap to target:               HK$ 187,600              │
└────────────────────────────────────────────────────────┘
```

### 3. Distribution algorithm ("Apply to Days")

When user clicks **Apply to Days**:

1. Pull last 3 months of `sales_records` for the selected venue(s).
2. Group by day-of-week (Mon–Sun) and compute the **median revenue share** per weekday (e.g. Sat = 22%, Sun = 18%, Mon = 9%…).
3. For each date in the selected month, look up its weekday share and compute:
   `daily_target = (weekday_share / sum_of_shares_for_month) × monthly_target`
4. For each day, back-calculate `forecasted_customers` and `forecasted_avg_spend`:
   - Use the same weekday's median **avg spend per guest** from history → keeps spend realistic.
   - `customers = daily_target / avg_spend`, rounded.
   - Recompute gross / service / total via existing `calculateForecast`.
5. Upsert into `forecasts` table for each day (status: `draft`, submittedBy: current user). Existing forecasts for that date+venue get overwritten with confirmation.
6. Show a **preview modal** before writing: table of `Date | Day | Target | Customers | Avg Spend | Total`, with [Confirm & Save] / [Cancel].

### 4. Visual indicator on existing forecast list
Each day row shows a small badge:
- Green if forecast ≥ daily target
- Amber if 80–100% of target
- Red if < 80%

A small progress bar at the top of the month view: `Forecasted: HK$ X / Target: HK$ Y (Z%)`.

### 5. Files to change
- **New migration**: create `revenue_targets` table + RLS.
- **New** `src/hooks/useRevenueTargets.ts` — CRUD for targets.
- **New** `src/utils/forecastDistribution.ts` — median weekday share + distribution math.
- **New** `src/components/forecast/RevenueTargetPanel.tsx` — input UI + apply button + preview modal.
- **Edit** `src/pages/ForecastInput.tsx` — mount the panel; pass current forecasts so it can compute "currently forecasted vs target".
- **Edit** `src/components/forecast/ForecastKPICards.tsx` (optional) — add "vs Target" KPI tile.

### Verification
1. Set target HK$ 800,000 for Assembly April → click Apply → preview shows 30 daily rows summing to 800,000, with Sat/Sun heavier than Mon/Tue.
2. Confirm → forecasts table populated for all April Assembly dates as drafts.
3. Edit one day manually → progress bar at top updates instantly.
4. Try with no historical data for a venue → falls back to even distribution and shows a warning.

### Out of scope
- Year-level targets (only monthly).
- Auto-approval (drafts still need approval workflow).
- Cross-year months.
