# Expenses — Master Data (code phase)

Migration already applied successfully:
- `expense_categories`: added `parent_category_id`, `is_active` (skipped pre-existing `default_account_id`, `tenant_id`)
- `suppliers`: added `vendor_type` (default 'procurement'), `payment_terms_id` (FK to new table)
- New `expense_payment_terms` table with tenant-scoped RLS

Now the code changes. Approve to switch to build mode.

## 1. `src/components/AppSidebar.tsx`
- Import `Clock` icon
- Split `expensesItems` into a standalone `expensesOverview` plus five labelled sub-group arrays (MASTER DATA, BILLS & VENDORS, APPROVALS, ANALYTICS, FINANCE)
- Replace the flat Expenses `CollapsibleNavGroup` render with the same JSX pattern Procurement uses (overview link + mapped sub-groups, disabled items rendered with muted/pointer-events-none style)
- FINANCE entries (`Spend Summary`, `Vendor Accounts`, `Open Payables`) all disabled

## 2. `src/App.tsx`
- Import `ExpenseVendorsPage` and `ExpensePaymentTermsPage`
- Add two `AdminRoute` routes: `/expenses/vendors`, `/expenses/payment-terms`

## 3. `src/pages/expenses/Categories.tsx` (enhance, keep all existing logic)
- `useActiveTenant` → include `tenant_id` in insert payload
- Edit Sheet adds "Sub-category of" Select (excludes self on edit) and "Active" toggle (default true)
- Table gets an Active column with click-to-toggle badge between the existing Description column and the delete action
- Parents render first; children render indented (`pl-6`) with `└ ` prefix beneath their parent

## 4. `src/pages/expenses/ExpenseVendors.tsx` (new)
- Fetch `suppliers WHERE vendor_type IN ('expense','both')`, `expense_bills`, tenant-scoped `expense_payment_terms`
- KPIs: Total active vendors, With open bills, With overdue bills (all `card-glass` `KCard`-style)
- Table: Name · Type (sky "Expense only" / amber "Procurement & Expense") · Payment Terms · Contact · Email · Phone · Active (click toggle) · Edit
- Add/Edit side Sheet: Name, Type (only "Expense only" / "Procurement & Expense"), Payment Terms, Contact, Email, Phone, Address, Notes
- Empty state copy as specified

## 5. `src/pages/expenses/ExpensePaymentTerms.tsx` (new)
- All queries `.eq('tenant_id', tenantId)`
- Table: Name · Days (right-aligned `tabular-nums`) · Description · Active (click toggle) · Edit/Delete
- Delete blocked when any `suppliers.payment_terms_id` references the row, with toast: "This payment term is used by [N] vendors and cannot be deleted."
- Compact inline Dialog (not Sheet) for add/edit: Name, Days (min 0), Description, Active toggle
- No auto-seed

## Design
All three pages strictly match Procurement Finance dark theme: `card-glass`, `text-2xl font-display font-semibold tracking-tight` titles, `text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40` table headers, alternating `bg-muted/30` rows, emerald/amber/sky/muted badge palette, `sonner` toasts, HK$ formatting.

## Out of scope
Expense Bills, Statements, Recurring, Bank-Detected, Approvals, Analytics, Finance pages, Procurement Suppliers page — all untouched.
