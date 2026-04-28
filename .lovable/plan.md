# Treat Card Tips as Sales-Reducer, Not a Payment

## Problem

Currently the system treats `cardTips` as an **extra amount** added on top of payments, which contradicts how your receipts actually work. On your receipts the tip is **already inside** one of the card payment columns (e.g. the AMEX line includes the tip), and the printed Total Sales does NOT include it. So:

- Reconciliation rule (correct): `sum(payments) − cardTips = totalSales`
- Today the validator checks: `sum(payments) = totalSales` → mismatch, like in your screenshot (5924 − 3 = 5921 ✓)
- Today the journal posts tips as an **extra debit** on top of card receivables → would inflate receivables when tips appear

## What Will Change

### 1. Reconciliation rule (UI validators)

Update `getPaymentTotal` and the three places that use it to subtract tips:

- `src/utils/salesUtils.ts` — extend `getPaymentTotal` to accept optional `cardTips` and return `payments − cardTips`
- `src/components/dashboard/ReceiptScanner.tsx` — pass `cardTips` so the warning in your screenshot disappears (5924 − 3 = 5921 = Total Sales ✓)
- `src/components/dashboard/ManualInput.tsx` — same
- `src/components/dashboard/SalesDetailModal.tsx` — same

### 2. Journal posting logic (`rebuild_journal_from_operations`)

Migration to update the SQL function so card tips are handled correctly:

- Each card receivable is debited at its **face value** (the amount keyed in already includes the tip — do NOT add tip on top)
- The tip portion of card revenue does NOT go to Sales — it goes to **Tips Payable** (liability owed to staff)
- Net effect per entry with tips:

```text
DR  Card Receivable – Brand   (amount keyed, includes tip)
DR  Sales Discount – venue    (|discount|)
CR  Sales – venue             (subtotal)
CR  Service Charge – venue    (service_charge)
CR  Tips Payable – venue      (card_tips)
```

Math check: Debits = card + cash + |discount| ; Credits = subtotal + service + tips.  
Since `cards + cash − tips = total_sales = subtotal + service − |discount|`, the entry balances exactly with no suspense line needed.

### 3. Existing data

No backfill needed — current DB has zero records with `card_tips > 0`, and the rebuild function reposts everything fresh on the next sales mutation (or can be triggered via the **Rebuild Ledger** button).

## Files Changed

- `src/utils/salesUtils.ts` — `getPaymentTotal` accepts optional tips
- `src/components/dashboard/ReceiptScanner.tsx`
- `src/components/dashboard/ManualInput.tsx`
- `src/components/dashboard/SalesDetailModal.tsx`
- New migration: update `rebuild_journal_from_operations` SQL function

## Out of Scope

- Cash tips (you only track `card_tips` today — confirmed in earlier round)
- COA changes — Tips Payable accounts already exist per venue
