## Prompt 4 — KPIs, Transfers & Remaining Tables

Single idempotent migration covering 8 tables. Same pattern as Prompts 1–3.

### Tables
1. `kpi_cards`
2. `kpi_actuals`
3. `kpi_targets`
4. `transfers`
5. `transfer_items`
6. `bank_reconciliation_periods`
7. `revenue_targets`
8. `forecasts`

### Per-table steps
1. `ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE`
2. Backfill NULLs to `00000000-0000-0000-0000-00000000beef`
3. Add index on `tenant_id`
4. `ENABLE ROW LEVEL SECURITY`
5. Drop ALL existing policies on the table (idempotent sweep — covers listed legacy names plus any residual open policies)
6. Create canonical policies:
   - `<table>_tenant_select` — SELECT: `is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id)`
   - `<table>_tenant_all` — ALL: same + `(has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))`
7. `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated; GRANT ALL ... TO service_role`

### Legacy policies (per user's list, all cleared by the sweep)
- **kpi_cards**: "Admins manage kpi_cards", "Users read active kpi_cards they own"
- **kpi_actuals**: "Admins manage kpi_actuals", "Users read/insert/update kpi_actuals for owned cards"
- **kpi_targets**: "Admins manage kpi_targets", "Users read kpi_targets for owned cards"
- **transfers**, **transfer_items**, **revenue_targets**, **forecasts**: none listed
- **bank_reconciliation_periods**: "Authenticated can read bank_recon_periods", "Authorized can manage bank_recon_periods"

### Verification
- Per table: `tenant_id` present, row/NULL counts, exactly 2 canonical policies remain
- **Final global check**: count remaining `USING (true)` policies across `pg_policies` in `public` schema and report the number (expected significantly lower than 106 baseline)

No application code changes — schema/RLS only.
