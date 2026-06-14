import { supabase } from "@/integrations/supabase/client";

export const COST_KPI_TYPES = [
  "monthly_food_cost",
  "monthly_beverage_cost",
  "monthly_supplies_cost",
] as const;
export type CostKpiType = (typeof COST_KPI_TYPES)[number];

export function isCostKpiType(t: string): t is CostKpiType {
  return (COST_KPI_TYPES as readonly string[]).includes(t);
}

/** Map a cost KPI type to the product_master.level1_category it sums. */
export function costCategoryFor(t: CostKpiType): string {
  switch (t) {
    case "monthly_food_cost": return "Food";
    case "monthly_beverage_cost": return "Beverages";
    case "monthly_supplies_cost": return "Supplies";
  }
}

/** First-of-month and end-of-month dates for a given Date. */
export function monthRange(d: Date = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  const toStr = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { start: toStr(start), end: toStr(end), daysInMonth: end.getDate(), dayOfMonth: d.getDate() };
}

const EXCLUDE_STATUSES = new Set(["voided", "draft", "rejected"]);

/**
 * Sum HK$ spend from invoice_line_items where the linked product's level1_category
 * matches `category`, scoped to venue and invoice month (today inclusive).
 */
export async function computeMonthlyCostActual(
  category: string,
  venueName: string | null,
  fromDate: string,
  toDate: string,
): Promise<number> {
  const PAGE = 1000;
  let offset = 0;
  let total = 0;
  while (true) {
    let q = supabase
      .from("invoices")
      .select(
        "id, invoice_date, venue, status, invoice_line_items(total, product_master:product_master_id(level1_category))",
      )
      .gte("invoice_date", fromDate)
      .lte("invoice_date", toDate)
      .range(offset, offset + PAGE - 1);
    if (venueName) q = q.eq("venue", venueName);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as any[];
    for (const inv of rows) {
      if (EXCLUDE_STATUSES.has(inv.status)) continue;
      for (const li of inv.invoice_line_items ?? []) {
        const cat = li?.product_master?.level1_category;
        if (cat === category) total += Number(li.total ?? 0);
      }
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return total;
}

/** Sum revenue (subtotal + service_charge) for a venue over a date range. */
export async function computeMonthlyRevenue(
  venueName: string | null,
  fromDate: string,
  toDate: string,
): Promise<number> {
  let q = supabase
    .from("sales_records")
    .select("subtotal,service_charge,venue,date")
    .gte("date", fromDate)
    .lte("date", toDate);
  if (venueName) q = q.eq("venue", venueName);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).reduce(
    (s, r: any) => s + Number(r.subtotal ?? 0) + Number(r.service_charge ?? 0),
    0,
  );
}
