# Multi-Tenancy Migration — Prompt 1: Core Financial Tables

Single idempotent migration adding `tenant_id` + tenant-scoped RLS to 6 tables, matching the `bank_transactions` pattern.

## Tables covered

1. `invoices`
2. `invoice_line_items`
3. `invoice_payments`
4. `sales_records`
5. `expense_bills`
6. `journal_lines`

## Per-table steps (applied to each)

1. `ALTER TABLE ... ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE`
2. `UPDATE ... SET tenant_id = '00000000-0000-0000-0000-00000000beef' WHERE tenant_id IS NULL` (KHAMBU backfill)
3. `CREATE INDEX IF NOT EXISTS <table>_tenant_id_idx ON public.<table>(tenant_id)` for query performance
4. `DROP POLICY IF EXISTS ...` for every legacy open policy listed below
5. `CREATE POLICY "<table>_tenant_select" FOR SELECT USING (is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id))`
6. `CREATE POLICY "<table>_tenant_all" FOR ALL USING (same + admin/manager) WITH CHECK (same)`
7. `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<table> TO authenticated; GRANT ALL ON public.<table> TO service_role`

## Policies dropped per table

- **invoices**: "Authenticated can read invoices", "Authorized can insert invoices", "Authorized can update invoices", "Admins can delete invoices"
- **invoice_line_items**: "Authenticated can read line items", "Authorized can insert line items", "Authorized can update line items", "Admins can delete line items"
- **invoice_payments**: "Authenticated can read invoice_payments"
- **sales_records**: "Allow public read", "Allow public insert", "Allow public update", "Allow public delete"
- **expense_bills**: "Authenticated read expense_bills", "Authenticated insert expense_bills", "Authenticated update expense_bills", "Admin delete expense_bills", "tenant_venue_select"
- **journal_lines**: "Authenticated can read journal_lines", "Authorized can manage journal_lines", "tenant_venue_select", "tenant_venue_write"

Any additional legacy policies discovered on these tables that use `USING (true)` or equivalent open predicates will also be dropped in the same migration so no open path remains.

## Verification (post-migration read-only checks)

- Each of the 6 tables has a `tenant_id` column
- No legacy open policies remain on the 6 tables
- New `_tenant_select` and `_tenant_all` policies exist on each
- Row counts where `tenant_id = KHAMBU UUID` are non-zero (backfill succeeded)

## Out of scope for this prompt

- No application/code changes (inserts will begin failing RLS if callers don't set `tenant_id`; addressed in a later prompt).
- Remaining tables (bank_*, expense_* siblings, petty_cash_*, payments_*, procurement master data, HR, etc.) come in Prompts 2–4.

Approve to run the migration.
