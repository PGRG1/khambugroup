## Problem

In Chart of Accounts (`/finance/chart-of-accounts`), the inline edit row only lets you change **Code**, **Name**, **Cash** flag, and **Active** flag. The **Account Type** (Asset / Liability / Equity / Revenue / COGS / Operating Expense / Other Income / Other Expense) and the **Normal Side** (debit/credit) are read-only after creation, so accounts like `6220 Marketing Platform Fees` are stuck under "Other Expense" with no way to move them to "Operating Expense".

The backend already supports it — `useChartOfAccounts.updateAccount` accepts any `Partial<ChartAccount>`, and the `chart_of_accounts` table allows updates via the existing RLS policy. It's purely a UI gap.

## Fix

Extend the inline edit row in `src/pages/finance/ChartOfAccounts.tsx` so the user can also edit:

1. **Account Type** — dropdown using the same 8 options shown when *adding* a new account (Asset, Liability, Equity, Revenue, COGS, Operating Expense, Other Income, Other Expense). When the type changes, auto-update `normal_side` to the matching default via the existing `defaultNormalSide()` helper (so e.g. switching to "Operating Expense" sets normal side = debit).
2. **Normal Side** — small dropdown (Debit / Credit) so the user can override the auto-default in the rare case they need to.

Layout: keep the row compact and on one line on desktop. Reorganize so the editing row shows: `Code | Name | Type | Normal Side | Cash | Active | Save | Cancel`. On the small viewport (mobile), allow the row to wrap.

### Behavior notes

- After save, the account immediately moves to the new type's group section (the page already re-groups by `account_type` via the `grouped` `useMemo`, so this happens automatically once `fetchAll()` runs in `updateAccount`).
- No data migration or backend change is needed.
- No impact on existing journal entries — they reference the account by `account_id`, so changing the type just reclassifies how it appears on the P&L / Balance Sheet going forward and historically (since reports group by current `account_type`).
- The existing rebuild flow and account mapping rules are untouched.

### Files touched

- `src/pages/finance/ChartOfAccounts.tsx` — extend the inline edit row with Type and Normal Side selects.

### Out of scope

- Editing **parent_id**, **description**, or **sort_order** inline (these aren't currently editable from the UI either; can be added later if needed).
- Bulk reclassification of multiple accounts at once.

## Result

You'll be able to click the pencil next to `6220 Marketing Platform Fees`, change Type from "Other Expense" to "Operating Expense", save, and see it move into the Operating Expense group.
