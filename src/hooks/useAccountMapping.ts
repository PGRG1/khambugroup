import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AccountMappingRule {
  id: string;
  rule_type: string;
  match_key: string;
  account_id: string;
  notes: string;
}

export const RULE_TYPES: { value: string; label: string; needsKey: boolean }[] = [
  { value: "sales_revenue", label: "Sales Revenue (per venue)", needsKey: true },
  { value: "service_charge", label: "Service Charge", needsKey: false },
  { value: "sales_cash", label: "Sales — Cash account", needsKey: false },
  { value: "payment_method_cash", label: "Payment Method → Cash account", needsKey: true },
  { value: "invoice_expense", label: "Invoice Expense (by accounting category)", needsKey: true },
  { value: "accounts_payable", label: "Accounts Payable", needsKey: false },
  { value: "payroll_salary_expense", label: "Payroll — Salary Expense", needsKey: false },
  { value: "payroll_mpf_expense", label: "Payroll — MPF Expense", needsKey: false },
  { value: "salary_payable", label: "Salary Payable", needsKey: false },
  { value: "mpf_payable", label: "MPF Payable", needsKey: false },
  { value: "manual_income", label: "Manual P&L — Income default", needsKey: false },
  { value: "manual_expense", label: "Manual P&L — Expense default", needsKey: false },
  { value: "opening_equity", label: "Opening Balance Equity", needsKey: false },
];

export function useAccountMapping() {
  const [items, setItems] = useState<AccountMappingRule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("account_mapping_rules" as any).select("*").order("rule_type").order("match_key");
    if (error) toast.error(error.message);
    else setItems((data as unknown as AccountMappingRule[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const upsert = useCallback(async (input: { rule_type: string; match_key: string; account_id: string; notes?: string }) => {
    const { error } = await supabase.from("account_mapping_rules" as any).upsert({
      rule_type: input.rule_type,
      match_key: input.match_key ?? "",
      account_id: input.account_id,
      notes: input.notes ?? "",
    } as any, { onConflict: "rule_type,match_key" } as any);
    if (error) { toast.error(error.message); return; }
    await fetchAll();
  }, [fetchAll]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("account_mapping_rules" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await fetchAll();
  }, [fetchAll]);

  return { items, loading, fetchAll, upsert, remove };
}
