import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { toast } from "sonner";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export type BillApprovalStatus = "draft" | "pending_review" | "approved" | "rejected" | "posted" | "void" | "reversed";
export type BillPaymentStatus = "unpaid" | "partial" | "paid";

// Detect the DB-level approval-gate trigger error and surface its bullet list.
// The trigger raises with SQLSTATE 23514 (check_violation) and a human-readable
// message enumerating what's missing (vendor / category / account / balance).
function isApprovalGateError(e: any): boolean {
  if (!e) return false;
  const msg = (e.message || "").toLowerCase();
  return (
    e.code === "23514" ||
    msg.includes("not ready to approve") ||
    msg.includes("cannot be approved") ||
    (msg.includes("supplier_id") && msg.includes("approve")) ||
    (msg.includes("allocation") && msg.includes("approve"))
  );
}
function showApprovalGateToast(e: any) {
  const raw = String(e?.message || "");
  // Strip the leading Postgres prefix if present so bullets read cleanly.
  const cleaned = raw
    .replace(/^ERROR:\s*/i, "")
    .replace(/^new row for relation.*?violates check constraint.*?\n?/i, "")
    .trim();
  toast.error("Bill not ready to approve", {
    description: cleaned || "Complete the readiness checklist and try again.",
    duration: 8000,
  });
}

export interface ExpenseBill {
  id: string;
  supplier_id: string | null;
  vendor_name: string | null;
  bill_number: string | null;
  bill_date: string;
  due_date: string | null;
  service_period_start: string | null;
  service_period_end: string | null;
  venue_id: string | null;
  venue: string | null;
  department: string | null;
  currency: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  payment_status: BillPaymentStatus;
  approval_status: BillApprovalStatus;
  notes: string | null;
  attachment_url: string | null;
  attachment_path: string | null;
  journal_entry_id: string | null;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  posted_by: string | null;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
  source_type?: "manual" | "recurring_rule" | "bank_match" | string;
  recurring_rule_id?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  document_requirement?: "not_required" | "pending" | "received" | string;
  combined_venues?: boolean;
  brought_forward?: number;
  statement_total?: number | null;
  meta?: Record<string, any> | null;
}


export interface ExpenseBillAllocation {
  id?: string;
  bill_id?: string;
  line_no: number;
  expense_category: string | null;
  account_id: string | null;
  venue: string | null;
  department: string | null;
  amount: number;
  tax_treatment: "none" | "inclusive" | "exclusive";
  tax_amount: number;
  notes: string | null;
}

export interface ExpenseBillAuditRow {
  id: string;
  bill_id: string;
  event_type: string;
  actor_id: string | null;
  actor_name: string | null;
  details: any;
  created_at: string;
}

export interface ExpenseBillPayment {
  id?: string;
  bill_id: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  bank_account_id: string | null;
  reference: string | null;
  notes: string | null;
  journal_entry_id?: string | null;
}

