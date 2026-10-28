import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import type { BudgetRow, BudgetChangeRow } from "@/utils/purchasingOverview";

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
      const [budgets, changes, profiles] = await Promise.all([
        supabase.from("purchasing_budgets").select("*").eq("tenant_id", tenantId!),
        supabase.from("purchasing_budget_changes").select("*").eq("tenant_id", tenantId!).order("changed_at", { ascending: false }),
        supabase.from("profiles").select("user_id, display_name"),
      ]);
      if (budgets.error) throw budgets.error;
      if (changes.error) throw changes.error;
      return {
        budgets: (budgets.data ?? []) as BudgetRow[],
        changes: (changes.data ?? []) as BudgetChangeRow[],
        names: new Map((profiles.data ?? []).map(row => [row.user_id, row.display_name ?? "Someone"])),
      };
    },
  });

  /** Upsert changed categories for one venue/group + month and log each change. */
  const save = async (input: { venueId: string | null; month: string; reason: string; amounts: Map<string, number> }) => {
    if (!tenantId) throw new Error("No tenant");
    const monthDate = `${input.month}-01`;
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const existing = (query.data?.budgets ?? []).filter(row => row.venue_id === input.venueId && row.month.slice(0, 7) === input.month);
    for (const [category, amount] of input.amounts) {
      const current = existing.find(row => row.category === category);
      const oldAmount = current ? Number(current.amount) : null;
      if (oldAmount === amount) continue;
      if (current) {
        const { error } = await supabase.from("purchasing_budgets").update({ amount, updated_by: userId, updated_at: new Date().toISOString() }).eq("id", current.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("purchasing_budgets").insert({ tenant_id: tenantId, venue_id: input.venueId, month: monthDate, category, amount, updated_by: userId });
        if (error) throw error;
      }
      const { error } = await supabase.from("purchasing_budget_changes").insert({ tenant_id: tenantId, venue_id: input.venueId, month: monthDate, category, old_amount: oldAmount, new_amount: amount, reason: input.reason || null });
      if (error) throw error;
    }
    await queryClient.invalidateQueries({ queryKey: ["purchasing-budgets", tenantId] });
  };

  return { ...query, budgets: query.data?.budgets ?? [], changes: query.data?.changes ?? [], names: query.data?.names ?? new Map<string, string>(), save };
}
