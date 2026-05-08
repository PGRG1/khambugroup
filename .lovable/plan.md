
## Goal

Rebuild the KPay settlement parser so it:
1. Extracts both the **per-day batch summary** and the **per-transaction details** from the workbook.
2. **Verifies** every transaction's fee against the contracted rate sheet, flagging any discrepancy.
3. Uses **Gemini 2.5 Pro** as the extraction engine (with a deterministic XLSX pre-pass to keep tokens manageable).

The current data shown in the review modal is mathematically correct — the new value is the **fee audit layer**.

## Contracted fee rates (source of truth)

| Payment Method | Locality | Store | Rate | Rounding |
|---|---|---|---|---|
| Visa | Domestic | All | 1.50% | 2 dp |
| Visa Foreign Card | Foreign | All | 3.00% | 2 dp |
| Mastercard | Domestic | Assembly | 2.60% | 2 dp |
| Mastercard | Domestic | Caliente / Hanabi | 1.50% | 2 dp |
| Mastercard Foreign Card | Foreign | All | 3.00% | 2 dp |
| Alipay | Any | All | 1.20% | 2 dp |
| WeChat Pay | Any | All | 1.20% | 2 dp |
| China UnionPay | Domestic | All | 1.80% | 2 dp |
| PayMe | Any | All | 1.10% | 2 dp |

Stored as a typed `FEE_RATES` table in the edge function, keyed by `(payment_method, locality, merchant_number)`.

## New parser flow

```text
XLSX file
  │
  ▼
┌─────────────────────────────────────────────────────┐
│ 1. Deterministic XLSX read (xlsx lib)               │
│    • Monthly Settlement Report → batches            │
│    • Settlement details        → transactions       │
└─────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────┐
│ 2. Gemini 2.5 Pro audit pass                        │
│    Input: structured rows + FEE_RATES table         │
│    Task : reconcile, classify anomalies, normalize  │
│           payment-type names, flag suspicious rows  │
└─────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────┐
│ 3. Per-batch summary with audit columns             │
│    expected_fee, actual_fee, variance, status       │
└─────────────────────────────────────────────────────┘
```

### Step 1 — Deterministic extraction (already works; tighten it)

Read the two sheets exactly as before:
- `Monthly Settlement Report` rows 8+ → one `batch` per (merchant, settlement_date, transaction_date)
- `Settlement details` rows 4+ → one `transaction` per row, with `payment_method`, `locality` ("Domestic"/"Foreign"), `local_payment_amount`, `transaction_fee`, `settlement_amount`

### Step 2 — Fee verification (the new core logic)

For each transaction:

```
expected_fee = round( amount × rate_for(method, locality, merchant), 2 )
variance     = actual_fee − (−expected_fee)        // KPay shows fees as negatives
status       = ok          if |variance| ≤ 0.01
             | rate_off    if abs variance proportional to amount (suggests wrong rate)
             | unknown_pm  if no rule matched
             | review      otherwise
```

Aggregate to batch level:
- `transactions_total`, `transactions_flagged`
- `expected_fee_total`, `actual_fee_total`, `fee_variance`

### Step 3 — Gemini 2.5 Pro pass (audit, not extraction)

The deterministic step gives us clean rows; we hand Gemini a compact JSON payload (~rows, totals, rate table, flagged items) and ask it to:

1. Confirm each flagged transaction's reasoning (e.g., "row classified as Foreign but card BIN 4385 is HK domestic — likely mis-classified by KPay").
2. Suggest a `recommended_action` per flag: `accept`, `dispute_with_kpay`, `reclassify_locality`, `unknown_method_needs_mapping`.
3. Write a one-sentence batch-level note when the batch has any anomalies.

This keeps Gemini's role narrow (auditor + narrator), so token usage stays low and we don't depend on the model for arithmetic.

Model: `google/gemini-2.5-pro`, with **structured output via tool calling** (no free-text JSON parsing).

## UI changes — `ParseSettlementModal.tsx`

Add to each batch row:
- A status pill: `OK` / `Flagged (n)` / `Unknown PM`
- A small expand caret → reveals per-payment-type lines with `Method | Count | Gross | Expected Fee | Actual Fee | Δ | Status`
- Top-of-modal KPI: `Fee variance: HK$ X` and `Flagged transactions: N`

`Confirm & save` is **enabled** even with flags (with a warning banner) — the flags are persisted, not blocking.

## Database changes

Add columns (migration) to support the audit:

- `payment_settlement_lines`
  - `expected_fee numeric default 0`
  - `fee_variance numeric default 0`
  - `audit_status text default 'ok'` ∈ {ok, rate_off, unknown_pm, review}
  - `audit_note text default ''`

- `payment_settlement_batches`
  - `transactions_flagged int default 0`
  - `fee_variance numeric default 0`
  - `audit_status text default 'ok'`

A new lightweight table for transparency:

- `payment_processor_fee_rates` — seeded with the 9 rules above, editable later if KPay terms change. The edge function reads from this table instead of hardcoding.

```
id | processor_id | payment_method | locality | merchant_number (nullable = all)
   | rate (numeric) | rounding_dp (int) | effective_from | notes
```

## Files to change

- `supabase/migrations/<new>.sql` — new columns + `payment_processor_fee_rates` table + seed for KPay
- `supabase/functions/parse-kpay-settlement/index.ts` — rewrite: deterministic XLSX + Gemini audit pass + persists per-line audit fields
- `src/components/finance/payments/ParseSettlementModal.tsx` — add status pill, expandable per-line breakdown, fee-variance KPI, warning banner
- `src/hooks/usePaymentSettlements.ts` — surface the new audit columns
- `src/integrations/supabase/types.ts` — auto-regenerated

## Out of scope (future)

- Editing the fee-rate table from the UI (Settings page) — Phase 3
- Auto-disputing flagged transactions back to KPay — Phase 3
- PDF parsing fallback (still XLSX only)
- Bank-deposit matching — already planned as Phase 3
