## Prompt 3 — Inventory & Menu Tenant Migration

Single idempotent migration covering 7 tables. Same pattern as Prompts 1 & 2.

### Tables
1. `stock_count_sessions`
2. `stock_count_items`
3. `inventory_periods`
4. `inventory_items`
5. `inventory_counts`
6. `menu_items`
7. `menu_item_ingredients`

### Per-table steps
1. `ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE`
2. Backfill: `UPDATE ... SET tenant_id = '00000000-0000-0000-0000-00000000beef' WHERE tenant_id IS NULL`
3. Add index on `tenant_id`
4. `DROP POLICY IF EXISTS` on the legacy policies listed per table (plus residual `tenant_select`/`tenant_write`/`tenant_venue_*` variants)
5. `ENABLE ROW LEVEL SECURITY`
6. Create canonical `<table>_tenant_select` and `<table>_tenant_all` policies:
   - SELECT: `is_super_admin(auth.uid()) OR user_has_tenant(auth.uid(), tenant_id)`
   - ALL: same + `(has_role(auth.uid(),'admin') OR has_role(auth.uid(),'manager'))`
7. `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated; GRANT ALL ... TO service_role`

### Legacy policies to drop per table
- **stock_count_sessions**: `"stock_count_sessions select"`, `"stock_count_sessions write"`
- **stock_count_items**: `"stock_count_items select"`, `"stock_count_items write"`
- **inventory_periods**: `"Authenticated can read periods"`, `"Authorized can manage periods"`
- **inventory_items**: `"Authenticated can read inventory items"`, `"Authorized can manage inventory items"`
- **inventory_counts**: `"Authenticated can read counts"`, `"Authorized can manage counts"`
- **menu_items**: none known — drop any residual open policies discovered
- **menu_item_ingredients**: none known — drop any residual open policies discovered

Plus a defensive sweep on all 7 tables for residual `tenant_select` / `tenant_write` / `tenant_venue_*` policies (as done in Prompts 1 & 2).

### Verification (post-migration)
For each of the 7 tables confirm:
- `tenant_id` column exists (non-null after backfill)
- Row count and NULL count reported
- Exactly the two canonical tenant-scoped policies remain
- Legacy policies dropped

No application code changes in this prompt — schema/RLS only.
