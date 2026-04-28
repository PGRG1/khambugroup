## Diagnosis

I checked the database directly. There are **two independent issues**, and only one is a UI bug — the other is a real accounting error.

### Issue 1 — Trial Balance UI is truncating data (looks "1 venue only")

The DB ledger contains data for **both Assembly and Caliente** (the only two venues with sales so far — Hanabi and Events have zero records, which is correct):

| Venue    | Lines | Debits     | Credits    |
|----------|------:|-----------:|-----------:|
| Assembly | 1,779 | 3,720,264  | 3,720,264  |
| Caliente | 1,234 | 2,004,238  | 2,004,238  |
| **Total**| **3,013** | **5,724,502** | **5,724,502** |

But `src/hooks/useTrialBalance.ts` queries `journal_lines` with `.limit(10000)` *and* an inner join to `journal_entries`. PostgREST still applies its default 1,000-row cap on the underlying request in many cases, and the embedded join also counts against the limit. So the UI is silently dropping rows — that's why it looks like only one venue is showing and the numbers feel "very off".

**Fix**: rewrite `useTrialBalance` to fetch via `fetchAllRows` (the project's standard `.range()` paginator) for both `journal_entries` and `journal_lines`, then join in JS. This is the same fix already applied elsewhere in the codebase.

### Issue 2 — Balance Sheet is genuinely out of balance by ~135,126

Looking at the trial balance from the database directly:

- **Sales – Assembly**: 3,383,309 (credit) ✓ matches `sales_records.subtotal`
- **Sales discount accounts (5xxx)**: total ~135,126 (credit)

But discounts are a **contra-revenue** account — they should reduce revenue, i.e. they belong on the **debit** side (normal_side = debit), not credit. In `rebuild_journal_from_operations` the discount line is correctly written as a DEBIT:

```sql
INSERT INTO journal_lines (... debit, credit ...) VALUES (... ABS(r.discount), 0 ...)
```

…but the **chart_of_accounts** row for the discount accounts has `normal_side = 'credit'` (treated as revenue). That flips the sign in `v_balance_sheet` / `v_pl` and leaves Equity short by exactly the discount amount → ~135,126 imbalance, which is roughly what you saw on the Balance Sheet (-1,919,191 also includes the truncation effect).

**Fix**: ensure the four `Sales Discount – {Venue}` accounts are typed as `account_type = 'revenue'` with `normal_side = 'debit'` (contra-revenue convention). Then rebuild the journal so views recompute cleanly.

---

## Plan

### 1. Fix Trial Balance row truncation (UI)
Rewrite `src/hooks/useTrialBalance.ts`:
- Use `fetchAllRows("journal_entries", "id, entry_date, status")` and `fetchAllRows("journal_lines", "account_id, entry_id, debit, credit")`.
- Join in JS, filter by `status='posted'` and the date range.
- Remove the `.limit(10000)` and the embedded `!inner` select.

### 2. Fix Sales Discount account configuration (DB migration)
Create a migration that:
- Updates `chart_of_accounts` rows for codes `5010`, `5020`, `5030`, `5040` (Sales Discount accounts — confirm via SELECT in migration) to `normal_side = 'debit'`, keeping `account_type = 'revenue'` so they net inside the Revenue section as contra-revenue.
- Calls `rebuild_journal_from_operations()` so all derived views refresh.

### 3. Audit Balance Sheet hook for the same truncation bug
Quickly check `src/pages/finance/BalanceSheet.tsx` and its hook — if it reads from `v_balance_sheet`, no change needed. If it reads from `journal_lines` with a `.limit`, apply the same `fetchAllRows` fix.

### 4. Verification
After applying:
- Trial Balance totals should match: Debits = Credits = 5,724,502 (or current value after rebuild).
- Both Assembly and Caliente sections should be visible.
- Balance Sheet should show "Balanced ✓".

### Notes
- Hanabi and Events legitimately show zero — there are no sales records for them yet, so this is not a bug.
- KPAY merchant receivable balance of 5,010,704 is the unsettled card payment pool — that's expected (no settlement journal entries posted yet).
