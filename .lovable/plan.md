## Where discounts go today

**Short answer: nowhere explicit.** Discounts are silently absorbed into the revenue credit.

Looking at `sales_records`, every sale has: `subtotal`, `service_charge`, `discount`, `total_sales`. The current `rebuild_journal_from_operations()` function does this:

```
v_total := total_sales              -- already net of discount
v_svc   := service_charge
v_rev   := v_total - v_svc          -- subtotal MINUS discount, lumped together
```

So the credit posted to **Sales Revenue** = `subtotal − discount`. The discount disappears into a smaller revenue number with no visibility on the P&L or trial balance.

**Data check (all venues, all-time):**
- Subtotal: 5,127,122
- Service charge: 510,706
- Discount: −134,922 (stored as negative, so a real reduction)
- Total sales: 5,494,606 ✓ ties to subtotal + svc + discount

The 134,922 of discounts is currently buried inside the revenue credit instead of being shown as a contra-revenue line.

## Proposed fix

Treat discounts as a **contra-revenue** account (industry standard — shows gross sales, then discounts, then net revenue on the P&L).

### 1. Chart of accounts
Add one new account:
- **`4150 — Sales Discounts`** (account_type: `revenue`, normal_side: `debit` — i.e. contra-revenue)

### 2. Account mapping rule
Add a new rule_type `sales_discount` (match_key `''`) pointing to account 4150.

### 3. Update `rebuild_journal_from_operations()`
For each sales entry, change the revenue posting from one line to two:

```text
Before:
  Cr  Sales Revenue        subtotal − discount
  Cr  Service Charge       svc

After:
  Cr  Sales Revenue        subtotal              (gross)
  Dr  Sales Discounts      |discount|            (contra-revenue)
  Cr  Service Charge       svc
```

Net effect on debits/credits is unchanged → trial balance stays balanced. Cash + KPAY debits are also unchanged because they already equal `total_sales`.

### 4. P&L report
`Sales Discounts` will automatically appear under Revenue (as a negative) since it's a revenue-type account on the debit side. Net Revenue = Sales Revenue − Sales Discounts + Service Charge.

### 5. Rerun the rebuild
After the migration, re-execute `rebuild_journal_from_operations()` so all historical journal entries reflect the new structure. Verify trial balance still balances at 8,252,545.70.

## Files / objects touched
- New migration: insert COA row 4150, insert mapping rule `sales_discount`, replace `rebuild_journal_from_operations()` function, run rebuild.
- No frontend changes required — Journal, Trial Balance, and P&L pages will pick it up automatically (P&L may need a quick check that the new account renders in the right group).
