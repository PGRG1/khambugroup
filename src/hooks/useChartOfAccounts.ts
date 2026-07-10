import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "cogs" | "opex" | "other_income" | "other_expense";
export type NormalSide = "debit" | "credit";
export type CashFlowCategory = "operating" | "investing" | "financing" | null;

export interface ChartAccount {
  id: string;
  code: string;
  name: string;
  account_type: AccountType;
  normal_side: NormalSide;
  parent_id: string | null;
  is_active: boolean;
  is_cash: boolean;
  description: string | null;
  sort_order: number;
  cash_flow_category: CashFlowCategory;
  created_at?: string;
  updated_at?: string;
}

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  revenue: "Revenue",
  cogs: "COGS",
  opex: "Operating Expense",
  other_income: "Other Income",
  other_expense: "Other Expense",
};

export const ACCOUNT_TYPE_GROUP: Record<AccountType, "Balance Sheet" | "P&L"> = {
  asset: "Balance Sheet",
  liability: "Balance Sheet",
  equity: "Balance Sheet",
  revenue: "P&L",
  cogs: "P&L",
  opex: "P&L",
  other_income: "P&L",
  other_expense: "P&L",
};

export const CASH_FLOW_CATEGORY_LABEL: Record<Exclude<CashFlowCategory, null>, string> = {
  operating: "Operating",
  investing: "Investing",
  financing: "Financing",
};

export function defaultNormalSide(t: AccountType): NormalSide {
  return ["asset", "cogs", "opex", "other_expense"].includes(t) ? "debit" : "credit";
}

export function useChartOfAccounts() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [items, setItems] = useState<ChartAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!tenantId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from("chart_of_accounts" as any)
      .select("*")
      .eq("tenant_id", tenantId)
      .order("code", { ascending: true });
    if (error) toast.error(`Failed to load chart of accounts: ${error.message}`);
    else setItems((data as unknown as ChartAccount[]) ?? []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { if (!tenantLoading) fetchAll(); }, [fetchAll, tenantLoading]);

  const createAccount = useCallback(async (input: Partial<ChartAccount>) => {
    if (!tenantId) return null;
    if (!input.code || !input.name || !input.account_type) {
      toast.error("Code, name, and type are required");
      return null;
    }
    const payload = {
      code: input.code.trim(),
      name: input.name.trim(),
      account_type: input.account_type,
      normal_side: input.normal_side ?? defaultNormalSide(input.account_type),
      parent_id: input.parent_id ?? null,
      is_active: input.is_active ?? true,
      is_cash: input.is_cash ?? false,
      description: input.description ?? null,
      sort_order: input.sort_order ?? 0,
      cash_flow_category: input.cash_flow_category ?? null,
      tenant_id: tenantId,
    };
    const { data, error } = await supabase.from("chart_of_accounts" as any).insert(payload as any).select().single();
    if (error) {
      if ((error as any).code === "23505") toast.error(`Code "${payload.code}" already exists`);
      else toast.error(`Failed: ${error.message}`);
      return null;
    }
    await fetchAll();
    return data as unknown as ChartAccount;
  }, [fetchAll, tenantId]);

  const updateAccount = useCallback(async (id: string, updates: Partial<ChartAccount>) => {
    if (!tenantId) return;
    const { error } = await supabase.from("chart_of_accounts" as any).update(updates as any).eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast.error(`Update failed: ${error.message}`); return; }
    await fetchAll();
  }, [fetchAll, tenantId]);

  const deleteAccount = useCallback(async (id: string) => {
    if (!tenantId) return;
    const { error } = await supabase.from("chart_of_accounts" as any).delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast.error(`Cannot delete: ${error.message}`); return; }
    await fetchAll();
  }, [fetchAll, tenantId]);

  /**
   * Count posted journal_lines referencing an account, tenant-scoped.
   * Used to block deletion of accounts with history.
   */
  const countJournalLines = useCallback(async (accountId: string): Promise<number> => {
    if (!tenantId) return 0;
    const { count, error } = await supabase
      .from("journal_lines" as any)
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("account_id", accountId);
    if (error) return 0;
    return count ?? 0;
  }, [tenantId]);

  return { items, loading, fetchAll, createAccount, updateAccount, deleteAccount, countJournalLines };
}
