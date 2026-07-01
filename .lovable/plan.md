## Plan — Tenant-scope the Payments tables

### 1. Single idempotent migration (via `supabase--migration`)

**Schema**
- `ALTER TABLE payment_processors ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;`
- Same for `payment_settlement_imports` and `payment_settlement_batches`.
- `ALTER TABLE payment_processors DROP CONSTRAINT IF EXISTS payment_processors_name_key;` then add `UNIQUE (tenant_id, name)` (drop-if-exists first for idempotency).

**Drop existing policies** with `DROP POLICY IF EXISTS` — exact names:
- `payment_processors`: `"Authenticated can read payment_processors"`, `"Authorized can manage payment_processors"`
- `payment_processor_merchants`: `"Authenticated can read payment_processor_merchants"`, `"Authorized can manage payment_processor_merchants"`, `"tenant_select on payment_processor_merchants"`, `"tenant_write on payment_processor_merchants"`
- `payment_settlement_imports`: `"Authenticated can read payment_settlement_imports"`, `"Authorized can manage payment_settlement_imports"`
- `payment_settlement_batches`: `"Authenticated can read payment_settlement_batches"`, `"Authorized can manage payment_settlement_batches"`
- `payment_settlement_lines`: `"Authenticated can read payment_settlement_lines"`, `"Authorized can manage payment_settlement_lines"`
- `payment_settlement_transactions`: `"Authenticated can read payment_settlement_transactions"`, `"Authorized can manage payment_settlement_transactions"`
- `payment_processor_fee_rates`: `"fee_rates_select_authenticated"`, `"fee_rates_admin_all"`

**Create new tenant-scoped policies** using `is_super_admin(auth.uid())` / `user_has_tenant(auth.uid(), tenant_id)`:

| Table | Scope |
|---|---|
| `payment_processors` | direct `tenant_id` |
| `payment_settlement_imports` | direct `tenant_id` |
| `payment_settlement_batches` | direct `tenant_id` |
| `payment_processor_merchants` | via `payment_processors.tenant_id` on `processor_id` |
| `payment_settlement_lines` | via `payment_settlement_batches.tenant_id` on `batch_id` |
| `payment_settlement_transactions` | via `payment_settlement_batches.tenant_id` on `batch_id` |
| `payment_processor_fee_rates` | via `payment_processors.tenant_id` on `processor_id` |

Each table gets a `SELECT` policy and an `ALL` policy (with matching `WITH CHECK`).

**Grants** on all 7 tables:
```
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<t> TO authenticated;
GRANT ALL ON public.<t> TO service_role;
```

**Backfill (end of migration)** — keep KHAMBU's existing data visible:
```sql
WITH t AS (SELECT id FROM public.tenants ORDER BY created_at LIMIT 1)
UPDATE public.payment_processors SET tenant_id = (SELECT id FROM t) WHERE tenant_id IS NULL;
-- same UPDATE for payment_settlement_imports and payment_settlement_batches
```
Runs after policies so existing rows immediately fall under the new tenant scope.

### 2. `src/hooks/usePaymentSettlements.ts`
- `import { useActiveTenant } from "@/hooks/useActiveTenant";`
- `const { tenantId } = useActiveTenant();`
- In `load`: early return `if (!tenantId) { setLoading(false); return; }`
- Pass `tenantId` as 4th arg to `fetchAllRows` for **only** `payment_processors`, `payment_settlement_imports`, `payment_settlement_batches`. Other 4 stay unchanged (parent-FK RLS).
- Add `tenantId` to `useCallback` deps.
- Return `tenantId` from the hook.

### 3. Verification
Read queries to confirm: `tenant_id` present + unique `(tenant_id, name)` on `payment_processors`; only new policies on all 7 tables; backfilled row counts non-zero.

### Files touched
- New migration.
- `src/hooks/usePaymentSettlements.ts` (edit).
