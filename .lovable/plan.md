
# Procurement Finance — Supplier Accounts

Build out Procurement Finance with two new tabs (Supplier Accounts, Open Payables), a full Supplier Account page, and an expanded sidebar Finance section. Reuse existing hooks, queries, and styling. No new tables or migrations.

## 1. Sidebar (`src/components/AppSidebar.tsx`)

Replace the single "Spend Summary" link under Procurement → FINANCE with:

```text
FINANCE
  Spend Summary      /procurement/finance
  Supplier Accounts  /procurement/finance/suppliers
  Open Payables      /procurement/finance/payables
  Payments           /procurement/finance/payments   (disabled stub)
```

Use the existing `disabled` pattern already in the Procurement sub-groups for the Payments stub.

## 2. Routing (`src/App.tsx`)

Add admin-protected routes:

- `/procurement/finance/suppliers` → `<ProcurementFinance defaultTab="suppliers" />`
- `/procurement/finance/payables` → `<ProcurementFinance defaultTab="open-payables" />`
- `/procurement/finance/suppliers/:supplierId` → `<SupplierAccountPage />` (via thin route wrapper)

Extend `ProcurementFinance` to accept a `defaultTab` prop controlling the initial Tabs value.

## 3. `ProcurementFinance.tsx` — two new tabs

Existing tabs (`spend | payables | credits`) unchanged. Add:

- `suppliers` — "Supplier Accounts"
- `open-payables` — "Open Payables"

### Supplier Accounts tab

Tenant-scoped via `useActiveTenant`. Sources:
- `invoices`, `credit_notes` — via `usePayables()` (already tenant-scoped).
- `payments`, `payment_allocations` — fetched via `fetchAllRows` **without** `tenant_id` filter (those tables have no `tenant_id` column). Filter client-side by `payment.supplier_id ∈ supplierIds-from-tenant-scoped-invoices/CNs`.

Aggregate per supplier:
- `current_balance` = Σ outstanding invoice amounts
- `overdue_balance` = Σ outstanding where `due_date < today`
- `available_credits` = Σ `remaining_balance` on approved CNs
- `unallocated_payments` = Σ (payment.amount − Σ allocations) > 0
- `last_transaction_date` = max date across invoices/payments/CNs
- `open_invoice_count`

Show only suppliers with at least one invoice/payment/CN.

KPI cards (KCard): Total outstanding · Total overdue · Total available credits · Total unallocated payments.

Table columns: Supplier | Balance | Overdue | Available Credits | Unallocated Payments | Open Invoices | Last Activity | Actions.

Row styling:
- Overdue > 0 → `border-l-2 border-amber-400`
- Credits > 0 → `text-emerald-400` on credits cell
- Unallocated > 0 → amber "Unallocated" chip

Action: "View Account" → `/procurement/finance/suppliers/:supplierId`.

### Open Payables tab

Filter: `outstanding_amount > 0 AND payment_status !== 'voided' AND review_status === 'Approved'`.

Ageing filter pills: Current · 1–30 · 31–60 · 61–90 · 90+ (single-select with "All").

Columns: Supplier | Invoice # | Venue | Invoice Date | Due Date | Total | Paid | Outstanding | Days Overdue | Status | Actions.

Row styling:
- `days_overdue > 60` → `text-red-400` on Days Overdue
- `days_overdue > 0` → `text-amber-400`
- Disputed → `border-l-2 border-amber-400`

Actions: Pay (existing `RecordPaymentDialog`), View (existing invoice detail).

KPI cards: Total outstanding · Total overdue · Due this week · Available credits.

## 4. `SupplierAccountPage.tsx` (new)

Promoted from `SupplierLedgerSheet` content. **Do not modify `SupplierLedgerSheet.tsx`.**

Layout:
- Back link → `/procurement/finance/suppliers`
- Header: supplier name + ID
- Summary bar (KCards): Outstanding · Overdue · Available Credits · Unallocated Payments · Deposits Outstanding
- Action buttons: Record Payment · Apply Credit · Book Credit Note · Add Charge · Record Refund · Export
- Tabs (amber underline convention):

