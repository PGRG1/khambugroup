# Multi-Tenancy Migration — Prompt 2: Procurement & HR

Single idempotent migration. Same pattern as Prompt 1.

## Tables (7 unique)

1. `purchase_orders`
2. `purchase_order_items`
3. `hr_departments`
4. `hr_leave_types`
5. `hr_leave_requests`
6. `hr_leave_balances`
7. `hr_payroll`

(Note: `hr_leave_types` was listed twice in the prompt — handled once.)

## Per-table steps

1. `ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE`
2. Backfill NULLs to KHAMBU `00000000-0000-0000-0000-00000000beef`
3. `CREATE INDEX IF NOT EXISTS <t>_tenant_id_idx`
4. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
5. `DROP POLICY IF EXISTS` for every legacy policy listed
6. Create `<t>_tenant_select` (SELECT) — `is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id)`
7. Create `<t>_tenant_all` (ALL) — same + `has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager')`, both USING and WITH CHECK
8. `GRANT SELECT, INSERT, UPDATE, DELETE ON <t> TO authenticated; GRANT ALL ... TO service_role`

## Legacy policies dropped

- **purchase_orders / purchase_order_items**: none (per prompt); also DROP IF EXISTS any residual `tenant_*` / `tenant_venue_*` policies as a safety net
- **hr_departments**: "Authenticated can read departments", "Admins/managers can manage departments"
- **hr_leave_types**: "Authenticated can read leave types", "Admins/managers can manage leave types"
- **hr_leave_requests**: "Authenticated can read leave requests", "Admins/managers can manage leave requests", "Admins/managers can read leave requests"
- **hr_leave_balances**: "Authenticated can read leave balances", "Admins/managers can manage leave balances", "Admins/managers can read leave balances"
- **hr_payroll**: "Authenticated can read payroll", "Admins/managers can manage payroll", "Admins/managers can read payroll", "Admin/manager read batches", "Admin write batches"

Any residual `tenant_venue_*` / `tenant_select` / `tenant_write` policies discovered on these tables will also be dropped to prevent OR-widening of the new admin/manager write restriction.

## Verification

Post-migration read-only checks confirming:

- Each of 7 tables has `tenant_id`
- Only `<t>_tenant_select` and `<t>_tenant_all` policies remain
- Row counts backfilled where tables have data (empty tables report 0, expected)

## Out of scope

- No code changes. Inserts from client code must set `tenant_id` — will be addressed later.
- Remaining tables come in Prompts 3–4.

Approve to run.