export function useExpenseBills() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [bills, setBills] = useState<ExpenseBill[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tenantId) { setBills([]); setLoading(false); return; }
    setLoading(true);
    try {
      const rows = await fetchAllRows("expense_bills", "*", { col: "bill_date", asc: false }, tenantId);
      setBills(rows as ExpenseBill[]);
    } catch (e: any) {
      toast.error("Failed to load bills: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!tenantLoading) refresh();
  }, [refresh, tenantLoading]);

  const saveBill = useCallback(
    async (
      header: Partial<ExpenseBill>,
      allocations: ExpenseBillAllocation[]
    ): Promise<string | null> => {
      if (!tenantId) return null;
      try {
        let billId = header.id;
        const auth = (await supabase.auth.getUser()).data.user?.id ?? null;

        // Guard: posted or reversed bills are immutable.
        if (billId) {
          const existing = bills.find((b) => b.id === billId);
          const lockedStatus = existing?.approval_status;
          if (lockedStatus === "posted" || lockedStatus === "reversed") {
            toast.error(
              `This bill is ${lockedStatus} and can no longer be edited. Reverse it first, then create a corrected bill.`
            );
            return null;
          }
        }

        const headerPayload: any = {
          supplier_id: header.supplier_id || null,
          vendor_name: header.vendor_name || null,
          bill_number: header.bill_number || null,
          bill_date: header.bill_date,
          due_date: header.due_date || null,
          service_period_start: header.service_period_start || null,
          service_period_end: header.service_period_end || null,
          venue_id: header.venue_id || null,
          venue: header.venue || null,
          department: header.department || null,
          currency: header.currency || "HKD",
          subtotal: Number(header.subtotal || 0),
          tax_amount: Number(header.tax_amount || 0),
          total_amount: Number(header.total_amount || 0),
          notes: header.notes || null,
          attachment_url: header.attachment_url || null,
          attachment_path: header.attachment_path || null,
          approval_status: header.approval_status || "draft",
          brought_forward: Number(header.brought_forward || 0),
          statement_total:
            header.statement_total === null || header.statement_total === undefined
              ? null
              : Number(header.statement_total),
          meta: header.meta ?? {},
          cost_allocation_mode: (header as any).cost_allocation_mode || "single",
        };

        if (billId) {
          const { error } = await supabase.from("expense_bills").update(headerPayload).eq("id", billId).eq("tenant_id", tenantId);
          if (error) throw error;
        } else {
          headerPayload.created_by = auth;
          headerPayload.tenant_id = tenantId;
          const { data, error } = await supabase.from("expense_bills").insert(headerPayload).select("id").single();
          if (error) throw error;
          billId = data.id;
          await supabase.from("expense_bill_audit").insert({
            bill_id: billId,
            event_type: "uploaded",
            actor_id: auth,
            details: { source: "manual" },
            tenant_id: tenantId,
          });
        }

        await supabase.from("expense_bill_allocations").delete().eq("bill_id", billId).eq("tenant_id", tenantId);
        if (allocations.length) {
          const payload = allocations.map((a, i) => ({
            bill_id: billId,
            line_no: i + 1,
            expense_category: a.expense_category || null,
            account_id: a.account_id || null,
            venue: a.venue || null,
            department: a.department || null,
            amount: Number(a.amount || 0),
            tax_treatment: a.tax_treatment || "none",
            tax_amount: Number(a.tax_amount || 0),
            notes: a.notes || null,
            tenant_id: tenantId,
          }));
          const { error } = await supabase.from("expense_bill_allocations").insert(payload);
          if (error) throw error;
        }

        await refresh();
        return billId!;
      } catch (e: any) {
        if (isApprovalGateError(e) || (header.approval_status === "approved" && e?.message)) {
          showApprovalGateToast(e);
        } else {
          toast.error("Save failed: " + e.message);
        }
        return null;
      }
    },
    [refresh, tenantId, bills]
  );

  const setStatus = useCallback(
    async (billId: string, status: BillApprovalStatus) => {
      if (!tenantId) return false;
      const auth = (await supabase.auth.getUser()).data.user?.id ?? null;
      const patch: any = { approval_status: status };
      if (status === "approved") {
        patch.approved_by = auth;
        patch.approved_at = new Date().toISOString();
      } else if (status === "rejected") {
        patch.reviewed_by = auth;
        patch.reviewed_at = new Date().toISOString();
      }
      const { error } = await supabase.from("expense_bills").update(patch).eq("id", billId).eq("tenant_id", tenantId);
      if (error) {
        if (status === "approved" && (isApprovalGateError(error) || error.message)) {
          showApprovalGateToast(error);
        } else {
          toast.error("Status update failed: " + error.message);
        }
        return false;
      }

      await supabase.from("expense_bill_audit").insert({
        bill_id: billId,
        event_type: status,
        actor_id: auth,
        tenant_id: tenantId,
      });
      await refresh();
      return true;
    },
    [refresh, tenantId]
  );

  const postBill = useCallback(
    async (billId: string) => {
      const { data, error } = await supabase.rpc("post_expense_bill", { p_bill_id: billId });
      if (error) {
        toast.error("Post failed: " + error.message);
        return false;
      }
      toast.success("Bill posted to GL");
      await refresh();
      return true;
    },
    [refresh]
  );

  const reverseBill = useCallback(
    async (billId: string) => {
      const { error } = await supabase.rpc("reverse_expense_bill", { p_bill_id: billId });
      if (error) {
        toast.error("Reversal failed: " + error.message);
        return false;
      }
      toast.success("Bill reversed. A reversing journal entry was posted.");
      await refresh();
      return true;
    },
    [refresh]
  );

  const recordPayment = useCallback(
    async (payment: ExpenseBillPayment) => {
      if (!tenantId) return false;
      const auth = (await supabase.auth.getUser()).data.user?.id ?? null;
      const { data, error } = await supabase
        .from("expense_bill_payments")
        .insert({
          bill_id: payment.bill_id,
          payment_date: payment.payment_date,
          amount: payment.amount,
          payment_method: payment.payment_method,
          bank_account_id: payment.bank_account_id || null,
          reference: payment.reference || null,
          notes: payment.notes || null,
          created_by: auth,
          tenant_id: tenantId,
        })
        .select("id")
        .single();
      if (error) {
        toast.error("Payment failed: " + error.message);
        return false;
      }
      const { error: rpcErr } = await supabase.rpc("post_expense_bill_payment", { p_payment_id: data.id });
      if (rpcErr) {
        toast.error("Payment posting failed: " + rpcErr.message);
        return false;
      }
      toast.success("Payment recorded");
      await refresh();
      return true;
    },
    [refresh, tenantId]
  );

  const fetchAllocations = useCallback(async (billId: string): Promise<ExpenseBillAllocation[]> => {
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from("expense_bill_allocations")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("bill_id", billId)
      .order("line_no");
    if (error) {
      toast.error("Load allocations failed: " + error.message);
      return [];
    }
    return (data || []) as ExpenseBillAllocation[];
  }, [tenantId]);

  const fetchAudit = useCallback(async (billId: string): Promise<ExpenseBillAuditRow[]> => {
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from("expense_bill_audit")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("bill_id", billId)
      .order("created_at", { ascending: false });
    if (error) return [];
    return (data || []) as ExpenseBillAuditRow[];
  }, [tenantId]);

  const fetchPayments = useCallback(async (billId: string): Promise<ExpenseBillPayment[]> => {
    if (!tenantId) return [];
    const { data, error } = await supabase
      .from("expense_bill_payments")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("bill_id", billId)
      .order("payment_date", { ascending: false });
    if (error) return [];
    return (data || []) as ExpenseBillPayment[];
  }, [tenantId]);

  const setDocumentRequirement = useCallback(
    async (billId: string, requirement: "not_required" | "pending" | "received") => {
      if (!tenantId) return false;
      const { error } = await supabase
        .from("expense_bills")
        .update({ document_requirement: requirement } as any)
        .eq("id", billId)
        .eq("tenant_id", tenantId);
      if (error) {
        toast.error("Update failed: " + error.message);
        return false;
      }
      await refresh();
      return true;
    },
    [refresh, tenantId]
  );

  return {
    bills,
    loading,
    refresh,
    saveBill,
    setStatus,
    postBill,
    reverseBill,
    recordPayment,
    fetchAllocations,
    fetchAudit,
    fetchPayments,
    setDocumentRequirement,
  };
}
