## Procurement Finance — Four standalone pages

Replace the tabbed `ProcurementFinance.tsx` shell with four dedicated, admin-protected pages. Each sidebar link goes to its own route; no shared container.

### Step 1 — Sidebar & routing

**`src/components/AppSidebar.tsx`** — under Procurement → FINANCE, replace the single Spend Summary link with four items:
- Spend Summary → `/procurement/finance/spend`
- Supplier Accounts → `/procurement/finance/suppliers`
- Open Payables → `/procurement/finance/payables`
- Payments → `/procurement/finance/payments` *(disabled, greyed-out pattern)*

**`src/App.tsx`** — replace existing `/procurement/finance*` routes with:
- `/procurement/finance` → `<Navigate to="/procurement/finance/spend" replace />`
- `/procurement/finance/spend` → `<SpendSummaryPage />` (AdminRoute)
- `/procurement/finance/suppliers` → `<SupplierAccountsPage />` (AdminRoute)
- `/procurement/finance/payables` → `<OpenPayablesPage />` (AdminRoute)
- `/procurement/finance/suppliers/:supplierId` → `<SupplierAccountPage />` (AdminRoute, already exists — keep)

Remove the `defaultTab` prop usage. Drop the import of `ProcurementFinance`.

### Step 2 — `src/pages/procurement/SpendSummary.tsx` (new)

Lift `SpendSummaryTab` out of `ProcurementFinance.tsx` verbatim (data logic, KPIs, charts, tables unchanged). Wrap in a page shell with:
- Title **"Spend Summary"**, subtitle "Procurement cost by category and supplier for the selected period"
- Month navigator + venue filter on the right (reuse current state from ProcurementFinance)

### Step 3 — `src/pages/procurement/SupplierAccounts.tsx` (new)

Lift `SupplierAccountsTab` into its own page.
- Header: title **"Supplier Accounts"**, subtitle "Current balance, credits, and payment position for each supplier", search + venue filter right
- 4 KPI cards: Total outstanding (amber) · Total overdue (red) · Available credits (emerald) · Unallocated payments (amber)
- Whole row clickable → `navigate('/procurement/finance/suppliers/:id')`. No side panel.
- Overdue rows: `border-l-2 border-amber-400`; hover bg change
- Payments query is best-effort: on failure or empty, render rows with `—` in Unallocated Payments; never block render

### Step 4 — `src/pages/procurement/OpenPayables.tsx` (new)

Lift `OpenPayablesTab` into its own page.
- Header: title **"Open Payables"**, subtitle "All outstanding supplier invoices awaiting payment", venue + supplier filter right
- 4 KPI cards: Outstanding (amber) · Overdue (red) · Due this week (sky) · Available credits to apply (emerald)
- Ageing pills: All · Current · 1–30 · 31–60 · 61–90 · 90+ (single-select, default All)
- Columns: Supplier | Invoice # | Venue | Invoice Date | Due Date | Total | Paid | Outstanding | Days Overdue | Status | Actions
- Row actions:
  - **Pay** → opens `RecordPaymentDialog` pre-filled; on save mutate row inline (no reload)
  - **View** → `navigate('/procurement/finance/suppliers/:id', { state: { openTab: 'open-docs', highlightInvoiceId } })`
- Supplier name in row is a link to the supplier page

### Step 5 — `src/pages/procurement/SupplierAccount.tsx` (rewrite as full page)

The existing file is currently a thin wrapper around `SupplierLedgerSheet`. Replace with a real page component (do **not** modify `SupplierLedgerSheet.tsx`).

**Header**
- Back link `← Supplier Accounts` → `/procurement/finance/suppliers`
- Page title = supplier name; supplier ID in muted monospace below
- Top-right actions: Record Payment (primary) · Apply Credit · Book Credit Note · Add Charge · Record Refund · Export

**KPIs (5 cards)**: Outstanding (amber) · Overdue (red) · Available Credits (emerald) · Unallocated Payments (amber) · Deposits Outstanding (muted if zero)

