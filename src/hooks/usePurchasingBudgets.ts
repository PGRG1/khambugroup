import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { purchasingSalesForecast, type BudgetRow, type BudgetChangeRow, type BudgetForecastSale, type BudgetForecastOverride } from "@/utils/purchasingOverview";

export interface PurchasingBudgets {
  budgets: BudgetRow[];
  changes: BudgetChangeRow[];
  names: Map<string, string>;
}

/**
 * Purchasing budgets and their append-only change log for the active tenant.
 * Central buying keeps one budget with venue_id null; per-venue buying keeps
 * one row per venue. Saving writes a change row for every category moved.
 */
export function usePurchasingBudgets() {
  const { tenantId } = useActiveTenant();
  const queryClient = useQueryClient();

  const query = useQuery<PurchasingBudgets>({
    queryKey: ["purchasing-budgets", tenantId],
    enabled: !!tenantId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!tenantId) throw new Error("No tenant");
      const [budgets, changes, profiles] = await Promise.all([
        readBudgetRows("purchasing_budgets", tenantId),
        readBudgetRows("purchasing_budget_changes", tenantId),
        supabase.from("profiles").select("user_id, display_name"),
      ]);
      return {
        budgets: budgets as BudgetRow[],
        changes: changes as BudgetChangeRow[],
        names: new Map((profiles.data ?? []).map(row => [row.user_id, row.display_name ?? "Someone"])),
      };
    },
  });

  /** Upsert changed categories for one venue/group + month and log each change. */
  const save = async (input: { venueId: string | null; month: string; reason: string; amounts: Map<string, number> }) => {
    if (!tenantId) throw new Error("No tenant");
    const monthDate = `${input.month}-01`;
    const { error } = await supabase.rpc("save_purchasing_budgets", { p_tenant_id: tenantId, p_venue_id: input.venueId, p_month: monthDate, p_amounts: Object.fromEntries(input.amounts), p_note: input.reason || null });
    if (error) throw error;
    await queryClient.invalidateQueries({ queryKey: ["purchasing-budgets", tenantId] });
  };

  return { ...query, budgets: query.data?.budgets ?? [], changes: query.data?.changes ?? [], names: query.data?.names ?? new Map<string, string>(), save };
}

async function readBudgetRows(table: "purchasing_budgets" | "purchasing_budget_changes", tenantId: string) {
  const rows: (BudgetRow | BudgetChangeRow)[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await supabase.from(table).select("*").eq("tenant_id", tenantId).order(table === "purchasing_budgets" ? "id" : "changed_at", { ascending: table === "purchasing_budgets" }).range(offset, offset + 999);
    if (result.error) throw result.error;
    rows.push(...result.data);
    if (result.data.length < 1000) return rows;
  }
}

/** Dialog-owned month selection: no page target or clamped overview total. */
export function usePurchasingSalesForecast(month: string, venueIds: string[], enabled: boolean) {
  const { tenantId } = useActiveTenant();
  const ids = [...venueIds].sort();
  return useQuery({
    queryKey: ["purchasing-sales-forecast", tenantId, month, ids.join(",")],
    enabled: enabled && !!tenantId && ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      if (!tenantId) throw new Error("No tenant");
      const sales: BudgetForecastSale[] = [];
      const projections: BudgetForecastOverride[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("sales_records").select("venue_id,date,total_sales").eq("tenant_id", tenantId).in("venue_id", ids).order("date").order("id").range(offset, offset + 999);
        if (error) throw error;
        sales.push(...data);
        if (data.length < 1000) break;
      }
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("revenue_daily_projections").select("venue_id,target_date,projected_sales").eq("tenant_id", tenantId).in("venue_id", ids).gte("target_date", `${month}-01`).lt("target_date", `${month}-01`.replace(/^(\d{4})-(\d{2})/, (_, y, m) => Number(m) === 12 ? `${Number(y) + 1}-01` : `${y}-${String(Number(m) + 1).padStart(2, "0")}`)).order("target_date").order("venue_id").range(offset, offset + 999);
        if (error) throw error;
        projections.push(...data);
        if (data.length < 1000) break;
      }
      return purchasingSalesForecast(month, ids, sales, projections);
    },
  });
}
