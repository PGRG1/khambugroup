## Problem

RLS lets `super_admin` / `platform_admin` see rows from **every** tenant (`is_super_admin(auth.uid()) OR user_has_tenant(...)`). When such a user switches tenant via `TenantSwitcher`, only hooks that explicitly filter `.eq('tenant_id', activeTenantId)` actually respect the switch. Right now only `useSalesData` and a handful of admin/procurement files do this — every other hook silently returns merged data from all tenants and inserts rows without setting `tenant_id`.

Regular tenant users are still protected by RLS, but the dashboard is wrong for super‑admins and for the "Preview As" / Test Client flows you've been validating.

~90 public tables carry `tenant_id`. ~45 hooks/pages read or write them without filtering.

## Approach

Introduce a single, enforced tenant boundary in the data layer rather than patching every call site ad‑hoc.

### 1. Central tenant helpers (new file `src/lib/tenantQuery.ts`)
- `useTenantId()` — thin re-export of `useActiveTenant().tenantId` with a loading guard.
- `tenantSelect(table, tenantId)` — returns `supabase.from(table).select(...).eq('tenant_id', tenantId)`.
- `tenantInsert(table, tenantId, payload)` — injects `tenant_id` (array or single).
- `tenantUpdate(table, tenantId, patch)` — adds `.eq('tenant_id', tenantId)` guard so cross‑tenant writes are impossible even for super‑admins.
- `tenantDelete(table, tenantId, filter)` — same guard.
- `fetchAllRowsForTenant(table, tenantId, builder?)` — wraps existing `fetchAllRows` adding `.eq('tenant_id', tenantId)`.

All hooks become 3‑line changes: pull `tenantId`, gate fetch on `if (!tenantId) return`, swap the call.

### 2. Hook refactor (sequenced, one PR-style batch per domain)

Priority order (highest blast radius first):

```text
Domain          Hooks / pages to update
──────────────  ──────────────────────────────────────────────
Finance         useChartOfAccounts, useJournal, useLedgerPL,
                useTrialBalance, usePLData, usePLStructure,
                useAccountMapping, useCashflowData, useReceivables,
                usePayables, useVendorStatements,
                pages/finance/Ledger, BillsExpenses, LedgerAuditLog
Procurement     useProductMaster, useStandardProducts, useInvoiceData,
                useProductCategories, useUomOptions, useMenuCosting,
                useExpenseBills, useRecurringExpenses,
                pages/procurement/Transfers, StockCounts
HR              useHRData, usePayrollPaymentBatches
Revenue         useRevenueSources, useServicePeriods, useRevenueTargets,
                useForecastData, useForecastPermissions
KPIs            useKpi, useKpiBundles, pages/kpis/*
Admin / misc    useVenues, usePageVisibility, useUserPermissions,
                usePushSubscription, pages/AuditLog, Notifications, Home,
                UserAccessControl, admin/Clients
```

Each hook:
- imports `useActiveTenant`, blocks fetch while `tenantLoading || !tenantId`,
- replaces `supabase.from(t).select(...)` with `tenantSelect(...)` (or `fetchAllRowsForTenant`),
- adds `tenant_id` to every insert and `.eq('tenant_id', tenantId)` to every update/delete,
- adds `tenantId` to the query key (React Query) or refetch effect deps so switching tenants invalidates cache.

### 3. Tenant switch invalidation
Extend `useActiveTenant` so changing tenant calls `queryClient.clear()` (or `invalidateQueries()`). Today only same‑hook listeners react; React Query caches keyed on the old tenant survive.

### 4. Edge functions / scanners
Audit edge functions that write tenant‑scoped tables (`ai-classify`, receipt scanner, settlement importers). They must read `tenant_id` from JWT claims (or an explicit body param) and set it on every insert. List + fix in a follow‑up pass after the client side is clean.

### 5. Tightening RLS (optional, recommended)
Once all clients pass `tenant_id` explicitly, drop the `is_super_admin(...) OR` branch from write policies and replace with a stricter rule that still requires `tenant_id = current_active_tenant()` for super‑admins. Keeps read access for support but blocks accidental cross‑tenant writes. This is a follow‑up migration, not part of the initial refactor.

### 6. Verification
- Manual: switch between KHAMBU and Test Client on Sales, Bills, Ledger, Products, HR, KPIs — each must show only the selected tenant.
- Automated: add a Playwright smoke that logs in as the test super‑admin, switches tenants, and asserts row counts differ on 4 representative pages.

## Out of scope
- New backend schema changes.
- Re‑theming or feature changes.
- Tightening RLS (deferred to a follow-up once client passes audits).

## Deliverables
1. `src/lib/tenantQuery.ts` + tenant-aware `fetchAllRows` wrapper.
2. Refactor of the ~45 hooks/pages listed above, in the priority order shown.
3. React Query cache invalidation on tenant switch in `useActiveTenant`.
4. Memory entry under `mem://architecture/multi-tenant` capturing the rule "every public-table query must go through `tenantSelect/Insert/Update/Delete` or include `.eq('tenant_id', tenantId)` explicitly".
5. Playwright smoke verifying tenant isolation on Sales, Bills, Ledger, Products.