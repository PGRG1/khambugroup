## Problem

The Rebuild Ledger action fails with:

```
new row for relation "journal_lines" violates check constraint "journal_lines_debit_check"
```

The DB constraint is `CHECK (debit >= 0)` — a negative value is being inserted into `debit`.

Root cause is in `rebuild_journal_from_operations()`. Three loops insert raw amounts without sign-handling, and any negative value (credit notes, refunds, reversed settlements) trips the constraint:

1. **Invoice lines** (line 166): `VALUES (e_id, line.acct, line.total, 0, ...)` — `line.total` can be negative (credit-memo lines). Guard is `<> 0`, not `> 0`.
2. **Invoice payments** (line 196): `VALUES (e_id, acc_ap, r.amount, 0, ...)` — `r.amount` can be negative (refunds). Filter is `p.amount <> 0`.
3. **Settlement clearing** (new migration, line 303): `v_bank_amt := NULLIF(bank_money_in, 0)` — if a matched bank transaction stored the receipt in `money_out` instead of `money_in` (or money_in is negative for a chargeback), the value flows through and can produce negative debits in the bank/fee lines.

## Fix Plan

Single new migration that replaces `rebuild_journal_from_operations()` with sign-safe inserts. No schema changes, no app/UI changes.

### 1. Invoice lines — flip sign for credit lines

```text
IF line.total > 0 THEN  Dr line.acct = line.total
ELSIF line.total < 0 THEN  Cr line.acct = ABS(line.total)
```

The AP credit (line 172) already uses `inv.total_amount` which naturally nets positive/negative. Wrap it the same way: positive total → Cr AP, negative total → Dr AP. The existing suspense plug already handles either direction.

### 2. Invoice payments — handle refunds

```text
IF r.amount > 0 THEN  Dr AP, Cr Cash         (normal payment)
ELSIF r.amount < 0 THEN Dr Cash, Cr AP       (refund from supplier)
```

Use `ABS(r.amount)` on both lines.

### 3. Settlement clearing — guard against negative bank amount

- Normalise `v_bank_amt` to its absolute value AFTER deciding direction.
- If `bank_money_in` is null/zero AND `net_settlement` is negative, treat the batch as a chargeback: skip clearing (CONTINUE) and log to `ledger_audit_log` with status `skipped` — these need manual review.
- Add a final safety net inside the loop: if any computed `v_proc_fee`, `v_xfer_fee`, `v_bank_amt` is `< 0`, set it to 0 before insert (already wrapped in ABS but defensive).

### 4. Final defensive check

At the end of every entry-creation block, sum debits & credits; if either is negative due to any unexpected path, delete the entry and log to `ledger_audit_log` instead of letting the insert blow up the whole rebuild transaction.

## Verification

1. After migration approved, click **Rebuild** on `/finance/journal`.
2. Confirm no error toast.
3. Check `ledger_audit_log` for any new `_skipped` rows — those are the edge cases (refund invoices, chargebacks) that need user attention; surface them to the user as the verification report.
4. Spot-check one previously failing entry (e.g. an invoice with a negative line) renders correctly in the Journal table with the credit on the right side.

## Files Touched

- New migration: `supabase/migrations/<ts>_fix_journal_negative_amounts.sql` — replaces `public.rebuild_journal_from_operations()` only.

No frontend changes. No types regen needed (function signature unchanged).