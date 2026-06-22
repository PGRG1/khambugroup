/**
 * Tenant-scoped query helpers.
 *
 * Multi-tenant rule: every read/write against a `public` table that carries a
 * `tenant_id` column MUST go through one of these helpers (or attach an explicit
 * `.eq("tenant_id", tenantId)` filter). RLS only sandboxes regular tenant
 * members; `super_admin` / `platform_admin` see every tenant, so without an
 * explicit filter their UI silently merges all clients.
 */
import { supabase } from "@/integrations/supabase/client";

/** Build a SELECT scoped to a tenant. Callers chain further filters/order. */
export function tenantSelect(table: string, tenantId: string, select: string = "*") {
  return (supabase.from(table as any) as any).select(select).eq("tenant_id", tenantId);
}

/** Insert one or many rows, injecting tenant_id on every row. */
export function tenantInsert<T extends Record<string, any>>(
  table: string,
  tenantId: string,
  payload: T | T[],
) {
  const withTenant = Array.isArray(payload)
    ? payload.map((p) => ({ ...p, tenant_id: tenantId }))
    : { ...payload, tenant_id: tenantId };
  return (supabase.from(table as any) as any).insert(withTenant);
}

/** Upsert with tenant_id injected on every row. */
export function tenantUpsert<T extends Record<string, any>>(
  table: string,
  tenantId: string,
  payload: T | T[],
  options?: { onConflict?: string; ignoreDuplicates?: boolean },
) {
  const withTenant = Array.isArray(payload)
    ? payload.map((p) => ({ ...p, tenant_id: tenantId }))
    : { ...payload, tenant_id: tenantId };
  return (supabase.from(table as any) as any).upsert(withTenant, options);
}

/** Update guarded by tenant_id so cross-tenant writes are impossible. */
export function tenantUpdate<T extends Record<string, any>>(
  table: string,
  tenantId: string,
  patch: T,
) {
  return (supabase.from(table as any) as any).update(patch).eq("tenant_id", tenantId);
}

/** Delete guarded by tenant_id. */
export function tenantDelete(table: string, tenantId: string) {
  return (supabase.from(table as any) as any).delete().eq("tenant_id", tenantId);
}

/**
 * Fetch all rows for a tenant, bypassing the 1000-row Data API cap.
 * Optional `extend` lets callers add filters / ordering before pagination.
 */
export async function fetchAllRowsForTenant(
  table: string,
  tenantId: string,
  select: string = "*",
  extend?: (q: any) => any,
  order?: { col: string; asc: boolean },
): Promise<any[]> {
  const PAGE = 1000;
  let all: any[] = [];
  let offset = 0;
  while (true) {
    let q = (supabase.from(table as any) as any)
      .select(select)
      .eq("tenant_id", tenantId)
      .range(offset, offset + PAGE - 1);
    if (extend) q = extend(q);
    if (order) q = q.order(order.col, { ascending: order.asc });
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}
