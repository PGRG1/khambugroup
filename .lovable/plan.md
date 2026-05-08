## Restructure Review Settlement modal into two reconciliation tabs

The current modal mixes two different reconciliation questions into one table. Split them into two clear tabs that mirror the two source sheets in the KPay file.

### Tab 1 — Settlement Details (per-transaction fee audit)

**Question answered:** Is KPay charging the right fee on each transaction, according to our Fee Rates tab?

For every row in the `Settlement details` sheet:
- Classify payment method + locality (Visa / Visa FC / Mastercard / Mastercard FC / Alipay / WeChat / UnionPay / PayMe / unknown).
- Look up the contracted rate from `payment_processor_fee_rates` (same source as the Fee Rates tab), respecting the merchant override (Mastercard 2.60% on Assembly vs 1.50% on Caliente/Hanabi).
- `expected_fee = round(local_payment_amount × rate, rounding_dp)` with the sign convention KPay uses (negative).
- Compare to `transaction fee` from the sheet. Tolerance: |Δ| ≤ HK$0.01.

**Group rows by** (merchant, transaction date, payment method classification) — same grain as today, but **without** mixing in the HK$1 settlement fee. The settlement fee belongs to Tab 2.

**Display:** one row per group with `Settle date | Txn date | Merchant | PM | Count | Gross | Actual fee | Expected fee | Δ | Status`. Status pill: `OK` (all match), `Rate off` (rate exists but math disagrees), `Unknown PM` (no rate rule). Top-of-tab KPI strip: Transactions, Gross, Expected fee, Actual fee, Δ, plus a single "Fees check out" / "N anomalies" banner.

Because the user has confirmed KPay's per-transaction math is correct, this tab should normally show all OK; any non-zero Δ means the Fee Rates tab is out of sync with what KPay actually charged (or an unmapped method like AMEX / JCB slipped through).

### Tab 2 — Monthly Settlement Report (batch reconciliation)

**Question answered:** Does the Monthly Settlement Report row reconcile to the Settlement details, once the HK$1 per-batch settlement fee is applied?

For every row in `Monthly Settlement Report` (one row per merchant + settlement date + transaction date):
- Aggregate matching rows from Settlement details: `details_gross`, `details_fee`, `details_net = sum(settlement amount)`.
- Pull `settlement_fee` (the HK$1) and `points_offset`, `adjustments`, `frozen_amount` from the Monthly row.
- Compute `expected_net = details_net − settlement_fee + adjustments − frozen_amount + points_offset` (signs follow the existing `bank_transfer_fee` / KPay convention; final formula will match how KPay constructs `Net total settlement`).
- Compare to `Net total settlement` on the Monthly row. Tolerance: |Δ| ≤ HK$0.01.

**Display:** one row per Monthly batch with `Settle date | Txn date | Merchant | # | Details net | Settlement fee | Adjustments | Net (Monthly) | Δ | Status`. Status pill: `OK` if reconciled, `Off` if not, `Missing details` if no Settlement details rows match the batch. Top-of-tab KPI strip: Batches, Gross, Net settled, Settlement fees, Reconciliation Δ.

### Modal shell changes

- Replace today's single audit table with `<Tabs>`: **Settlement Details** (default) and **Monthly Settlement Report**.
- Keep the global header banner, but drive its message from both audits combined ("Fees check out and all batches reconcile" vs "N transactions / M batches need review").
- `Confirm & save (N)` stays in the footer and is always enabled — saving still persists batches + lines exactly as today.

### Backend / data changes

`supabase/functions/parse-kpay-settlement/index.ts`:
- Keep the existing per-transaction audit (it powers Tab 1) — already correct.
- Add a second pass that builds a `monthly_audit` array: one entry per Monthly row with `details_gross`, `details_fee`, `details_net`, `monthly_net`, `settlement_fee`, `reconciliation_variance`, `audit_status` ∈ {`ok`, `off`, `missing_details`}.
- Return `{ batches, monthly_audit, audit, unknown_merchants, sheets }`. `batches` shape unchanged so the save path in `usePaymentSettlements.ts` keeps working.

No DB migration required — `payment_settlement_batches` already stores `bank_transfer_fee` (the HK$1) and `net_settlement`. The reconciliation status is computed at parse-time and only shown in the modal; no new columns needed unless you want to persist it.

### Files to change

- `supabase/functions/parse-kpay-settlement/index.ts` — add monthly reconciliation pass and return `monthly_audit`.
- `src/components/finance/payments/ParseSettlementModal.tsx` — split body into two `<Tabs>`, build the two tables and KPI strips, refactor banner.

### Out of scope

- Persisting reconciliation status to the database (modal-only for now).
- Editing the Fee Rates tab to silence Tab 1 anomalies — that's already a separate tab.
- Auto-creating fee-rate rules for unknown methods (AMEX / JCB).
