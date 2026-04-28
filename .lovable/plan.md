## Goal

Reset the Chart of Accounts and account-mapping for Revenue only, so the data scraped from a sales receipt (Subtotal, Service Charge, Discount, Tips, plus payment methods) maps cleanly into the books — per venue — through a friendly, visual mapping screen.

Everything else (invoices, payroll, manual lines) stays in the database but is hidden from the UI for now and excluded from posting until we get to those modules.

## 1. Rebuild the Chart of Accounts (multi-venue, Revenue-focused)

Wipe the existing COA and reseed only what Revenue needs. Four venues: **Assembly, Caliente, Hanabi, Events**.

```text
REVENUE
  4010  Sales – Assembly
  4020  Sales – Caliente
  4030  Sales – Hanabi
  4040  Sales – Events
  4110  Service Charge – Assembly
  4120  Service Charge – Caliente
  4130  Service Charge – Hanabi
  4140  Service Charge – Events
  4210  Sales Discounts – Assembly       (contra-revenue)
  4220  Sales Discounts – Caliente
  4230  Sales Discounts – Hanabi
  4240  Sales Discounts – Events

ASSETS (cash / receivables that sales settle into)
  1020  Cash on Hand                     [is_cash]
  1210  Merchant Receivable – Visa
  1220  Merchant Receivable – Mastercard
  1230  Merchant Receivable – Amex
  1240  Merchant Receivable – UnionPay
  1250  Merchant Receivable – JCB
  1260  Merchant Receivable – Alipay
  1270  Merchant Receivable – WeChat
  1280  Merchant Receivable – PayMe

LIABILITIES (tips collected on cards, owed to staff — balance sheet)
  2110  Tips Payable – Assembly
  2120  Tips Payable – Caliente
  2130  Tips Payable – Hanabi
  2140  Tips Payable – Events
```

Existing accounts that other modules reference (AP, Salary Payable, MPF, COGS, OpEx, Equity) stay in the table but are filtered out of the new Revenue-only UI. Old per-card receivable accounts (1211–1217) and the legacy "KPAY" lump are removed.

Old `account_mapping_rules` are wiped and reseeded with sensible defaults (Cash → Cash on Hand; each card brand → its own Merchant Receivable; each venue's Sales/Service/Discount → its venue accounts). Existing posted journal entries are deleted and rebuilt.

## 2. Extend the data model for Tips

`sales_records` already has `card_tips`. We add it to the posting logic:
- DR Merchant Receivable (the tip rides on the card payment)
- CR Tips Payable – {venue}

Add a new mapping rule type `tips_payable` (per venue) so the user can re-route tips to a different account if they want.

## 3. New "Revenue Mapping" screen — replaces the current mapping tab

The existing `ChartOfAccounts.tsx` mapping panel is generic, dense, and confusing. Replace it with a **visual matrix** focused only on Revenue, grouped the way a non-accountant thinks:

```text
┌──────────────────────────────────────────────────────────────────────┐
│  Revenue Mapping                            [Rebuild Ledger]         │
├──────────────────────────────────────────────────────────────────────┤
│  SALES SIDE        │ Assembly │ Caliente │ Hanabi  │ Events          │
│  Sales (Subtotal)  │ [4010 ▾] │ [4020 ▾] │ [4030 ▾]│ [4040 ▾]        │
│  Service Charge    │ [4110 ▾] │ [4120 ▾] │ [4130 ▾]│ [4140 ▾]        │
│  Discount (−)      │ [4210 ▾] │ [4220 ▾] │ [4230 ▾]│ [4240 ▾]        │
│  Tips (BS)         │ [2110 ▾] │ [2120 ▾] │ [2130 ▾]│ [2140 ▾]        │
├──────────────────────────────────────────────────────────────────────┤
│  PAYMENT SIDE                                                        │
│  Cash               → [1020 Cash on Hand ▾]                          │
│  Visa               → [1210 Merchant Receivable – Visa ▾]            │
│  Mastercard         → [1220 …]                                       │
│  Amex               → [1230 …]                                       │
│  UnionPay / JCB / Alipay / WeChat / PayMe → individual dropdowns     │
└──────────────────────────────────────────────────────────────────────┘
```

Behavior:
- Each cell is a searchable dropdown of active accounts (filtered by sensible type — revenue accounts for Sales/Service/Discount, asset for Cash/Cards, liability for Tips).
- Saves on change (no separate "Save Rule" button).
- Green check next to fully-mapped rows; amber dot for missing.
- A **"Preview posting"** panel below shows a worked example using the latest sales record so the user can see exactly which accounts will be debited/credited.

The Chart of Accounts page becomes two clean tabs: **Accounts** (list) and **Revenue Mapping** (the matrix above). Other mapping rule types (invoice_expense, payroll, etc.) are hidden until those modules are tackled.

## 4. Update the posting function (`rebuild_journal_from_operations`)

Strip out everything except sales for now (invoice/payroll branches are commented out — code preserved for the next phase). For each `(date, venue)`:

```text
DR  Cash on Hand                  cash amount
DR  Merchant Receivable – Visa    visa + visa-share of card_tips
DR  Merchant Receivable – Amex    amex + amex-share of card_tips
…   (one DR per non-zero card brand; tips split proportionally to card mix)
DR  Sales Discounts – {venue}     |discount|
CR  Sales – {venue}               subtotal
CR  Service Charge – {venue}      service_charge
CR  Tips Payable – {venue}        card_tips
```

This produces a balanced entry per venue per day, with tips correctly landing on the balance sheet, and gives a clear audit trail in Journal & Ledger.

## 5. Out of scope for this step (kept for later)

- Invoices → AP posting
- Payroll → Salary/MPF posting
- Cash payouts of tips
- Manual journal entries
- P&L / Balance Sheet / Cashflow polish

These pages remain accessible but their posting branches are paused. We'll reactivate them venue-by-venue in subsequent steps.

---

## Technical notes (for reference)

- Migration: `DELETE FROM journal_lines; DELETE FROM journal_entries; DELETE FROM account_mapping_rules; DELETE FROM chart_of_accounts;` then reseed COA + default mapping.
- New mapping rule type: `tips_payable` (match_key = venue).
- New component: `src/pages/finance/RevenueMapping.tsx` (or new tab inside `ChartOfAccounts.tsx`) using `useChartOfAccounts` + `useAccountMapping`.
- Update `rebuild_journal_from_operations()` to include `card_tips` and split per card brand (proportional allocation when multiple card brands present).
- `AccountingMappingSummary.tsx` updated to reflect the new structure (remove invoice/payroll rows for now).

---

## One question before I build

How should **tips paid in cash** be treated?
- **(A)** Same as card tips → CR Tips Payable (treated as owed to staff, paid out later as a separate cash transaction)
- **(B)** Pass-through → don't touch books (assume tips are handed directly to staff at end of shift and never enter the till)
- **(C)** Currently you only track `card_tips`, so cash tips are out of scope — leave it alone

If you don't answer I'll go with **(C)** since the schema only has `card_tips` today.