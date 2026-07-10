# Procurement Section — Full Audit (no edits made)

Scope: every route reachable from the Procurement sidebar group + the `/procurement/*` routes registered in `src/App.tsx`. Typecheck across the whole project is currently **clean** (`tsgo --noEmit` = 0 errors), so all findings below are runtime / data-integrity / UX, not build.

## Page-by-page checklist

Legend: WORKING = renders + fetches + core actions run; DEGRADED = works but has real issues; BROKEN = dead route, crash, or silent data loss.

| # | Page (sidebar → route) | File | Status | Notes |
|---|---|---|---|---|
| 1 | Overview → `/procurement/dashboard` | `components/procurement/ProcurementDashboardTab.tsx` | DEGRADED | Uses `useVenues` for the venue chip filter (good), but the underlying invoice/GRN fetches don't scope by `tenant_id` — cross-tenant leakage on the read path. No shared `<PageHeader>` — hand-rolled `KpiCard`. |
| 2 | Master Data › Suppliers & Vendors → `/procurement/suppliers` | `components/procurement/SuppliersTab.tsx` | DEGRADED | `supabase.from("suppliers").select("*")` and every mutation runs with **no `tenant_id` filter** (lines 87, 168, 171, 179). Relies entirely on RLS. Create/edit/delete work via `SupplierSheet`. |
| 3 | Master Data › Items Master → `/procurement/products` | `components/procurement/ProductMasterTab.tsx` | WORKING | `tenant_id` correctly applied on read + insert. |
| 4 | Master Data › Categories & Units → `/procurement/categories` | `components/procurement/CategoriesTab.tsx` (+ `ProductCategoriesPanel`, `UomOptionsPanel`) | WORKING | Small wrapper, both panels load. |
| 5 | Purchasing › Purchase Orders → `/procurement/purchase-orders` | `components/procurement/PurchaseOrdersTab.tsx` | DEGRADED | Hardcoded `VENUES = ["Assembly","Caliente","Hanabi"]` (line 19) — will never surface Arca/Off-Site/Test Venue. No `tenant_id` filter on `purchase_orders`, `suppliers`, `product_master`, `product_suppliers` reads. DB currently has **0 rows in purchase_orders**, so nothing has actually been exercised end-to-end. |
| 6 | Purchasing › Goods Receipts / GRNs → `/procurement/receiving` | `components/procurement/ReceivingTab.tsx` | DEGRADED | Same hardcoded `VENUES` list (line 24). No `tenant_id` filter on `suppliers`, `product_master`, `purchase_orders`, `invoices`, `goods_received_notes`, `grn_items` (all lines 121–350). Also silently `.limit(500)` on invoices — big tenants will miss recent invoices in the picker. |
| 7 | Purchasing › Invoices → `/procurement/invoices` | `components/procurement/ProcurementInvoicesTab.tsx` (2184 lines) | DEGRADED | Two hardcoded venue lists: `SelectItem` block at 1073–1075 and options array at 2011 — Arca will not appear in filter or edit form. `tenant_id` used only in a couple of RPC/update spots; the main list read is not tenant-scoped. Otherwise CRUD, filters, sorting all wired. |
| 8 | Purchasing › Purchase Register → `/procurement/line-items` | `components/procurement/ProcurementLineItemsTab.tsx` | DEGRADED | No `tenant_id` filter; relies on RLS. Otherwise renders. |
| 9 | Purchasing › Deposit Ledger → `/procurement/deposit-ledger` | `components/procurement/DepositLedgerTab.tsx` (12 lines, stub wrapper) | WORKING | Thin wrapper; underlying `DepositTransactionSheet` uses `tenant_id`. |
| 10 | Purchasing › Credit & Debit Notes → `/procurement/credit-notes` | `pages/procurement/CreditNotes.tsx` | WORKING | Tenant-scoped, only 1 row in DB but flow renders. |
| 11 | Purchasing › Documents → `/procurement/documents` | `components/procurement/DocumentsTab.tsx` | WORKING | Storage-driven, no `tenant_id` reference needed there but should verify storage bucket policy. |
| 12 | Inventory › Stock on Hand → `/procurement/inventory` | `components/procurement/InventoryOnHandTab.tsx` | WORKING | `tenant_id` passed to RPC + stock-count reads. |
| 13 | Inventory › Stock Counts → `/procurement/stock-counts` | `pages/procurement/StockCounts.tsx` | DEGRADED | Hardcoded `VENUES = ["Assembly","Caliente","Hanabi"]` (line 75), default `"Assembly"`. Tenant filter is applied. |
| 14 | Inventory › Stock Movements → `/procurement/stock-movements` | — | BROKEN (intentional) | Sidebar item marked `disabled: true` (line 106) — no route registered. Acceptable stub, but the group implies it exists. |
| 15 | Inventory › Transfers → `/procurement/transfers` | `pages/procurement/Transfers.tsx` | DEGRADED | Hardcoded `VENUES` (line 39), defaults `fromVenue="Assembly"`, `toVenue="Caliente"`. No `tenant_id` on `transfers`, `transfer_items`, `stock_locations`, `product_master`, `profiles` reads. |
| 16 | Inventory › Waste & Adjustments → `/procurement/waste` | `pages/procurement/Waste.tsx` | WORKING | Uses `useVenues`, tenant-scoped. 0 rows in DB but flow is correct. |
| 17 | Costing › Recipes & Menu Costing → `/procurement/menu-costing` | `components/procurement/MenuCostingTab.tsx` | DEGRADED | No explicit `tenant_id` filter on menu / recipe reads (RLS-only). Otherwise renders. |
| 18 | Analysis › Purchase Analysis → `/procurement/purchase-analysis` | `pages/procurement/PurchaseAnalysis.tsx` | WORKING | Tenant-scoped. |
| 19 | Analysis › Supplier Pricing → `/procurement/supplier-pricing` | `pages/procurement/SupplierPricing.tsx` | WORKING | Tenant-scoped. |
| 20 | Analysis › Inventory Variance → `/procurement/inventory-variance` | — | BROKEN (intentional) | Sidebar disabled, no route. |
| 21 | Finance › Spend Summary → `/procurement/finance/spend` | `pages/procurement/SpendSummary.tsx` | WORKING | Tenant-scoped. |
| 22 | Finance › Supplier Accounts → `/procurement/finance/suppliers` | `pages/procurement/SupplierAccounts.tsx` | WORKING | Loads list; drill-in to `SupplierAccount` works. |
| 23 | Finance › Open Payables → `/procurement/finance/payables` | `pages/procurement/OpenPayables.tsx` | WORKING | |
| 24 | Finance › Opening Balances → `/procurement/finance/onboarding` | `pages/procurement/OpeningBalances.tsx` | WORKING | Tenant-scoped, full CRUD. |
| 25 | Finance › Payments → `/procurement/finance/payments` | — | BROKEN (intentional) | Disabled stub, no route. |

