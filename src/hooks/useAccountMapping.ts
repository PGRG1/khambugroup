import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export interface AccountMappingRule {
  id: string;
  rule_type: string;
  match_key: string;
  account_id: string;
  notes: string;
}

export const RULE_TYPES: { value: string; label: string; needsKey: boolean }[] = [
  { value: "sales_revenue", label: "Sales Revenue (per venue)", needsKey: true },
  { value: "service_charge", label: "Service Charge (per venue)", needsKey: true },
  { value: "sales_cash", label: "Sales — Cash account", needsKey: false },
  { value: "sales_payment_method", label: "Sales Payment Method (per method)", needsKey: true },
  { value: "sales_discount", label: "Sales Discount (per venue)", needsKey: true },
  { value: "tips_payable", label: "Tips Payable (per venue)", needsKey: true },
  { value: "payment_method_cash", label: "Invoice/Payroll Payment Method → Cash account", needsKey: true },
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
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [items, setItems] = useState<AccountMappingRule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!tenantId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from("account_mapping_rules" as any).select("*").eq("tenant_id", tenantId).order("rule_type").order("match_key");
    if (error) toast.error(error.message);
    else setItems((data as unknown as AccountMappingRule[]) ?? []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { if (!tenantLoading) fetchAll(); }, [fetchAll, tenantLoading]);

  const upsert = useCallback(async (input: { rule_type: string; match_key: string; account_id: string; notes?: string }) => {
    if (!tenantId) return;
    const { error } = await supabase.from("account_mapping_rules" as any).upsert({
      rule_type: input.rule_type,
      match_key: input.match_key ?? "",
      account_id: input.account_id,
      notes: input.notes ?? "",
      tenant_id: tenantId,
    } as any, { onConflict: "rule_type,match_key" } as any);
    if (error) { toast.error(error.message); return; }
    await fetchAll();
  }, [fetchAll, tenantId]);

  const remove = useCallback(async (id: string) => {
    if (!tenantId) return;
    const { error } = await supabase.from("account_mapping_rules" as any).delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast.error(error.message); return; }
    await fetchAll();
  }, [fetchAll, tenantId]);

  return { items, loading, fetchAll, upsert, remove };
}
