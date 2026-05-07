# Standardize Table Style Across the App

Apply the Document Centre table pattern (search + Filters popover + Columns dropdown + Sort dropdown + paginated footer with rows-per-page) to every data table in the app.

## Approach

Rather than copy-pasting the same toolbar + footer JSX into 25+ files (which we'd have to re-edit every time the pattern evolves), build a single shared primitive and adopt it everywhere. This guarantees true consistency and makes future tweaks a one-line change.

## Step 1 — Build shared primitives

Create `src/components/common/data-table/`:

- `DataTableShell.tsx` — wraps a `Card.card-glass` containing:
  - **Top toolbar**: left = `<DataTableSearch>` + status `<Select>` slot + `<DataTableFilters>` popover + result-count text. Right = action buttons slot (Download, Add, etc.) + `<DataTableColumns>` + `<DataTableSort>`.
  - **Table body**: render-prop / children — uses existing `@/components/ui/table`.
  - **Footer**: `<DataTablePagination>` with rows-per-page + page numbers (10/25/50/100, ChevronsLeft/Left/Right/RightMost, ellipsis logic).
- `DataTableFilters.tsx` — generic Popover with a `fields: FilterField[]` config (select / date-range / text). Auto-shows active count badge and Reset button.
- `DataTableColumns.tsx` — DropdownMenu over `columns: { key, label, alwaysVisible? }[]` driving a visibility map.
- `DataTableSort.tsx` — DropdownMenu listing sortable columns + Asc/Desc toggle, bound to existing `SortColumn[]` from `@/utils/tableSort`.
- `usePagination.ts` — small hook returning `{ page, pageSize, setPage, setPageSize, pageItems, totalPages, rangeStart, rangeEnd, getPageNumbers }` from a filtered array.

These mirror the exact markup/styling already in `DocumentCentre.tsx` (lines 334–562), so the look-and-feel stays identical.

## Step 2 — Refactor Document Centre and Product Master to consume the new primitives

Prove the API on the two pages that already follow the pattern. No visual change expected.

## Step 3 — Refactor remaining tables to use the shell

Apply to the following, preserving each table's existing columns, business logic, and any specialized features (inline edit, virtualization, expandable rows). For very dense financial tables (Journal, Ledger, TrialBalance, Cashflow*), we keep the financial-aesthetic body styling but adopt the standard toolbar + footer.

Procurement
- `ProcurementInvoicesTab.tsx`, `ProcurementLineItemsTab.tsx`, `SuppliersTab.tsx`, `CategoriesTab.tsx`, `InventoryOnHandTab.tsx`, `MenuCostingTab.tsx`, `DocumentsTab.tsx`

Invoices
- `StandardProductsTab.tsx`, `SupplierItemMappingsTab.tsx`

Finance
- `Journal.tsx`, `Ledger.tsx`, `TrialBalance.tsx`, `Cashflow.tsx`, `CashflowStatement.tsx`, `CashflowLedger.tsx`, `LedgerAuditLog.tsx`, `DocumentsBills.tsx`, `Payables.tsx`, `Receivables.tsx`, `BankReconciliation.tsx`

HR
- `PayrollTab.tsx`, `AttendanceTab.tsx`, `LeaveManagementTab.tsx`, `EmployeeDirectoryTab.tsx`

Other
- `AuditLog.tsx`, `UserAccessControl.tsx`, `RevenueTargetPanel.tsx`, `PLManualInputEditor.tsx`, `dashboard/DataTable.tsx` (sales table)

## Out of scope / kept as-is

- The P&L Report grid, Balance Sheet, Forecast input grid, HR Schedule grid — these are pivot/matrix layouts (rows = accounts, columns = periods), not list tables, so the standard toolbar doesn't apply.
- Excel-style header filter popovers already used in `dashboard/DataTable.tsx` stay; we just wrap them in the new shell so the footer + Columns/Sort dropdowns are consistent.

## Memory updates

After Step 1 lands, add a memory:
- `mem://design/system-primitives` (existing) — append a note pointing to `DataTableShell` as the canonical table layout, and add a Core line: "All list tables use `<DataTableShell>` (search + Filters popover + Columns + Sort + paginated footer). Never hand-roll table toolbars/footers."

## Notes

- This is a large refactor (~25 files). Visual regressions are the main risk; we'll spot-check each page in the preview after refactoring, in groups (Procurement → Finance → HR → Other).
- Existing per-table behavior (CSV export filenames, inline editing, virtualization, action menus) is preserved — only the toolbar chrome and footer are standardized.
