
The user approved the dashboard pagination fix and wants me to broaden the audit: confirm every other procurement page/component that fetches `invoices`, `invoice_line_items`, `product_master`, `product_suppliers`, `suppliers`, `sales_records`, etc. also uses `fetchAllRows` so no view is silently truncated at 1000 rows.

## Plan: Audit + fix all 1000-row truncation across the app

### Scope
Sweep every hook/component that calls `supabase.from(...).select(...)` without `.range()` pagination and convert to `fetchAllRows` where the table can plausibly exceed 1000 rows.

### High-risk files to audit & fix
Based on file structure + memory, these are the suspects:

**Procurement (highest priority — 1008+ invoices already)**
- `src/components/procurement/ProcurementDashboardTab.tsx` — already in plan
- `src/components/procurement/ProcurementInvoicesTab.tsx` — invoices table
- `src/components/procurement/ProcurementLineItemsTab.tsx` — line items (multiplier of invoices)
- `src/components/procurement/InventoryOnHandTab.tsx` — inventory + line items
- `src/components/procurement/MenuCostingTab.tsx` — product master
- `src/components/procurement/ProductMasterTab.tsx` — product master + suppliers
- `src/components/procurement/SuppliersTab.tsx` — suppliers
- `src/components/procurement/DocumentsTab.tsx` — invoice file list

**Hooks**
- `src/hooks/useInvoiceData.ts` — invoices + line items + suppliers
- `src/hooks/useSalesData.ts` — sales_records (will exceed 1000)
- `src/hooks/useProductMaster.ts` — product master
- `src/hooks/useStandardProducts.ts`
- `src/hooks/useMenuCosting.ts`
- `src/hooks/useHRData.ts` — attendance, shifts, payroll history
- `src/hooks/usePLData.ts`
- `src/hooks/useForecastData.ts`

**Other pages**
- `src/pages/Invoices.tsx`, `src/pages/PLReport.tsx`, `src/pages/AuditLog.tsx`, `src/components/dashboard/*` (sales reads)
- `src/components/invoices/InvoiceAnalytics.tsx`, `LineItemsTab.tsx`, `StandardProductsTab.tsx`, `SupplierItemMappingsTab.tsx`

### Method
1. `rg "supabase\.from\(" src --type ts -n` → enumerate every read.
2. For each: check if it has `.range(` or already calls `fetchAllRows`. If neither, and the table can grow past 1000 rows, replace with `fetchAllRows("table", "cols", { col, asc })`.
3. Skip:
   - `.single()` / `.maybeSingle()` queries (capped to 1)
   - small reference tables that won't grow past 1000 (e.g. `expense_categories`, `hr_leave_types`, `hr_departments`, `forecast_approvers`, `page_visibility`, `user_roles`)
   - mutations (insert/update/delete)
4. Preserve existing ordering, filters, and column selection exactly — only swap the fetch mechanism.

### Verification
- Procurement Dashboard: Invoice Count = full DB total (1008+); Spend/Revenue charts include all months
- Invoices tab: full list visible, sortable
- Line Items tab: row count matches `select count(*)` from `invoice_line_items`
- Sales/Revenue dashboard: KPI totals match prior period totals after fix
- Product Master, Suppliers, Inventory tabs: full lists load
- No regression in initial load time beyond ~1 extra round-trip per >1000-row table