## Data-flow findings

1. **Venue master is not the source of truth.** `venues` master has 6 rows (Arca, Assembly, Caliente, Hanabi, Off-Site / Stall, Test Venue) but 5 procurement surfaces still hardcode a 3-venue list: `PurchaseOrdersTab`, `ReceivingTab`, `ProcurementInvoicesTab` (two places), `Transfers`, `StockCounts`. Arca invoices/POs cannot be created or filtered from Procurement, mirroring exactly the Daily-Sales issue that was just fixed.
2. **Existing invoice venue data is dirty.** `SELECT venue, count(*) FROM invoices` returns:
   - `Caliente` 721, `Assembly` 391, `Hanabi` 17 — clean
   - `Caliente and Hanabi` 7, `CALIENTE AND HANABI` 1 — split-venue rows (need a policy: split into two invoices or move to a `venue_scope` field)
   - `Caliante` 3, `ASSEMBLY` 1 — typos / casing that don't match the master
   Downstream aggregations (`SpendSummary`, `Dashboard`, P&L feeds) silently drop or miscategorise these ~12 rows.
3. **Tenant leakage on the read path.** Multiple hot tables are read without `.eq("tenant_id", ...)`: `suppliers` (SuppliersTab, PurchaseOrdersTab, ReceivingTab), `purchase_orders`, `product_master` (PO/GRN pickers), `product_suppliers`, `invoices` list, `invoice_line_items` (Purchase Register), `transfers`/`transfer_items`. RLS covers this today, but the pattern is inconsistent with the rest of the app and will break if RLS is ever relaxed for edge functions.
4. **Orphaned records:** `SELECT count(*) FROM invoices WHERE supplier_id NOT IN suppliers` = 0 (clean). `purchase_orders` has 0 rows so GRN→PO linkage is untested against real data.
5. **Silent caps:** `ReceivingTab` invoice picker `.limit(500)`; the app also has the known 1000-row Supabase cap that the project standard `fetchAllRows` utility is supposed to solve. Neither invoice list uses `fetchAllRows`.

