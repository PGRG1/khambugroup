## Scope

Extend the existing Accounts Payable Record Payment flow to support **credit notes** alongside cash. Strengthen the **payment record** so it can later be matched to a bank transaction by AI. No redesign of the page or table — only the payment dialog, the supporting hook, and the database get richer.

## Assumption (please confirm if wrong)

Credit notes will be tracked in a **new `credit_notes` table** (separate from invoices). They are issued by a supplier, can be entered manually or via the existing scanner, and once `status='approved'` they show up as available credit for that supplier. If you'd rather treat credit notes as "negative invoices" inside the existing `invoices` table, say the word and I'll adapt.

## Database changes

**New table `public.credit_notes`**
- supplier_id, credit_note_number, credit_note_date, original_amount, remaining_balance, status (`draft|approved|fully_applied|voided`), venue, notes, attachment_url, source_invoice_id (optional link to the invoice it relates to)
- RLS: read = authenticated; write = admin/manager
- Trigger keeps `remaining_balance` and flips status to `fully_applied` when balance hits 0

**Extend `public.payment_allocations`**
- Add nullable `credit_note_id uuid`, `credit_note_amount_applied numeric default 0`
- Drop the strict `amount_allocated > 0` check; replace with `amount_allocated >= 0 AND (amount_allocated + credit_note_amount_applied) > 0` so a row can be 100% credit-note (zero cash)
- Update `validate_allocation_vs_payment` trigger to compare only the cash portion against `payments.amount`
- Update `recompute_invoice_from_allocations` to count both cash and credit toward `amount_paid`

**Extend `public.payments`**
- Already has all the fields needed for AI bank matching (date, amount, method, paid_from_account, reference, cheque, supplier, match_status). Add an index on `(paid_from_account_id, payment_date)` to speed up future bank-match queries.
- Allow `amount = 0` (currently `> 0`) for the edge case where an invoice is settled entirely by credit note — we still create a payment record with `amount=0, match_status='not_required'`.

**New RPC: replace `record_payment_with_allocations`**
- Inputs: `p_payment` (header), `p_allocations` (array of `{invoice_id, amount_allocated, credit_note_id?, credit_note_amount_applied?}`)
- In one transaction: insert payment, insert allocations, decrement each used credit_note's `remaining_balance`, recompute invoice balances/status, set `bank_match_status='awaiting_bank_match'` on touched invoices when cash > 0, set `not_required` when settled fully by credit.

## Record Payment dialog (frontend)

`src/components/finance/payables/RecordPaymentDialog.tsx` — keep the two-step wizard, enhance Step 2:

- For each open invoice row, add an **"Apply Credit Note"** affordance. Opens a small popover listing the supplier's credit notes with remaining balance. User picks one, enters the amount to apply (defaults to min(credit remaining, invoice outstanding)).
- Row now shows three numeric columns: **Credit Applied**, **Cash to Pay**, **Remaining** (live recomputed: `outstanding − credit − cash`).
- Confirmation prompt before applying a credit note ("Apply HK$ X from CN-1234? Remaining credit will be HK$ Y").
- Footer summary gets a new "Credit Applied" tile next to Payment Amount / Allocated / Unallocated.
- If every line is fully covered by credit, the Payment Amount field can be 0 and the wizard saves a zero-cash payment record.
- Validation: `cash_allocated ≤ payment_amount`; `cash + credit ≤ invoice outstanding`; `credit_amount ≤ credit_note remaining_balance`.

## Payment History dialog

`PaymentHistoryDialog.tsx` — each allocation row now shows the credit-note number + amount applied alongside the cash amount, so the audit trail is complete.

## Hook + types

- `usePayables.ts` — fetch `credit_notes` with `status='approved' AND remaining_balance > 0` grouped by supplier_id, expose `creditNotesBySupplier`. Pass into the dialog.
- New shared type `APCreditNote` in the hook.

## Out of scope (explicitly not in this change)

- No new Credit Notes management page yet — they can already be created via scanner / direct insert. I'll surface a minimal "approved credit notes" list inside the dialog only.
- No bank-matching UI changes. The payment record is now structured correctly so the future AI matcher has all the fields it needs (`paid_from_account_id`, `payment_date`, `amount`, `supplier_id`, invoice numbers via allocations, `reference_number`, `cheque_number`, `payment_method`). Bank-matcher itself is a separate task.
- No journal-entry / GL posting changes in this pass — credit notes hitting the ledger is a follow-up once you confirm the accounting treatment (contra-AP vs. expense reversal).

## Technical details

```text
payments  1───*  payment_allocations  *───1  invoices
                          │
                          *───0..1  credit_notes  *───1  suppliers
```

Recompute rule per invoice after save:
```
amount_paid       = Σ(amount_allocated) + Σ(credit_note_amount_applied)
remaining_balance = max(0, total_amount − amount_paid)
payment_status    = paid | partially_paid | unpaid | credit_note_applied (if 100% via credit)
bank_match_status = not_required (if cash=0) | awaiting_bank_match (if cash>0)
```
