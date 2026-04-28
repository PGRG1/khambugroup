## What's already in place (good news)

You already have the full plumbing for what you're describing. Today:

- **Chart of Accounts** has dedicated revenue accounts per venue (`Sales – Assembly/Caliente/Hanabi/Events`), `Service Charge`, `Sales Discounts`, `Cash – Bank`, `Cash on Hand`, and `Merchant Receivable - KPAY`.
- **Account Mapping Rules** already map:
  - Each venue → its Sales Revenue account
  - Each venue → Service Charge & Sales Discount accounts
  - Each payment method (visa, mastercard, amex, unionpay, jcb, alipay, wechat, payme, cash) → an account. Right now **all card methods point to the same Merchant Receivable - KPAY account**, and cash points to Cash – Bank.
- A SQL function `rebuild_journal_from_operations()` already iterates over every `sales_records` row, groups by date+venue, and posts a balanced journal entry: debit each payment method's account, credit the venue's Sales Revenue, Service Charge, and Sales Discount accounts.
- The output flows automatically into Journal, Ledger, Trial Balance, and P&L.

So sales **already** become journal entries that map exactly the way you described. The gap is only that:

1. The mapping is hidden inside Finance → Chart of Accounts → "Account Mapping" tab — invisible to whoever enters sales.
2. The journal only refreshes when someone clicks "Rebuild Ledger".
3. There's no per-card-brand receivable account (e.g. separate Amex receivable vs Visa receivable) — you may or may not want that.

## Plan

### 1. Make the mapping visible in the Revenue section
In **Revenue → Sales Data tab**, add a small collapsible panel "Accounting mapping" showing, for each venue and each payment method, which GL account currently receives it. Read-only summary plus a "Manage mappings" link that jumps to Finance → Chart of Accounts → Account Mapping. This way whoever scans receipts can see exactly where Caliente sales / Amex / etc. land.

### 2. Auto-post sales to the journal
Currently sales only flow to the journal when an admin clicks "Rebuild Ledger". Change `useSalesData.ts` so that after `addRecord`, `updateRecord`, `deleteRecord`, `uploadRecords`, and `attachReceipt` (no — attach doesn't change amounts, skip), the hook calls `rebuild_journal_from_operations` in the background. Show a subtle "Posted to ledger" toast.

Optimization: rebuild is already idempotent (it deletes and re-creates non-manual entries), so calling it after each sales mutation is safe. For bulk Excel uploads, debounce to one call at the end.

### 3. (Optional but recommended) Per-card-brand Merchant Receivable accounts
Right now Visa, Mastercard, Amex, UnionPay, JCB, Alipay, WeChat, PayMe all post to the same `Merchant Receivable - KPAY` account. If you want to track each processor separately (so you can reconcile each settlement), add new accounts:

```
1211 Merchant Receivable - Visa/Mastercard
1212 Merchant Receivable - Amex
1213 Merchant Receivable - UnionPay/JCB
1214 Merchant Receivable - Alipay
1215 Merchant Receivable - WeChat
1216 Merchant Receivable - PayMe
```

Then update each `sales_payment_method` mapping rule to point to the corresponding new account. (You can do this from the existing UI at Finance → Chart of Accounts → Account Mapping after I add the accounts — no code change required after that.)

### 4. Small UX additions on the Account Mapping tab
- Group rules by category (Sales / Payments / Invoices / Payroll) instead of one long list.
- Show the venue/method label nicely (e.g. "Amex" instead of `amex`).
- Add a "Test mapping" button that runs `rebuild_journal_from_operations` and shows the count of entries created — handy after editing rules.

## Technical changes

- `src/components/dashboard/AccountingMappingSummary.tsx` — new read-only panel.
- `src/pages/DataPage.tsx` — embed the panel in the Sales Data tab.
- `src/hooks/useSalesData.ts` — call `supabase.rpc("rebuild_journal_from_operations")` after successful mutations; debounce for bulk upload.
- New migration: insert 6 new `chart_of_accounts` rows for per-brand merchant receivables (only if you confirm step 3).
- `src/pages/finance/ChartOfAccounts.tsx` — group the mapping list and prettify labels; add "Test mapping" button.

## Out of scope
- Processor fees / settlement reconciliation (matching merchant deposits to receivable balances) — flag for a follow-up.
- Splitting revenue between food and beverage per venue — would need item-level data we don't capture from the receipt yet.

## Question before I start

Do you want step 3 (per-card-brand receivables: separate Amex / Visa-MC / Alipay etc.), or keep all card payments lumped under the single "Merchant Receivable - KPAY" account you already have?
