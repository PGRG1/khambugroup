# Procurement Finance — Supplier Ledger + Full Payables Management

Replace the existing Supplier Payables tab with a fully actionable Supplier Ledger so AP work can happen entirely inside Procurement. Reuses the Finance `RecordPaymentDialog` / `BookCreditNoteDialog` and `usePayables` hook unchanged.

## Files to create

1. **`src/components/procurement/SupplierLedgerSheet.tsx`** — wide right slide-out (max-w-5xl).
   - Header: supplier name, net outstanding (Dr/Cr), available credits, action buttons (Record payment / Exercise credit / Book CN / Add charge / Export CSV).
   - Tabs: **Ledger** (chronological Dr/Cr/running balance, period filter), **Open invoices** (Pay this), **Credits** (Available / Pending [Approve, Void] / Historical + Book new), **Payments** (date desc with allocation count).
   - Builds entries client-side from `invoices`, `payments`, `creditNotes`; sorts by date and computes running balance.
   - CSV export via existing `downloadCSV` util.

2. **`src/components/procurement/ExerciseCreditDialog.tsx`** — multi-CN selection, auto-distribute to oldest invoices (editable), optional net-cash payment with bank account + reference. On save: update each CN's `remaining_balance` + `status` (→ `fully_applied` when ≤ 0.01), update each invoice's `amount_paid` / `remaining_balance` / `payment_status`, optionally insert a `payments` row + per-invoice `payment_allocations` carrying `credit_note_id` + `credit_note_amount_applied`.

3. **`src/components/procurement/AddChargeDialog.tsx`** — fields: charge type (Interest / Late fee / Bank charge / Other), amount, date, description, reference, optional invoice link, notes. Inserts an `invoices` row with `invoice_number = CHARGE-<ts>`, `review_status = Approved`, `status = confirmed`, `payment_status = pending`, full amount in `remaining_balance`; appends description to notes so it's identifiable.

## File to modify

**`src/pages/procurement/ProcurementFinance.tsx`** — rewrite `SupplierPayablesTab`:
- Keep existing KPI cards (Total outstanding / Overdue / Due this week / Paid this month) and aging breakdown.
- Replace supplier table with new columns: Supplier (clickable → ledger), Outstanding, Open invoices, Oldest (red > 60d), **Credits available** (sum of approved CN `remaining_balance` per supplier, green), Actions = [Pay] [Book CN] [View ledger].
- Pay button picks the oldest open invoice for that supplier and opens `RecordPaymentDialog`.
- Additionally fetch tenant-scoped `payments` + `payment_allocations` via `fetchAllRows(..., undefined, tenantId)` (using `useActiveTenant`) to pass into the ledger sheet.
- Mount at bottom: `RecordPaymentDialog`, `BookCreditNoteDialog`, `SupplierLedgerSheet` (conditional on selected supplier).
- Update footer link text to "Bank reconciliation and journal verification available in Finance → Accounts Payable".

## Data / behaviour notes

- **No DB migration.** All required columns already exist on `invoices`, `payments`, `payment_allocations`, `credit_notes`.
- **Tenant scoping** — every new insert/update includes `tenant_id` (from `useActiveTenant`) and every supabase update chains `.eq("tenant_id", tenantId)`, matching project convention.
- **Ledger math** — Dr = invoices + charges (raise balance), Cr = payments + CN applied portion (`original - remaining`). Running balance positive = supplier is owed.
- **Type badges** — amber (Invoice), green (Payment / CN applied), sky (Credit note), red (Charge), per spec.
- **Reuse without change** — `RecordPaymentDialog`, `BookCreditNoteDialog`, `usePayables`, `APInvoice`/`APCreditNote`/`APBankAccountLite` types, `downloadCSV`, `fmtMoney`/`fmtDate` helpers.

## Out of scope (untouched)

Finance → Payables page, other ProcurementFinance tabs (Spend Summary, Credits & Deposits), sidebar/routing, all other procurement pages.