## Cross-check with recent refactors

- **Venues refactor:** `SalesRecord.venue` is now `string` and Daily Sales reads `useVenues()`. Procurement did **not** get the same treatment — the 5 hardcoded lists in point 1 are the exact regressions we should expect.
- **Expenses shared primitives (`components/expenses/shared.tsx`, `PageHeader`, `KpiGrid`, `ScopeLine`, `EmptyState`, `KpiSkeleton`):** Procurement does not consume any of them. Every procurement page still hand-rolls its own KPI card, page header, and empty state. Not broken, but the visual language is drifting again.
- **Format utils:** most procurement pages use ad-hoc `toLocaleString` instead of the mandated `@/utils/format` helpers (memory: "All currency/number/date display goes through `@/utils/format`").

## UX / consistency issues (non-blocking)

- `Procurement.tsx` renders a plain `<h1>` instead of `<PageHeader>` — no breadcrumb, no scope line, no actions slot.
- Sidebar `disabled: true` items (Stock Movements, Inventory Variance, Payments) present a dead affordance — either build stubs or hide until ready.
- `ProcurementInvoicesTab` is 2 184 lines in a single file — a maintenance liability but not user-facing.
- No skeletons on most tabs during initial fetch (Suppliers, POs, Receiving, Invoices) — flashes empty state on slow networks.

## Overall verdict

**Not at professional standard yet.** The section functions and no tab crashes, but it silently drops Arca and future venues, has dirty venue data downstream, and duplicates ~5 versions of "which venues exist" that the rest of the app has already centralised. Fix these before treating Procurement as production-ready.

## Top fixes, in priority order (for a follow-up build turn)

1. **Kill every hardcoded VENUES list.** Replace with `useVenues()` (active venues only) in `PurchaseOrdersTab`, `ReceivingTab`, `ProcurementInvoicesTab` (both spots), `Transfers`, `StockCounts`. Default selections must fall back to `venues[0]?.name`, not the literal `"Assembly"`.
2. **Clean historical venue values.** One-shot migration to normalise casing (`ASSEMBLY` → `Assembly`), fix `Caliante` → `Caliente`, and decide on split-venue handling for `Caliente and Hanabi` (recommend: split into two invoices with allocated amounts, or add a `venue_scope` array column). Add a CHECK/foreign-key-style guard: `invoices.venue IN (SELECT name FROM venues)` (via trigger) so future dirty rows are impossible.
3. **Add server-side `tenant_id` filtering on all procurement reads** (Suppliers, PurchaseOrders, Receiving, Invoices list, Line Items, Transfers, MenuCosting). Match the pattern Daily Sales now uses via `useTenantId` + `.eq("tenant_id", tenantId)`.
4. **Adopt the shared design primitives.** `Procurement.tsx` → `<PageHeader>`; every tab's KPI strip → `<KpiGrid>` + `<KpiCard>`; empty/loading states → `<EmptyState>` / `<KpiSkeleton>` / `<TableSkeleton>`; all numbers → `fmtHKWhole` / `fmtInt` / `.td-num`.
5. **Replace `.limit(500)` and any list read that can exceed 1 000 rows with `fetchAllRows`.** Applies to the ReceivingTab invoice picker, ProcurementInvoicesTab main list, and `invoice_line_items` in Purchase Register.

Report only — no files were changed. Awaiting go-ahead to implement fixes 1–5.
