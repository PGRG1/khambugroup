
## Goal

Turn the placeholder **Finance → Payments & Settlements** page into a working module that ingests KPay monthly settlement reports (and is extensible to other processors later: Stripe, PayMe, etc.). It should mirror the Bank Reconciliation experience: upload statement → AI extract → user confirms → store in DB → reconcile against sales and against bank deposits.

## What the KPay report contains

From the April 2026 PDF you uploaded:

- **Header**: month, currency (HKD), transaction date range.
- **Store overview** (per merchant number):
  - ASSEMBLY — merchant `852124709700001`
  - CALIENTE AND HANABI — merchant `852124661800002` (shared)
  - Columns: count, transaction amount, frozen, adjustments, fund released, transaction fee, fee offset by points, bank transfer fee, **net settlement**.
- **Store details** — for each store, grouped by transaction date → settlement date → payment type (Visa, Visa Foreign Card, Mastercard, MC Foreign Card, Alipay, Amex, UnionPay, JCB, WeChat, etc.) with count, amount, fee, net. Each batch ends with a bank transfer fee line and a **Total net settlement** that matches a single bank deposit.

This means each KPay file produces three things we care about:

1. A **settlement batch** per (merchant, settlement date) → one bank deposit.
2. **Daily transactions per payment type** → reconciles against POS sales.
3. **Fees** (transaction fees + bank transfer fees + points offsets + adjustments) → posted as expense.

## Data model (new tables)

```text
payment_processors                 -- master: KPay, Stripe, PayMe, etc.
  id, name, type ('kpay'|'stripe'|...), is_active, sort_order

payment_processor_merchants        -- merchant accounts under a processor
  id, processor_id, merchant_number, display_name,
  venue_id (nullable, for shared merchants),
  shared_venues text[] (e.g. ['Caliente','Hanabi']),
  default_bank_account_id, fee_account_id

payment_settlement_imports         -- one per uploaded file
  id, processor_id, period_start, period_end, currency,
  file_url, file_name, uploaded_at, uploaded_by, status

payment_settlement_batches         -- one per (merchant, settlement date)
  id, import_id, processor_id, merchant_id,
  transaction_date, settlement_date,
  gross_amount, fee_amount, points_offset, bank_transfer_fee,
  adjustments, frozen_amount, net_settlement,
  bank_account_id (target), bank_transaction_id (matched), status

payment_settlement_lines           -- per payment-type row in a batch
  id, batch_id, payment_type ('visa','visa_foreign','mastercard',
    'mastercard_foreign','amex','unionpay','jcb','alipay','wechat','payme'),
  count, gross_amount, fee_amount, net_amount

payment_processor_audit            -- audit trail
```

RLS: same pattern as Bank Reconciliation (read = authenticated, write = admin/manager).

## Page layout (replace placeholder, keep structure consistent with Bank Recon)

```text
Header: "Payments & Settlements"
Controls row:
  [ Processor selector: KPay ▼ ]   [ Merchant selector ▼ ]
  [ Upload Statement ]  [ Export ]  [ Lock Period ]

KPI cards (period-scoped):
  Gross transactions | Total fees | Net settled | Unmatched batches

Tabs:
  1. Overview          — chart: daily gross vs net, fee % trend
  2. Settlement Batches — table grouped by settlement date,
                          columns: settle date | merchant | gross | fee
                          | net | bank match status | actions
  3. Transactions       — flat list of all settlement_lines with filters
  4. Merchants          — master table (CRUD), map merchant# → venue(s),
                          default bank account, default fee account
  5. Imports            — file history with re-process / delete
  6. Rules              — auto-mapping rules (payment_type → COA acct)
  7. Audit              — actions log
```

## Upload & extract flow (mirrors `StatementUploadFlow`)

1. User drops PDF → uploaded to `payment-statements` storage bucket.
2. Edge function `parse-kpay-settlement` (Gemini 2.5 Pro, fallback Flash) extracts:
   - Period range, currency
   - For each store: merchant#, total row
   - For each transaction date / settlement date: type lines + bank transfer fee + total net
3. UI shows a **review screen**:
   - Detected merchants → user maps unknown ones to a venue & bank account.
   - Summary table per batch with editable cells.
4. On **Confirm**: insert `import` + `batches` + `lines`, run auto-classification.

## Reconciliation logic

- **Bank side**: each `payment_settlement_batches.net_settlement` should match one `bank_transactions.money_in` on `settlement_date` for the merchant's default bank account. Add an automatic suggestion (already partially handled by `bankTxnRules.ts` "kpay_settlement"). When matched, link both rows.
- **Sales side**: sum of `settlement_lines.gross_amount` per (venue, transaction_date, payment_type) should match POS sales for that day. Variance shown in Transactions tab.
- **Journal posting** (optional later): debit Bank, debit Bank Fees, credit Merchant Receivable / KPay clearing account.

## Phase plan

**Phase 1 — Foundation (this build)**
- Tables + RLS migration.
- Storage bucket `payment-statements`.
- Replace placeholder page with the layout above.
- Implement Merchants tab (CRUD) seeded with the 2 KPay merchants from your file.
- Implement Imports tab + manual upload (file only, no parsing yet).

**Phase 2 — Parser**
- Edge function `parse-kpay-settlement`.
- Review/confirm modal → commit batches & lines.

**Phase 3 — Reconciliation**
- Auto-match settlement batches → bank deposits.
- Variance view vs POS sales.

**Phase 4 — Other processors**
- Add processor type `stripe`, `payme`, etc., each with its own parser.

## Questions before I start Phase 1

1. **Merchant → venue mapping**: `CALIENTE AND HANABI` shares one merchant. When a transaction comes in, do you want to (a) split it 50/50, (b) split by POS sales ratio for that day, or (c) keep it lumped under a synthetic "Caliente+Hanabi" bucket and only split at reporting time?
2. **Bank account mapping**: do all KPay net settlements land in the BOCHK HKD Current `5027` account, or do different merchants settle to different bank accounts?
3. **Scope of Phase 1**: should I also build the parser (Phase 2) in the first pass, or keep this PR to layout + tables + manual upload first, then iterate?
