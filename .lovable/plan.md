## Goal
Replace the placeholder in `src/pages/procurement/CreditNotes.tsx` with a fully functional Credit & Debit Notes page that lists formal supplier credit notes from the `credit_notes` table, with filters, summary KPIs, a row-click detail Sheet, and reuses `BookCreditNoteDialog` for creation. No backend, sidebar, routing, or shared-component changes.

## Scope
- Edit only: `src/pages/procurement/CreditNotes.tsx`
- Reused as-is: `BookCreditNoteDialog`, `APInvoice` type from `usePayables`, `fetchAllRows`, `useActiveTenant`, supabase client, existing shadcn UI primitives.
- Untouched: `usePayables` hook, Finance → Payables page, `credit_notes` schema, sidebar, routes.

## Page structure
1. **Header** — title "Credit & Debit Notes", subtitle, amber "+ New credit note" button on the right.
2. **Summary cards (3-up grid)**
   - Available credits — sum of `remaining_balance` where status = `approved` (amber tinted card).
   - Pending review — count where status ∈ {`draft`,`needs_review`}.
   - Applied this month — sum of `original_amount - remaining_balance` for `fully_applied` rows updated in current month.
3. **Disputed-invoice banner** — shown only if `disputedCount > 0`, links to the disputed invoices view.
4. **Filters row** — search input, supplier select, status select, venue select.
5. **Tabs** — "Credit Notes (N)" and "Debit Notes (0)".

### Credit Notes tab
- Table with the spec'd columns (CN #, Date, Supplier, Venue, Linked invoice, Original, Applied, Remaining, Status), monospace CN number, right-aligned amounts, amber/bold remaining when > 0.
- Status badges per spec color map.
- Row hover: subtle bg + 3px amber left border. Click opens detail Sheet.
- Empty state: icon + copy + "+ New credit note" button.

### Debit Notes tab
- Placeholder block: "Debit notes coming soon" + explanation copy.

### Detail Sheet (right side, `sm:max-w-[560px]`)
- Header: CN number title, supplier + date subtitle.
- Overview card: supplier, date, venue, linked invoice (text), status badge.
- Amounts card: original / applied / remaining.
- Notes block when present.
- Attachment link (paperclip) when `attachment_url` exists — uses a signed URL via `supabase.storage` if path-like, else plain link. Keep it minimal: render an `<a target="_blank">` to `attachment_url` to match other procurement pages.
- Footer: Close button.

## Data fetching (single `fetchData` on mount + after save)
Use `useActiveTenant()` for `tenantId`; guard until present.
1. `credit_notes` via `fetchAllRows` with the spec'd column list.
2. `suppliers` via `fetchAllRows` → build `supplierMap` and `supplierTuples`.
3. Venues — `fetchAllRows("invoices","venue", …)` then dedupe+sort.
4. Invoices for dialog — direct supabase select with the AP-shaped fields, ordered by `invoice_date desc`.
5. Linked invoice numbers — `.in("id", linkedInvoiceIds)` to build `linkedInvoiceMap`.
6. Disputed count — `select("id", { count: "exact", head: true })` filtered by tenant + `status = "disputed"`.

Loading + error states handled with simple skeleton/spinner and toast.

## Filtering (client-side, memoized)
Matches CN number, supplier name, or linked invoice number on search; equality filters for supplier, status, venue.

## New credit note flow
Amber header button (and empty-state button) set `cnDialogOpen=true`. `BookCreditNoteDialog` receives `suppliers=supplierTuples`, `venues`, `invoices`, and an `onSaved` that closes the dialog and re-runs `fetchData`.

## Styling
Follow existing procurement aesthetic (deep zinc dark, `card-glass`, `chip`, `td-num` for amounts), Tailwind utilities only, currency/date via `@/utils/format`.

## Out of scope
No migrations, no edits to `BookCreditNoteDialog`, no Finance/Payables changes, no debit-notes implementation (placeholder only).
