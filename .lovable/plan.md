## Goal

Let you manually map **Service Charge** and **Sales Discount** to a different Chart of Accounts entry **per venue** (Assembly, Caliente, Hanabi, Events) — same pattern you already use for Sales Revenue. Today both are posted to a single lump-sum account regardless of venue.

## What's in place today

- `account_mapping_rules` has one row for `service_charge` (empty match_key) and one row for `sales_discount` (empty match_key) — both global.
- The Account Mapping UI lists them as "Service Charge" and "Sales Discount" with `needsKey: false`, so you can't add a per-venue row.
- `rebuild_journal_from_operations` looks up each via `match_key=''` and posts the venue's full service charge / discount to that single account.

## Proposed changes

### 1. UI — make both rules per-venue

In `src/hooks/useAccountMapping.ts`, change the two rule definitions to need a key and rename labels for clarity:

```ts
{ value: "service_charge", label: "Service Charge (per venue)", needsKey: true },
{ value: "sales_discount", label: "Sales Discount (per venue)", needsKey: true },
```

In `src/pages/finance/ChartOfAccounts.tsx` `AccountMappingPanel`, when the selected rule is `service_charge` or `sales_discount`, replace the free-text "Match key" input with a `Select` containing the four venues (Assembly, Caliente, Hanabi, Events) — same pattern already used for `sales_payment_method`.

### 2. Database — make the rebuild honor per-venue mappings, with safe fallback

Update `public.rebuild_journal_from_operations` so the sales loop, for each (date, venue) row:

- Looks up `service_charge` by `match_key = r.venue` first; falls back to the existing global `match_key=''` rule if no per-venue row exists.
- Same for `sales_discount`.

This means: if no per-venue rules exist yet, behavior is identical to today. As soon as you add a venue-specific rule, the next Rebuild Ledger picks it up.

Sketch:

```text
acc_svc_v   = lookup(service_charge, venue) ?? acc_service        -- existing global
acc_disc_v  = lookup(sales_discount, venue) ?? acc_discount        -- existing global

credit acc_svc_v  for v_svc
debit  acc_disc_v for v_discount_abs
```

### 3. No data migration required

The current global rows stay as-is and act as the fallback. You add per-venue overrides from the UI as needed.

## How you'll use it

1. Open **Chart of Accounts → Account Mapping**.
2. Use the top form: pick **Service Charge (per venue)** → pick venue (e.g. Hanabi) → pick the account → Save Rule. Repeat for each venue you want to split out.
3. Same flow for **Sales Discount (per venue)**.
4. Click **Rebuild Ledger** at the top. Journal, Ledger, Trial Balance, and Balance Sheet update.

## Files touched

- `src/hooks/useAccountMapping.ts` — flip `needsKey` to `true` and rename labels for `service_charge` and `sales_discount`.
- `src/pages/finance/ChartOfAccounts.tsx` — extend the venue-aware match-key picker to cover these two rule types.
- New SQL migration — replace `rebuild_journal_from_operations` so service charge and discount lookups try `match_key=venue` first, then fall back to `match_key=''`.