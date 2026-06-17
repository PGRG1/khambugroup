## Goal

Add a dedicated **Bills & Expenses** workflow under Finance for non-inventory supplier bills (utilities, rent, licenses, professional fees, late charges, etc.), keep Procurement focused on stock/inventory purchases, and auto-post GL entries on approval. No changes to the existing procurement table behaviour.

## 1. New data model (migration)

New tables:

- `expense_bills` — header
  - vendor (supplier_id FK to `suppliers`), bill_number, bill_date, due_date, service_period_start, service_period_end, venue_id/venue, department, currency (default HKD), subtotal, tax_amount, total_amount, payment_status (`unpaid|partial|paid`), approval_status (`draft|pending_review|approved|rejected|posted|void`), notes, attachment_url, attachment_path, created_by, reviewed_by, approved_by, posted_by, posted_at, journal_entry_id, paid_amount
- `expense_bill_allocations` — child rows
  - bill_id FK, line_no, expense_category_id (FK `accounting_categories` or new `expense_categories` lookup), account_id FK `chart_of_accounts`, venue, department, amount, tax_treatment (`inclusive|exclusive|none`), tax_amount, notes
- `expense_bill_audit` — append-only event log (event_type, actor, at, details jsonb) for upload/review/approve/post/pay/void
- Link table `expense_bill_links` (optional) — `parent_bill_id`, `child_bill_id`, `link_type` (`late_fee|credit_note|correction`) so a separately-issued late-fee bill can reference the original.

RLS: authenticated read/write; service_role full. GRANTs included in same migration. `updated_at` triggers. Validation trigger that enforces `SUM(allocations.amount) = bills.subtotal` (or `total_amount - tax_amount`).

## 2. Auto-posting to GL

Extend `rebuild_journal_from_operations` (or a new RPC `post_expense_bill(bill_id)` called on approval):

- On **approve → post**:
  - For each allocation: `Dr account_id : amount` (venue/department tagged)
  - Tax line if any: `Dr Tax Input account : tax_amount`
  - `Cr Accounts Payable : total_amount` (vendor subledger via `source_id = bill_id`)
- On **payment** (reuse existing `invoice_payments` pattern, but on `expense_bill_payments`):
  - `Dr AP : amount`, `Cr Bank/Cash : amount`
- Set `journal_entry_id` on bill; ledger audit log entry.
- Late-fee allocation rows just map to `Late Payment Charges / Finance Costs` account in the same bill — no special logic needed beyond category choice.

Payables and Payments & Settlements views: extend the existing AP query to UNION `invoices` + `expense_bills` so a single payables list shows both. Bank Reconciliation matches against AP entries unchanged.

## 3. UI — `/finance/bills-expenses`

New page `src/pages/finance/BillsExpenses.tsx` plus components in `src/components/finance/bills/`:

- **List view**: high-density table — Vendor, Bill #, Bill date, Due date, Venue, Department, Total, Tax, Payment status, Approval status, Attachment icon. Filters: status, vendor, venue, date range, YYYY-MM. Excel-style column filters. CSV export with UTF-8 BOM.
- **Bill editor (Sheet/Dialog)** — two panes:
  - Left: form fields (vendor, bill #, dates, service period, venue, department, currency, total, tax, payment status, notes) + **Allocations table** (add/remove rows; columns: Category, Account, Venue, Department, Amount, Tax treatment, Notes). Live running total vs. bill total with red highlight if mismatch.
  - Right: attachment preview (reuse `AttachmentViewerDialog` logic).
  - Action bar: Save Draft · Submit for Review · Approve & Post · Record Payment · Void · "Link as Late Fee to…" (opens picker of prior bills from same vendor).
- **Audit trail panel** at bottom of editor, reading `expense_bill_audit`.
- Reuse design primitives: `PageHeader`, `KpiCard`, `StatusBadge`, `@/utils/format`.

KPI strip at top of list: Total Outstanding, Overdue, Due in 7 days, Posted MTD.

## 4. Document routing

Extend the upload classifier (currently routes everything through `parse-invoice`). Add a router step in `supabase/functions/parse-invoice/index.ts` (or new `classify-document` function) that returns a `document_type`:

- `procurement_invoice` — inventory/ingredients/beverages/packaging → existing flow
- `bill_expense` — utilities, rent, licences, services → create `expense_bills` row
- `asset_purchase` — equipment → flag for Fixed Asset register (stub for now: route to bills with `financial_treatment='Asset - Fixed Asset'`)
- `payroll_document` → HR (stub: surface in Document Centre with tag)
- `bank_payment_document` → Bank Reconciliation upload
- `manual_journal` → Journal

Classification uses AI (existing Gemini path) with prompt listing the six buckets and keyword hints; user can override via dropdown in Document Centre before commit. Document Centre gets a "Route to" picker on each pending document.

Procurement's invoice scanner stays as-is for inventory bills; on the Document Centre the AI suggestion drives routing.

## 5. Sidebar & routes

`src/components/AppSidebar.tsx`: add `{ title: "Bills & Expenses", url: "/finance/bills-expenses", icon: Receipt }` to `financeItems` after "Documents & Bills" (or replace "Documents & Bills" with the new page if user prefers — see open question). `src/App.tsx`: register route. Add page permission key `bills-expenses` to `handle_new_user_access` trigger and `usePagePermissions`.

## 6. Audit trail & permissions

- Every state change writes `expense_bill_audit` (uploaded, reviewed, approved, posted, paid, voided, linked).
- `usePagePermissions('bills-expenses')` gates view/edit/admin actions.
- Approval requires `edit`; posting + payment require `admin`.

## 7. Procurement — no breaking changes

- Procurement invoices table, scanner, line items, item master, menu costing, price variance — untouched.
- Document Centre's "Send to Procurement" stays the default for inventory documents.
- Existing `invoices` rows are not migrated automatically. Optional admin tool "Reclassify as Expense Bill" can move a single procurement invoice (with confirmation) — out of scope unless requested.

## Technical notes

- New migration creates `expense_bills`, `expense_bill_allocations`, `expense_bill_payments`, `expense_bill_audit`, `expense_bill_links` + GRANTs + RLS + triggers.
- New RPC `post_expense_bill(p_bill_id uuid)` (SECURITY DEFINER) handles GL posting and audit.
- New hook `src/hooks/useExpenseBills.ts` (uses `fetchAllRows`).
- New components under `src/components/finance/bills/`.
- Payables hook extended to union expense bills.
- All money formatting via `@/utils/format`; status via `StatusBadge`.

## Open questions (will ask before building)

1. Replace the existing "Documents & Bills" page or keep both?
2. Should approval require a second user (maker/checker) or single-step?
3. Default tax treatment for HK (no VAT) — assume `none` unless overridden?