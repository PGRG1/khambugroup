## Problem

When opening the **Settlement Details Audit** tab, a warning banner (e.g. "1110 transaction(s) flagged. Net Δ -14,427.49") and a table full of red `Unknown PM` rows appears for a fraction of a second before the real numbers settle to zero.

## Root cause

`SettlementDetailsAuditTab.tsx` initializes `rates` as an empty array and fetches `payment_processor_fee_rates` inside a `useEffect`. The `enriched`/`totals` memos run immediately on first render with `rates = []`, so:

- `findRate(...)` returns `null` for every transaction
- every row is tagged `unknown_pm`
- the KPI banner sums all of them into a fake net delta

Once the Supabase query resolves (a few hundred ms later), state updates and the view recomputes correctly — producing the visible flash.

## Fix

Add an explicit `ratesLoading` state and suppress the audit results until the fee-rate fetch has completed.

1. In `SettlementDetailsAuditTab.tsx`:
   - Add `const [ratesLoading, setRatesLoading] = useState(true);`
   - Wrap the `loadRates` effect: set `ratesLoading` true before the query, false in `finally` (guarded by `cancelled`).
   - When `processor` is null, set `ratesLoading = false` (nothing to load).
2. In the render:
   - While `ratesLoading` is true (and a processor is selected), render a lightweight skeleton/placeholder in place of the warning banner, KPI strip, and table — reusing the existing card layout so there is no layout jump.
   - Do **not** render the `flagged > 0` warning banner or the KPI delta tone until rates are loaded.

No business-logic changes; only render gating.

## Files

- `src/components/finance/payments/SettlementDetailsAuditTab.tsx`

## Verification

- Reload `/finance/payments-settlements` and click **Settlement Details Audit** — the banner should never flash; the skeleton appears briefly, then the correct (zero-flag) state renders.
- Switching processors should also show the skeleton during the refetch instead of a stale "all flagged" view.
