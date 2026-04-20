
The user wants the monthly revenue target to be split across selected venues based on each venue's **historical performance share**, not equally. Then within each venue, distribute across days using DOW medians (existing logic).

Looking at current code: `RevenueTargetPanel` likely loops each venue and calls `distributeMonthlyTarget(monthlyTarget / venues.length, ...)` — equal split. Need to change to weighted split.

## Plan: Venue-weighted target distribution

### Logic change in `src/utils/forecastDistribution.ts`
Add helper `computeVenueWeights(salesData, venues, lookbackMonths=3)`:
- Sum total sales per venue over last 3 months.
- Return `{ venue: shareFraction }` where shares sum to 1.
- Fallback: equal split if no historical data, or for any venue with zero history.

### Logic change in `RevenueTargetPanel.tsx`
Replace equal-split loop with:
1. Compute venue weights from historical sales.
2. Compute each venue's actuals-so-far for the current month.
3. **Per-venue target** = `overallTarget × venueWeight`.
4. Pass venue-specific target into existing `distributeMonthlyTarget` (which already handles "remaining = target − actuals" and DOW median distribution).
5. Combined table = sum of per-venue results (unchanged).

### UI additions
- In each venue's table header, show its weight: e.g. *"Assembly — 62% of total target (HK$ 496,000)"*.
- Small note above tables: *"Targets allocated by each venue's last-3-month revenue share."*
- If a venue has no history → show a warning chip "Equal share fallback".

### Edge cases
- Single venue selected → 100% weight, behavior unchanged.
- Venue with zero history but others have data → assign 0 (or small floor like 5%); plan: assign 0 and show warning. User can override by deselecting.
- All venues have zero history → fall back to equal split everywhere.

### Files
- Edit `src/utils/forecastDistribution.ts` — add `computeVenueWeights`.
- Edit `src/components/forecast/RevenueTargetPanel.tsx` — use weights when generating per-venue distributions; show weight in headers.

### Verification
1. Select Assembly + Caliente, target HK$ 800K. If history shows Assembly 60% / Caliente 40%, preview shows Assembly target ≈ 480K, Caliente ≈ 320K (minus their respective actuals).
2. Add Hanabi with no history → warning shown, Hanabi gets 0 share, others split 100%.
3. Single venue → gets full target as before.

### Out of scope
- Manual weight overrides per venue (could be a follow-up).
- Configurable lookback window (stays at 3 months).