**Statement** — running ledger. Extend local `LedgerType` with `refund | incentive | deposit | deposit_refund`. Columns: Date | Type | Reference | Description | Venue | Charges | Credits | Balance. Balance Dr/Cr colouring per spec. Period filter (All / This month / Last 3m / This year). CSV export. Badge colours per spec.

Refund entries: join `invoice_line_items` → `product_master` (for `financial_treatment`) and `invoices` (for `supplier_id`, `invoice_date`, `venue`, `discount_type`). Filter client-side where `product_master.financial_treatment = 'Supplier Refund'` OR `invoices.discount_type = 'refund'`, then scope to current supplier via `invoices.supplier_id`. Appear as credit entries.

**Open Documents** — three sub-sections:
1. Unpaid invoices (this supplier subset) — Pay action.
2. Unapplied credits — approved CNs with `remaining_balance > 0`. Actions: Exercise (`ExerciseCreditDialog`), Void.
3. Unallocated payments — Allocate (`AllocatePaymentDialog`). Filter client-side via supplier match.

**Payments** — full history newest first (filtered client-side by `supplier_id`). Columns + status badges (`awaiting_bank_match` / `matched` / `not_required`). Expandable row showing allocations. Top button: Record Payment (pre-selected supplier).

**Credits & Adjustments** — Available · Pending · Refunds received · Historical sections. Top button: Book Credit Note (pre-filled supplier).

**Incentives** — Two sections:

1. *Buy-X-Get-Y-Free Deals* — query `item_supplier_deals` filtered by `supplier_id` + `tenant_id`. Table:
   `Deal Type | Product | Buy Qty | Free Qty | Notes | Active | Actions`
   Banner above table:
   > "Rebates, volume incentives, and milestone rewards are recorded manually. Use the Book Credit Note workflow to record an earned incentive when received from the supplier. Incentive tracking and auto-calculation are not yet available."
   Top button: **Add Deal** → simple dialog inserting an `item_supplier_deals` row (`deal_type` fixed to `buy_x_get_y_free`, product lookup from `product_master`, `buy_qty`, `free_qty`, `notes`, `is_active` toggle).

2. *Other Incentives & Rebates* — manual notes table:
   `Date Recorded | Type | Description | Amount | Status | Linked Credit Note | Actions (Edit / Delete)`
   Source from `supplier_incentive_notes` if it exists; otherwise UI-only empty state. **No migrations.** Footnote: "Earned incentives should be settled via a credit note booked in Credits & Adjustments."

**Deposits** — same join pattern: `invoice_line_items` ⨝ `product_master` ⨝ `invoices`. Filter where `product_master.financial_treatment` matches `Asset - Supplier Deposit`, scoped to current supplier. Columns + totals row + footnote: "Deposits are balance sheet items and do not affect procurement cost or inventory."

## 5. Data + tenancy rules

- Tenant-aware tables (`invoices`, `credit_notes`, `invoice_line_items`, `item_supplier_deals`, `product_master`, `suppliers`): `.eq('tenant_id', tenantId)` from `useActiveTenant()`.
- **Non-tenant tables** (`payments`, `payment_allocations`): fetch without `tenant_id`; scope client-side via supplier IDs derived from tenant-scoped `usePayables()` data.
- `financial_treatment` lives on `product_master` — never query it on `invoice_line_items`. Always join via `product_master_id`.
- `discount_type` lives on `invoices`.
- No schema changes. No edits to `SupplierLedgerSheet.tsx`.

## 6. Styling

Match existing `ProcurementFinance.tsx`: `card-glass`, `KCard`, `SectionLabel`, amber underline tabs, `td-num tabular-nums`, `HK$` 2dp via `@/utils/format`.

## Technical notes

- `ProcurementFinance` becomes prop-driven: `defaultTab?: string`.
- New files:
  - `src/components/procurement/SupplierAccountPage.tsx`
  - `src/pages/procurement/SupplierAccount.tsx` (thin route wrapper under `AdminRoute`)
- Reused dialogs: `RecordPaymentDialog`, `AllocatePaymentDialog`, `BookCreditNoteDialog`, `ExerciseCreditDialog`, `AddChargeDialog`.
- Ageing computed client-side from `due_date` vs today; "Due this week" = due within next 7 days, outstanding > 0.
- CSV export reuses `csvDownload` util with UTF-8 BOM.
