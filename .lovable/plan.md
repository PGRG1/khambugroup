## Goal

Let you manually map **each** payment method (Visa, Mastercard, Amex, JCB, UnionPay, Alipay, WeChat, PayMe, Cash) to its own Chart of Accounts entry from the **Chart of Accounts → Account Mapping** tab, and have the journal rebuild respect those individual mappings (so you can route everything to "Merchant Receivable - KPAY" today, then split JCB or Amex to a different account later without touching code).

## What's already in place

- A rule type `sales_payment_method` exists in the database with per-method keys (`visa`, `mastercard`, `amex`, `jcb`, `union_pay`, `alipay`, `wechat`, `payme`, `cash`) — all currently pointing at the same KPAY account.
- The mapping table UI (`AccountMappingPanel`) is generic and can already render any rule type.

## What's missing / broken

1. The dropdown of rule types in the mapping UI (`RULE_TYPES` in `src/hooks/useAccountMapping.ts`) does **not** include `sales_payment_method`, so there is no way to add or edit these rules from the UI today.
2. The `rebuild_journal_from_operations` SQL function ignores the per-method rules. It picks one arbitrary card account (`LIMIT 1`) and dumps the combined Visa+MC+Amex+JCB+UnionPay+Alipay+WeChat+PayMe total into it as one "KPAY" line. So even if you change one method's mapping, the rebuild won't honor it.

## Proposed changes

### 1. UI — make the per-method mapping editable

**`src/hooks/useAccountMapping.ts`** — add to `RULE_TYPES`:

```ts
{ value: "sales_payment_method", label: "Sales Payment Method (per method)", needsKey: true },
```

That alone makes the existing Account Mapping panel show a "Sales Payment Method (per method)" group with one editable row per method. The match key field accepts: `visa`, `mastercard`, `amex`, `jcb`, `union_pay`, `alipay`, `wechat`, `payme`, `cash`.

**Optional polish** (`src/pages/finance/ChartOfAccounts.tsx` → `AccountMappingPanel`): when the selected rule is `sales_payment_method`, replace the free-text "Match key" input with a `Select` listing the nine known methods so you don't have to remember the exact spelling (`union_pay` vs `unionpay`, etc.).

### 2. Database — make the journal rebuild honor each mapping

Update `public.rebuild_journal_from_operations` so the sales posting loop produces one journal line per non-cash payment method that has a non-zero amount, each debited to the account configured for that method's rule (falling back to the current single KPAY account if a specific mapping is missing). Cash continues to use its existing `sales_cash` / `payment_method_cash=cash` mapping.

Sketch of the new behavior inside the per-day/per-venue loop:

```text
for method in (visa, mastercard, amex, union_pay, jcb, alipay, wechat, payme):
    amt = r.m_<method>
    if amt > 0:
        acct = lookup(rule_type='sales_payment_method', match_key=method)
              ?? fallback KPAY account
        insert journal_line(debit=amt, account=acct, memo='<Method> <amt>')
```

Cash row and the credit side (revenue + service charge + discount) stay exactly as today. Net effect: today, with all eight methods mapped to "Merchant Receivable - KPAY", the journal looks identical to what you have now. Tomorrow, if you re-map JCB to a different account, the next Rebuild Ledger picks it up automatically.

### 3. No data migration needed

The nine `sales_payment_method` rows already exist in `account_mapping_rules` and are all pointed at the KPAY account. You can edit any of them from the UI immediately after the changes above ship.

## How you'll use it

1. Open **Chart of Accounts → Account Mapping**.
2. Find the new **Sales Payment Method (per method)** section — it lists Visa, Mastercard, Amex, JCB, UnionPay, Alipay, WeChat, PayMe, Cash.
3. For each row, pick the Chart of Accounts entry it should post to (e.g. all eight cards → "Merchant Receivable - KPAY", Cash → "Cash on Hand").
4. Click **Rebuild Ledger** at the top of the page. The journal, ledger, trial balance, and balance sheet will reflect the new mapping.

## Files touched

- `src/hooks/useAccountMapping.ts` — add the rule type to the dropdown.
- `src/pages/finance/ChartOfAccounts.tsx` — (optional) method-aware match-key picker.
- New SQL migration — replace `rebuild_journal_from_operations` so card lines are split per method using the per-method rules.
