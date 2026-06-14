## What is actually broken

The journal rebuild is now failing at the sales-payment stage with:

```text
could not identify column "visa" in record data type
```

This is not because `visa` is missing from `sales_records` or `sales_data`; both have the column. The problem is inside `public.rebuild_journal_from_operations()`.

The current live function dynamically runs a statement like:

```sql
EXECUTE format('SELECT $1.%I', v_method) INTO v_amt USING r;
```

where `r` is an anonymous PL/pgSQL `record`. Postgres cannot dynamically resolve fields on an anonymous `record` inside SQL execution, so it throws the `record data type` error. The fix is to remove that dynamic field lookup and use explicit/static field access for each payment method.

## Plan

1. **Replace the live journal rebuild function with a clean, audited version**
   - Keep the same RPC name: `public.rebuild_journal_from_operations()`.
   - Keep the same admin-only permission check.
   - Keep preserving `manual` and `manually_adjusted` journal entries.
   - Remove dynamic `EXECUTE ... $1.%I` record access entirely.
   - Use explicit payment fields: `visa`, `mastercard`, `amex`, `union_pay`, `jcb`, `alipay`, `wechat`, `payme`.

2. **Normalize the sales rebuild section**
   - Read from the existing `public.sales_data` view, which aliases `sales_records`.
   - Aggregate by trading date and venue.
   - Create balanced journal entries for:
     - cash receipts
     - card / wallet receipts
     - sales discounts
     - subtotal revenue
     - service charge revenue
     - card tips payable
     - suspense line only when required for balancing

3. **Audit every journal source type used by the rebuild**
   - Ensure `journal_entries.source_type` allows all source types the function creates or deletes, including:
     - `sales`
     - `sales_summary`
     - `invoice`
     - `invoice_payment`
     - `settlement_fee`
     - `settlement_clearing`
     - `bank_fee`
     - `bank_txn`
     - payroll-related types
     - `manual`, `adjustment`, `opening`
   - Keep this as a schema constraint fix only; no workflow or auth changes.

4. **Audit the non-sales rebuild sections**
   - Invoices: verify AP and expense lines balance.
   - Invoice payments: verify AP debit and cash/bank credit balance.
   - Payroll accrual/payment/MPF: verify generated entries use allowed source types and skip invalid/missing mapping safely.
   - Settlement/bank fee sections: verify source types and required accounts are consistent.

5. **Add safer failure handling inside the function**
   - Use audit log rows for rebuild start/finish/failure where possible.
   - Avoid deleting protected/manual entries.
   - Keep the rebuild atomic so failed runs do not leave half-built journal entries.

6. **Validate after migration**
   - Confirm the live function no longer contains dynamic `EXECUTE` record-field access.
   - Confirm `sales_data` exposes every payment column.
   - Confirm the source type constraint matches the function.
   - Run a read-only audit query to check generated journal entries balance by entry.

## Files / areas involved

- Database function: `public.rebuild_journal_from_operations()`
- Tables/views involved:
  - `sales_records`
  - `sales_data`
  - `journal_entries`
  - `journal_lines`
  - `account_mapping_rules`
  - `chart_of_accounts`
  - invoices/payment/payroll/settlement tables used by the rebuild
- Frontend trigger only, no UI redesign:
  - `src/hooks/useJournal.ts`
  - `src/pages/finance/Journal.tsx`

## What will not change

- No auth changes.
- No user workflow changes.
- No table redesign.
- No frontend redesign.
- No changes to sales import logic.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>