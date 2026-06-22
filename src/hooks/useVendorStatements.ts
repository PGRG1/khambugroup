import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { toast } from "sonner";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export interface VendorStatement {
  id: string;
  supplier_id: string | null;
  vendor_name: string | null;
  statement_number: string | null;
  statement_date: string;
  period_start: string | null;
  period_end: string | null;
  opening_balance: number;
  current_period_charges: number;
  payments_credits: number;
  late_fees: number;
  closing_balance: number;
  currency: string;
  venue_id: string | null;
  department: string | null;
  status: string;
  approval_status: string;
  payment_status: string;
  notes: string | null;
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
}

export function useVendorStatements() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [statements, setStatements] = useState<VendorStatement[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tenantId) { setStatements([]); setLoading(false); return; }
    setLoading(true);
    try {
      const rows = await fetchAllRows("expense_vendor_statements", "*", {
        col: "statement_date",
        asc: false,
      }, tenantId);
      setStatements(rows as VendorStatement[]);
    } catch (e: any) {
      toast.error("Failed to load statements: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!tenantLoading) refresh();
  }, [refresh, tenantLoading]);

  const save = useCallback(
    async (s: Partial<VendorStatement>) => {
      if (!tenantId) return false;
      const payload: any = {
        supplier_id: s.supplier_id || null,
        vendor_name: s.vendor_name || null,
        statement_number: s.statement_number || null,
        statement_date: s.statement_date,
        period_start: s.period_start || null,
        period_end: s.period_end || null,
        opening_balance: Number(s.opening_balance || 0),
        current_period_charges: Number(s.current_period_charges || 0),
        payments_credits: Number(s.payments_credits || 0),
        late_fees: Number(s.late_fees || 0),
        closing_balance: Number(s.closing_balance || 0),
        currency: s.currency || "HKD",
        venue_id: s.venue_id || null,
        department: s.department || null,
        notes: s.notes || null,
        status: s.status || "draft",
        approval_status: s.approval_status || "draft",
      };
      try {
        if (s.id) {
          const { error } = await supabase
            .from("expense_vendor_statements")
            .update(payload)
            .eq("id", s.id)
            .eq("tenant_id", tenantId);
          if (error) throw error;
        } else {
          const auth = (await supabase.auth.getUser()).data.user?.id ?? null;
          payload.uploaded_by = auth;
          payload.tenant_id = tenantId;
          const { error } = await supabase
            .from("expense_vendor_statements")
            .insert(payload);
          if (error) throw error;
        }
        toast.success("Statement saved");
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
        .from("expense_vendor_statements")
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

  return { statements, loading, refresh, save, remove };
}