**Tabs** (amber underline, default Statement): Statement · Open Documents · Payments · Credits & Adjustments · Incentives · Deposits

Read `useLocation().state` for `openTab` + `highlightInvoiceId`; if `highlightInvoiceId` set, scroll into view and apply `bg-amber-400/20` for 2s then fade.

**Statement** — running ledger (date asc, running balance). Period filter left, Export CSV right. Cols: Date | Type | Reference | Description | Venue | Charges | Credits | Balance. Type badges per spec. Balance positive=amber "Dr", negative=emerald "Cr". Invoice row click → existing invoice detail panel (reuse). Payment row click → inline expand showing allocations. Footer totals row.

**Open Documents** — three sub-sections:
- Unpaid invoices — "Pay this" → `RecordPaymentDialog`
- Unapplied credits — Exercise (`ExerciseCreditDialog`) / Void
- Unallocated payments — Allocate (`AllocatePaymentDialog`)
- Empty sub-sections: one-line message, no spinner

**Payments** — newest first; "Record Payment" top-right. Cols: Date | Amount | Method | Reference | Invoices Settled | CN Applied | Bank Status | Actions. Bank status badges: `awaiting_bank_match`=amber "Awaiting match", `matched`=emerald "Cleared", `not_required`=muted. Row expand → inline allocation detail.

**Credits & Adjustments** — "Book Credit Note" top-right. Sub-sections: Available (Exercise/Void) · Pending (Approve/Void) · Refunds received (with banner) · Historical (read-only). Refunds source: `invoice_line_items` joined to `product_master!product_master_id(financial_treatment)` and `invoices!invoice_id(supplier_id, discount_type)`, client-filter where `financial_treatment = 'Supplier Refund'` OR `discount_type = 'refund'`, scoped to current supplier.

**Incentives** — two sub-sections:
- Buy-X-Get-Y-Free deals: query `item_supplier_deals` by `supplier_id + tenant_id`. Cols: Deal Type | Product | Buy Qty | Free Qty | Notes | Active | Actions. "Add Deal" top-right inserts new row (`deal_type='buy_x_get_y_free'`, product from `product_master` lookup). Banner above table per spec.
- Other Incentives & Rebates: notes table from `supplier_incentive_notes` if it exists (try/catch on query); otherwise empty state. **No migrations.**

**Deposits** — join `invoice_line_items` → `product_master` → `invoices`, filter where `product_master.financial_treatment` matches "Asset - Supplier Deposit", scoped via `invoices.supplier_id`. Cols: Date | Invoice # | Description | Charged | Returned | Net Outstanding | Status. Totals row. Footnote per spec.

### Data rules (enforced across all four pages)

- `payments` and `payment_allocations` — never filter by `tenant_id`. Fetch all, then client-filter by `supplier_id ∈ tenant-scoped supplier IDs`.
- All other tables: `.eq('tenant_id', tenantId)` from `useActiveTenant()`.
- `financial_treatment` lives on `product_master` — always join, never read off `invoice_line_items`.
- Never block page render on a single query failure — show `—` in affected columns.
- Reuse without modification: `usePayables()`, `RecordPaymentDialog`, `AllocatePaymentDialog`, `BookCreditNoteDialog`, `ExerciseCreditDialog`, `AddChargeDialog`, `SupplierLedgerSheet`.

### Cleanup

- Delete `src/pages/procurement/ProcurementFinance.tsx` (no remaining importers after sidebar/routes updated).
- Keep `SupplierLedgerSheet.tsx` untouched (still used elsewhere if referenced; otherwise leave as dead code per spec).

### Files touched

- Edit: `src/components/AppSidebar.tsx`, `src/App.tsx`, `src/pages/procurement/SupplierAccount.tsx`
- Create: `src/pages/procurement/SpendSummary.tsx`, `src/pages/procurement/SupplierAccounts.tsx`, `src/pages/procurement/OpenPayables.tsx`
- Delete: `src/pages/procurement/ProcurementFinance.tsx`
