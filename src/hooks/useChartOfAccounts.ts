import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "cogs" | "opex" | "other_income" | "other_expense";
export type NormalSide = "debit" | "credit";

export interface ChartAccount {
  id: string;
  code: string;
  name: string;
  account_type: AccountType;
  normal_side: NormalSide;
  parent_id: string | null;
  is_active: boolean;
  is_cash: boolean;
  description: string;
  sort_order: number;
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

export function defaultNormalSide(t: AccountType): NormalSide {
  return ["asset", "cogs", "opex", "other_expense"].includes(t) ? "debit" : "credit";
}

export function useChartOfAccounts() {
  const [items, setItems] = useState<ChartAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("chart_of_accounts" as any)
      .select("*")
      .order("code", { ascending: true });
    if (error) toast.error(`Failed to load chart of accounts: ${error.message}`);
    else setItems((data as unknown as ChartAccount[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const createAccount = useCallback(async (input: Partial<ChartAccount>) => {
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
      description: input.description ?? "",
      sort_order: input.sort_order ?? 0,
    };
    const { data, error } = await supabase.from("chart_of_accounts" as any).insert(payload as any).select().single();
    if (error) {
      if ((error as any).code === "23505") toast.error(`Code "${payload.code}" already exists`);
      else toast.error(`Failed: ${error.message}`);
      return null;
    }
    await fetchAll();
    return data as unknown as ChartAccount;
  }, [fetchAll]);

  const updateAccount = useCallback(async (id: string, updates: Partial<ChartAccount>) => {
    const { error } = await supabase.from("chart_of_accounts" as any).update(updates as any).eq("id", id);
    if (error) { toast.error(`Update failed: ${error.message}`); return; }
    await fetchAll();
  }, [fetchAll]);

  const deleteAccount = useCallback(async (id: string) => {
    const { error } = await supabase.from("chart_of_accounts" as any).delete().eq("id", id);
    if (error) { toast.error(`Cannot delete: ${error.message}`); return; }
    await fetchAll();
  }, [fetchAll]);

  return { items, loading, fetchAll, createAccount, updateAccount, deleteAccount };
}
