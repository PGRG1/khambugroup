import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches all rows from a Supabase table, bypassing the default 1000-row limit.
 * When `tenantId` is provided, every page is filtered by `tenant_id = tenantId`.
 * This is the canonical helper for tenant-scoped bulk reads.
 */
export async function fetchAllRows(
  table: string,
  select: string,
  order?: { col: string; asc: boolean },
  tenantId?: string | null,
  throwOnError = false,
): Promise<any[]> {
  const PAGE = 1000;
  let all: any[] = [];
  let offset = 0;
  while (true) {
    let q: any = (supabase.from(table as any) as any).select(select).range(offset, offset + PAGE - 1);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    if (order) q = q.order(order.col, { ascending: order.asc });
    const { data, error } = await q;
    if (error && throwOnError) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

/**
 * Same result as fetchAllRows, but counts first and downloads all 1000-row
 * pages at once instead of one after another. Pages are ordered by `id`
 * (or the given order) so they never overlap or skip rows.
 */
export async function fetchAllRowsParallel(
  table: string,
  select: string,
  tenantId?: string | null,
  order: { col: string; asc: boolean } = { col: "id", asc: true },
): Promise<any[]> {
  const PAGE = 1000;
  let head: any = (supabase.from(table as any) as any).select("id", { count: "exact", head: true });
  if (tenantId) head = head.eq("tenant_id", tenantId);
  const { count, error } = await head;
  if (error || count == null) return fetchAllRows(table, select, order, tenantId);
  const pages = Math.max(1, Math.ceil(count / PAGE));
  const results = await Promise.all(Array.from({ length: pages }, (_, i) => {
    let q: any = (supabase.from(table as any) as any).select(select);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    q = q.order(order.col, { ascending: order.asc });
    if (order.col !== "id") q = q.order("id", { ascending: true });
    return q.range(i * PAGE, i * PAGE + PAGE - 1);
  }));
  const failed = results.find((r: any) => r.error);
  if (failed) throw failed.error;
  const all = results.flatMap((r: any) => r.data ?? []);
  // Rows added between count and fetch: pick up the tail sequentially.
  if (results.at(-1)?.data?.length === PAGE) {
    let offset = pages * PAGE;
    while (true) {
      let q: any = (supabase.from(table as any) as any).select(select);
      if (tenantId) q = q.eq("tenant_id", tenantId);
      q = q.order(order.col, { ascending: order.asc });
      if (order.col !== "id") q = q.order("id", { ascending: true });
      const { data, error: e } = await q.range(offset, offset + PAGE - 1);
      if (e) throw e;
      if (!data?.length) break;
      all.push(...data);
      if (data.length < PAGE) break;
      offset += PAGE;
    }
  }
  return all;
}
