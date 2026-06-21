## What's actually in the database

- `payment_processors` still contains **KPay** (active) and **YeahPay** (active). Nothing was deleted by the Revenue Journal rebuild.
- `payment_processor_fee_rates` still contains **12 KPay rates** (Visa 1.50%, Visa Foreign 3.00%, Mastercard 2.60% / 1.50% per merchant, Mastercard Foreign 3.00%, etc.).

So nothing is missing from the data. What's missing is **visibility on the page**:

1. The processor selector at the top of Payments & Settlements defaults to **"All processors"**.
2. The **Fee Rates** tab is hard-coded to render `Select a processor to view fee rates.` whenever no single processor is selected — so on first load it looks empty and KPay never shows its rules.
3. The processor dropdown shows just two unannotated names (`KPay`, `YeahPay`) with no hint that KPay has 12 active rules, so it's easy to assume it's gone.

## Fix (frontend only, no DB changes)

### 1. `src/pages/finance/PaymentsSettlements.tsx`
- Change the initial `processorId` state from `ALL` to the first active processor (preferring KPay by name if present), so the page lands directly on KPay's data with its 12 fee rules visible.
- Add a small count badge next to each processor option in the `Select`: `KPay · 12 rules`, `YeahPay · 0 rules`. Counts come from grouping `transactions`/`batches`/`fee rates` already loaded by the hook (fetch fee-rate counts once in this page via a lightweight query).
- Keep "All processors" as an option but move it to the bottom of the list.

### 2. `src/components/finance/payments/FeeRatesTab.tsx`
- When `processor` is `null` (i.e. "All processors"), instead of the empty placeholder, fetch fee rates for **every** active processor and render them grouped by processor name with a subheading per group (`KPay`, `YeahPay`). The existing per-row expansion logic stays unchanged.
- The Add / Edit form still requires a single processor — show an inline notice "Pick a processor in the header to add a new rate" when in the "All processors" view.

### 3. `src/hooks/usePaymentSettlements.ts`
- No signature change. Optionally expose a `feeRatesByProcessor` map (one extra `fetchAllRows("payment_processor_fee_rates", "*")` call) so both the header dropdown count and the new grouped Fee Rates view share one fetch.

## Acceptance

- Opening **Finance → Payments & Settlements** lands on KPay by default; the Fee Rates tab immediately shows the 12 KPay charge rules expanded by merchant / wallet sub-type.
- The processor dropdown clearly labels `KPay · 12 rules` and `YeahPay · N rules`, so KPay is impossible to miss.
- Switching to "All processors" now lists every rate grouped under its processor heading instead of an empty state.
- No database, RLS, or journal logic is touched.

## Out of scope

- Renaming "KPay" back into any COA account name (the Revenue Journal rebuild intentionally removed "KPAY" from clearing/receivable account names — that decision stands).
- Adding any new fee rates or processors — only restoring visibility of what's already there.
