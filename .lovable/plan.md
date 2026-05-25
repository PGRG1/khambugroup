
## Goal

Replace the current single-invoice Record Payment dialog with a two-step modal that lets one payment be allocated across one, many, or zero invoices (advance payment), with proper validation and downstream status updates.

## Data model changes

The current `invoice_payments` table ties each payment row to exactly one invoice via `invoice_id`. That cannot represent: one payment covering multiple invoices, or unallocated/advance payments. New model:

```text
payments (header — "the money that left the account")
  id, payment_date, amount, payment_method, paid_from_account_id,
  reference_number, cheque_number, notes, supplier_id (nullable),
  bank_transaction_id (nullable), match_status, created_by, created_at

payment_allocations (link — "how that money was applied")
  id, payment_id, invoice_id, amount_allocated, created_at
```

Derived per payment:
- `total_allocated` = sum of allocations
- `unallocated_amount` = `amount - total_allocated` (≥ 0; > 0 means advance/on-account)

The existing `invoice_payments` rows will be migrated 1:1 into `payments` + `payment_allocations` (single allocation each), then `invoice_payments` is kept read-only for one release as a fallback (no UI writes).

Bank matching moves to the `payments` header (not per allocation), matching the user's rule: "bank transaction should match to the payment record, not directly to each invoice."

RLS: same admin/manager write, authenticated read pattern as `invoice_payments`. Validation triggers enforce `amount > 0`, `sum(allocations) <= payment.amount`, and `allocation.amount <= invoice.outstanding`.

## UI: two-step `RecordPaymentDialog`

Entry points unchanged (per-row "Record Payment" button + dropdown). Dialog widens to `max-w-3xl`.

**Step 1 — Payment Details**

Fields, with Payment Method and Paid From Account as separate selects:

- Payment Date (defaults today)
- Payment Amount (defaults to clicked invoice's outstanding)
- Payment Method: `FPS`, `Cheque`, `Bank Transfer`, `Cash`, `Credit Card`, `Other`
- Paid From Account: list of active `bank_accounts` plus cash/till accounts (`Cash Till - Assembly`, `Cash Till - Caliente`, `Petty Cash`) — these will be seeded as `bank_accounts` rows with `account_type = 'cash'` if not present
- Reference Number
- Cheque Number — only shown when Method = `Cheque`
- Notes

Validation: amount > 0, method + paid-from required. "Next" advances to Step 2.

**Step 2 — Allocate Payment**

Loads all open approved invoices for the same supplier (`outstanding_amount > 0`, `payment_status != voided`), pre-selecting the originating invoice with its outstanding amount auto-filled.

Allocation table columns:
Invoice # · Invoice Date · Due Date · Invoice Amount · Outstanding · **Amount to Pay** (editable) · Remaining Balance (live)

Quick actions per row: "Pay full outstanding", "Clear".

Running allocation summary bar (sticky at bottom of step):
- Payment Amount
- Total Allocated
- Unallocated Amount (highlighted amber if > 0, labelled "Will be saved as Advance / On-Account")
- Remaining Outstanding (across selected invoices)

Live validation:
- Total allocated ≤ Payment Amount (block save, red toast)
- Per-row allocation ≤ that invoice's outstanding (clamp + warning)
- Allow save with unallocated > 0 (advance payment) — confirm message
- Allow save with total allocated = 0 (pure advance) — confirm message

**Save**

Single transaction via a Supabase RPC `record_payment_with_allocations(payment jsonb, allocations jsonb[])` that:
1. Inserts the `payments` row.
2. Inserts `payment_allocations` rows for non-zero entries.
3. For each affected invoice, recomputes `amount_paid = sum(allocations)`, `remaining_balance = total_amount - amount_paid`, and sets `payment_status`:
   - `paid` if remaining ≤ 0.01
   - `partially_paid` if 0 < remaining < total
   - leaves `unpaid` otherwise
4. Sets invoice `bank_match_status = 'awaiting_bank_match'` where an allocation was applied.
5. Returns the new payment id.

Doing this server-side avoids client race conditions and keeps balances consistent.

## Hook + page updates

- `usePayables.ts`: fetch from `payments` + `payment_allocations` instead of `invoice_payments`. Derive `amount_paid`/`outstanding` per invoice from allocations as authoritative source (fallback to invoice column if no allocations exist post-migration). KPI `unallocatedPayments` becomes count of `payments` with `unallocated_amount > 0.01`.
- `PaymentHistoryDialog.tsx`: show all payments touching the invoice via its allocations, with payment-level details and the allocated amount; "Reverse" deletes the allocation and recomputes invoice balance (and deletes the parent `payment` if it has no remaining allocations and no unallocated amount).
- `AllocatePaymentDialog.tsx`: repurposed only for bank-transaction matching against existing `payments` (unchanged scope here).
- `Payables.tsx`: no structural change; just passes the originating invoice into the new dialog.

## Files touched

- New migration: `payments`, `payment_allocations`, triggers, RPC, backfill from `invoice_payments`.
- `src/components/finance/payables/RecordPaymentDialog.tsx` — rewritten as two-step.
- `src/hooks/usePayables.ts` — read from new tables.
- `src/components/finance/payables/PaymentHistoryDialog.tsx` — read/reverse via allocations.

## Out of scope (Phase 2)

- Re-allocating an existing advance payment to invoices later (UI exists conceptually but separate flow).
- Multi-currency payments.
- Posting journal entries from payments (already handled elsewhere if applicable).
