import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { toast } from "sonner";

export interface RecurringRule {
  id: string;
  name: string;
  supplier_id: string | null;
  vendor_name: string | null;
  category_id: string | null;
  account_id: string | null;
  venue_id: string | null;
  department: string | null;
  expected_amount: number;
  currency: string;
  cadence: string;
  day_of_month: number | null;
  next_due_date: string | null;
  last_generated_at: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useRecurringExpenses() {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchAllRows("expense_recurring_rules", "*", {
        col: "next_due_date",
        asc: true,
      });
      setRules(rows as RecurringRule[]);
    } catch (e: any) {
      toast.error("Failed to load recurring rules: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    async (r: Partial<RecurringRule>) => {
      const payload: any = {
        name: r.name,
        supplier_id: r.supplier_id || null,
        vendor_name: r.vendor_name || null,
        category_id: r.category_id || null,
        account_id: r.account_id || null,
        venue_id: r.venue_id || null,
        department: r.department || null,
        expected_amount: Number(r.expected_amount || 0),
        currency: r.currency || "HKD",
        cadence: r.cadence || "monthly",
        day_of_month: r.day_of_month ?? null,
        next_due_date: r.next_due_date || null,
        active: r.active ?? true,
        notes: r.notes || null,
      };
      try {
        if (r.id) {
          const { error } = await supabase
            .from("expense_recurring_rules")
            .update(payload)
            .eq("id", r.id);
          if (error) throw error;
        } else {
          const auth = (await supabase.auth.getUser()).data.user?.id ?? null;
          payload.created_by = auth;
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
    [refresh]
  );

  const remove = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("expense_recurring_rules")
        .delete()
        .eq("id", id);
      if (error) {
        toast.error("Delete failed: " + error.message);
        return false;
      }
      await refresh();
      return true;
    },
    [refresh]
  );

  const toggleActive = useCallback(
    async (id: string, active: boolean) => {
      const { error } = await supabase
        .from("expense_recurring_rules")
        .update({ active })
        .eq("id", id);
      if (error) {
        toast.error("Toggle failed: " + error.message);
        return false;
      }
      await refresh();
      return true;
    },
    [refresh]
  );

  return { rules, loading, refresh, save, remove, toggleActive };
}
