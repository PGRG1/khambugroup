## Consolidate Merchant Receivable into a single KPAY account

KPAY is your one merchant/processor that handles all card and e-wallet payments, so all non-cash sales should land in a single receivable account, not split per network. The payment method is still recorded on each journal line (in the memo) so you can analyse the mix later.

### Database changes (one migration)

1. Create one new account: `1210 — Merchant Receivable - KPAY` (asset). Keep `5910 Payment Processing Fees` as-is.
2. Repoint all 8 `sales_payment_method` mapping rules (visa, mastercard, amex, union_pay, jcb, alipay, wechat, payme) to the new KPAY account. Cash mapping stays on the cash account.
3. Repoint the existing journal lines that point to old accounts 1211–1217 to the new KPAY account (so historical data is preserved without rebuild).
4. Rename the now-empty old account 1210 to "Merchant Receivable - KPAY" and deactivate accounts 1211–1217 (keep them for audit history; do not delete to avoid breaking referenced journal_lines).

After the migration the Ledger and Balance Sheet will show one consolidated KPAY receivable balance equal to the sum of all 8 prior balances (~4.93M HKD).

### Future settlement page (unchanged design)

When you build the daily KPAY settlement screen, each batch posts:
- Debit Cash (net amount banked)
- Debit Payment Processing Fees (KPAY's deduction)
- Credit Merchant Receivable - KPAY (gross batch)

This clears the receivable as KPAY pays out.

### What stays the same

- Sales journal entries still split by payment method on the line memo (cash, visa, mastercard, …) so per-method analytics are still possible.
- Cash sales still debit the Cash account directly.
- Trial balance remains balanced.
