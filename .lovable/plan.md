# Multi-Tenant Conversion Plan

Convert BANI Portal into a secure multi-tenant app **without removing or rebuilding existing functionality**. Current data becomes one tenant: **KHAMBU Group**, with venues Assembly, Caliente, Hanabi, Off-Site/Stall, and Arca (already in DB — note "Arca", not "ARKA").

We will ship this in **8 small, reversible stages**, one approval per stage, so the app keeps working between stages.

---

## Hierarchy

```
Bani Platform
  └─ Tenant (e.g. KHAMBU Group)
       └─ Venues (Assembly, Caliente, Hanabi, Arca, Off-Site/Stall)
            └─ Users, Departments, Data
```

- Caliente / Assembly / Arca are **venues**, not tenants.
- A user belongs to one or more tenants via `tenant_members`, and is optionally scoped to specific venues via a new `venue_memberships` table.
- A super admin (Bani platform staff) can see all tenants; tenant admins only see their own.

---

## Stage 0 — Foundation (this round)

Schema:
- `tenants`: add `slug`, `status`, `plan` (keep existing row, rename display to "KHAMBU Group").
- `venues`: add `tenant_id uuid` (nullable → backfill to KHAMBU → NOT NULL + FK).
- New `venue_memberships(user_id, venue_id, role)` with RLS.
- Helper SQL functions (SECURITY DEFINER, search_path=public):
  - `user_tenant_ids(uuid) → uuid[]`
  - `user_has_tenant(uuid, uuid) → bool`
  - `user_venue_ids(uuid, uuid) → uuid[]`
  - `user_has_venue(uuid, uuid) → bool`
  - Keep existing `current_user_tenant_id`, `is_tenant_admin`, `is_super_admin`, `has_role`.

Frontend: no UI redesign. `useActiveTenant` keeps working unchanged.

## Stage 1 — Expenses & Recurring Expenses

Tables: `expense_bills`, `expense_bill_allocations`, `expense_bill_audit`, `expense_bill_links`, `expense_bill_payments`, `expense_recurring_rules`, `expense_categories`, `expense_vendor_statements`, `expense_vendor_statement_lines`.

For each:
1. `ADD COLUMN tenant_id uuid` (nullable, default KHAMBU id).
2. Backfill all rows → KHAMBU.
3. `DO $$ ... RAISE EXCEPTION` guard if any row is still NULL.
4. `SET NOT NULL` + FK to `tenants(id)`.
5. Add `venue_id uuid NULL` FK where the table is venue-scoped (bills, allocations, rules).
6. Replace RLS policies with tenant + venue scoping using `user_has_tenant` / `user_has_venue`. Keep a `*_legacy_admin` policy for `service_role` to make rollback safe.
7. Stamp `tenant_id` automatically via `BEFORE INSERT` trigger if client omits it (uses `current_user_tenant_id()`).

## Stages 2–6 (same pattern, one per round)

- **Stage 2 — Accounting & journals**: `journal_entries`, `journal_lines`, `chart_of_accounts`, `account_mapping_rules`, `reconciliation_mapping_rules`, `ledger_audit_log`, `pl_structure_rows`, `pl_manual_lines`, `cashflow_settings`, `accounting_categories`. Update `rebuild_journal_from_operations`, `post_payroll_accrual`, etc. to filter by `current_user_tenant_id()`.
- **Stage 3 — Bank & payments**: all `bank_*`, `payment_*`, `payments`, `payment_allocations`, `credit_notes`, `invoice_payments`.
- **Stage 4 — Procurement & inventory**: `suppliers`, `supplier_item_mappings`, `product_master`, `product_suppliers`, `product_categories`, `product_pack_conversions`, `standard_products`, `uom_options`, `invoices`, `invoice_line_items`, `inventory_*`, `menu_*`.
- **Stage 5 — Revenue, forecasts & KPIs**: `sales_records`, `revenue_sources`, `service_periods`, `revenue_targets`, `forecasts`, `forecast_approvers`, `events`, `kpi_*`.
- **Stage 6 — People, payroll & platform**: `hr_*`, `alert_*`, `audit_log`, `push_subscriptions`, `app_config`, `venues_config`, `page_visibility`, `user_access_control`, `user_page_permissions` (re-keyed to `(user_id, tenant_id, page_key)`).

## Stage 7 — Edge function & AI hardening

Every edge function (`create-user`, `list-users`, `parse-bill`, `parse-invoice`, `parse-receipt`, `ai-classify`, `match-settlement-batches`, `evaluate-alerts`, `chat-assistant`, `classify-bank-txn`, etc.):
- Validate JWT via `getClaims`.
- Resolve allowed `tenant_id` via `tenant_members` using the service-role client.
- Add `.eq('tenant_id', tid)` on every read and stamp `tenant_id` on every write.
- `create-user`: require caller is `tenant_admin` of the target tenant.

## Stage 8 — Isolation tests

Vitest suite with 4 personas seeded into a second test tenant "Acme":
- `owner@khambu.test` (tenant_admin)
- `manager.caliente@khambu.test` (venue-scoped)
- `owner@acme.test` (different tenant)
- `platform@bani.test` (super_admin)

For each stage's tables, assert: Acme user cannot SELECT/INSERT/UPDATE/DELETE KHAMBU rows; venue-scoped user only sees their venue; super_admin sees both.

---

## Safety rules applied to every stage

- All `tenant_id` columns added **nullable + defaulted to KHAMBU first**, backfilled, verified, then `SET NOT NULL`.
- FKs added only after `NOT NULL` succeeds.
- **No `DELETE`, `TRUNCATE`, or `DROP TABLE` against business data.**
- Each stage keeps a `*_legacy_admin` RLS policy for `service_role` so rollback is one migration.
- No UI redesign, no new modules, no new business rules during this work.

## Technical details (for review)

- Helper functions are `SECURITY DEFINER` with `SET search_path = public` to avoid RLS recursion (see existing `has_role`, `current_user_tenant_id`).
- `user_page_permissions` PK changes from `(user_id, page_key)` to `(user_id, tenant_id, page_key)` in Stage 6 — `handle_new_user_access()` trigger updated to insert one row per tenant the user joins.
- Storage buckets are not partitioned yet; Stage 3 adds a `tenant_id` prefix convention (`{tenant_id}/...`) and an RLS policy on `storage.objects` using `user_has_tenant`. Existing files stay readable via a legacy policy until backfilled.
- Frontend reads continue to use `useActiveTenant().tenantId` (already implemented); no component changes required for Stages 0–6 because RLS does the filtering. Inserts will automatically be stamped server-side by triggers, so existing `supabase.from(...).insert(...)` calls keep working.

---

## Questions before I start

1. **Venue naming** — DB currently has **"Arca"**. Your brief says **"ARKA"**. Rename to "ARKA", or keep "Arca"?
2. **Hanabi & Off-Site/Stall** — keep both as KHAMBU Group venues (status quo), or exclude either from the tenant?
3. **Stage cadence** — ship one stage per approval (8 migrations, safer, slower), or batch Stages 1–6 schema changes into one big migration + one big policy migration (2 migrations, faster, higher blast radius)?

Once you answer, I'll execute **Stage 0 + Stage 1** in the next round.
