import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { toast } from "sonner";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export type RecurringRuleStatus = "draft" | "active" | "paused" | "ended";

export interface RecurringRule {
  id: string;
  name: string;
  supplier_id: string | null;
  vendor_name: string | null;
  category_id: string | null;
  account_id: string | null;
  credit_account_id: string | null;
  venue_id: string | null;
  department: string | null;
  expected_amount: number;
  currency: string;
  cadence: string;
  day_of_month: number | null;
  recognition_day: string | null;
  combined_venues: boolean;
  effective_from: string | null;
  next_generation_date: string | null;
  next_due_date: string | null;
  payment_due_day: number | null;
  last_generated_at: string | null;
  active: boolean;
  status: RecurringRuleStatus;
  auto_approve: boolean;
  notes: string | null;
  document_source: string | null;
  document_notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useRecurringExpenses() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tenantId) { setRules([]); setLoading(false); return; }
    setLoading(true);
    try {
      const rows = await fetchAllRows("expense_recurring_rules", "*", {
        col: "next_generation_date",
        asc: true,
      }, tenantId);
      setRules(rows as RecurringRule[]);
    } catch (e: any) {
      toast.error("Failed to load recurring rules: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!tenantLoading) refresh();
  }, [refresh, tenantLoading]);

  const save = useCallback(
    async (r: Partial<RecurringRule>) => {
      if (!tenantId) return false;
      const status: RecurringRuleStatus = (r.status as RecurringRuleStatus) || "draft";
      const payload: any = {
        name: r.name,
        supplier_id: r.supplier_id || null,
        vendor_name: r.vendor_name || null,
        category_id: r.category_id || null,
        account_id: r.account_id || null,
        credit_account_id: r.credit_account_id || null,
        venue_id: r.combined_venues ? null : (r.venue_id || null),
        department: r.department || null,
        expected_amount: Number(r.expected_amount || 0),
        currency: r.currency || "HKD",
        cadence: r.cadence || "monthly",
        day_of_month: r.day_of_month ?? null,
        recognition_day: r.recognition_day ?? null,
        combined_venues: r.combined_venues ?? false,
        effective_from: r.effective_from || null,
        payment_due_day: r.payment_due_day ?? null,
        status,
        active: status === "active",
        auto_approve: r.auto_approve ?? false,
        notes: r.notes || null,
        document_source: r.document_source || null,
        document_notes: r.document_notes || null,
      };
      try {
        if (r.id) {
          const { error } = await supabase
            .from("expense_recurring_rules")
            .update(payload)
            .eq("id", r.id)
            .eq("tenant_id", tenantId);
          if (error) throw error;
        } else {
          const auth = (await supabase.auth.getUser()).data.user?.id ?? null;
          payload.created_by = auth;
          payload.tenant_id = tenantId;
          const { error } = await supabase
            .from("expense_recurring_rules")
            .insert(payload);
          if (error) throw error;
        }
        toast.success("Rule saved");
        await refresh();
        return true;
      } catch (e: any) {
        toast.error("Save failed: " + e.message);
        return false;
      }
    },
    [refresh, tenantId]
  );

  const remove = useCallback(
    async (id: string) => {
      if (!tenantId) return false;
      const { error } = await supabase
        .from("expense_recurring_rules")
        .delete()
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) {
        toast.error("Delete failed: " + error.message);
        return false;
      }
      await refresh();
      return true;
    },
    [refresh, tenantId]
  );

  const setStatus = useCallback(
    async (id: string, status: RecurringRuleStatus) => {
      if (!tenantId) return false;
      const { error } = await supabase
        .from("expense_recurring_rules")
        .update({ status, active: status === "active" })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) {
        toast.error("Status update failed: " + error.message);
        return false;
      }
      await refresh();
      return true;
    },
    [refresh, tenantId]
  );

  const generateNow = useCallback(async () => {
    if (!tenantId) return null;
    const { data, error } = await supabase.rpc("generate_recurring_expense_bills" as any);
    if (error) {
      toast.error("Generation failed: " + error.message);
      return null;
    }
    const result: any = data;
    const created = result?.created ?? 0;
    const skipped = result?.skipped_duplicate ?? 0;

    const { data: autoBills } = await supabase
      .from("expense_bills")
      .select("id, recurring_rule_id")
      .eq("tenant_id", tenantId)
      .eq("approval_status", "pending_review")
      .eq("source_type", "recurring_rule")
      .not("recurring_rule_id", "is", null);
    const autoRuleIds = new Set(
      (await supabase.from("expense_recurring_rules").select("id").eq("tenant_id", tenantId).eq("auto_approve", true)).data?.map((r: any) => r.id) || []
    );
    let autoPosted = 0;
    for (const b of autoBills || []) {
      if (b.recurring_rule_id && autoRuleIds.has(b.recurring_rule_id)) {
        await supabase.from("expense_bills").update({
          approval_status: "approved",
          approved_at: new Date().toISOString(),
        }).eq("id", b.id).eq("tenant_id", tenantId);
        const { error: postErr } = await supabase.rpc("post_expense_bill" as any, { p_bill_id: b.id });
        if (!postErr) autoPosted++;
      }
    }

    toast.success(
      `Generated ${created} bill(s)${skipped ? ` · ${skipped} skipped` : ""}${autoPosted ? ` · ${autoPosted} auto-posted` : ""}`
    );
    await refresh();
    return result;
  }, [refresh, tenantId]);


  return { rules, loading, refresh, save, remove, setStatus, generateNow };
}
