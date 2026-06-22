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
): Promise<any[]> {
  const PAGE = 1000;
  let all: any[] = [];
  let offset = 0;
  while (true) {
    let q: any = (supabase.from(table as any) as any).select(select).range(offset, offset + PAGE - 1);
    if (tenantId) q = q.eq("tenant_id", tenantId);
    if (order) q = q.order(order.col, { ascending: order.asc });
    const { data } = await q;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}
