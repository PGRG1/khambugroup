import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches all rows from a Supabase table, bypassing the default 1000-row limit
 * by paginating in batches.
 */
export async function fetchAllRows(
  table: string,
  select: string,
  order?: { col: string; asc: boolean }
): Promise<any[]> {
  const PAGE = 1000;
  let all: any[] = [];
  let offset = 0;
  while (true) {
    let q = supabase.from(table).select(select).range(offset, offset + PAGE - 1);
    if (order) q = q.order(order.col, { ascending: order.asc });
    const { data } = await q;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}
