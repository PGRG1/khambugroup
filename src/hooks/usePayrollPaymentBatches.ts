import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface PayrollPaymentBatch {
  id: string;
  period_year: number;
  period_month: number;
  payment_kind: "salary" | "mpf";
  payment_date: string;
  payment_method: "bank_transfer" | "cash" | "other";
  bank_account_id: string | null;
  total_amount: number;
  status: "draft" | "posted" | "void";
  journal_entry_id: string | null;
  bank_transaction_id: string | null;
  notes: string;
  created_at: string;
}

export interface PayrollPaymentBatchLine {
  id: string;
  batch_id: string;
  payroll_id: string;
  employee_id: string;
  amount: number;
  kind: "salary" | "mpf";
}

export function usePayrollPaymentBatches(year: number, month: number) {
  const [batches, setBatches] = useState<PayrollPaymentBatch[]>([]);
  const [lines, setLines] = useState<PayrollPaymentBatchLine[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data: bs } = await supabase
      .from("hr_payroll_payment_batches" as any)
      .select("*")
      .eq("period_year", year)
      .eq("period_month", month)
      .order("created_at", { ascending: false });
    const ids = ((bs as any[]) ?? []).map((b) => b.id);
    let ls: any[] = [];
    if (ids.length) {
      const { data } = await supabase
        .from("hr_payroll_payment_batch_lines" as any)
        .select("*")
        .in("batch_id", ids);
      ls = (data as any[]) ?? [];
    }
    setBatches((bs as any[]) ?? []);
    setLines(ls as any[]);
    setLoading(false);
  }, [year, month]);

  useEffect(() => {
    reload();
  }, [reload]);

  const createAndPost = useCallback(
    async (input: {
      kind: "salary" | "mpf";
      payment_date: string;
      payment_method: "bank_transfer" | "cash" | "other";
      bank_account_id?: string | null;
      bank_transaction_id?: string | null;
      notes?: string;
      lines: { payroll_id: string; employee_id: string; amount: number }[];
    }) => {
      const total = input.lines.reduce((s, l) => s + Number(l.amount || 0), 0);
      const { data: { user } } = await supabase.auth.getUser();
      const { data: batch, error } = await supabase
        .from("hr_payroll_payment_batches" as any)
        .insert({
          period_year: year,
          period_month: month,
          payment_kind: input.kind,
          payment_date: input.payment_date,
          payment_method: input.payment_method,
          bank_account_id: input.bank_account_id ?? null,
          bank_transaction_id: input.bank_transaction_id ?? null,
          total_amount: total,
          notes: input.notes ?? "",
          created_by: user?.id ?? null,
        } as any)
        .select()
        .single();
      if (error || !batch) {
        toast({ title: "Failed to create batch", description: error?.message, variant: "destructive" });
        return null;
      }
      const bid = (batch as any).id;
      const { error: e2 } = await supabase
        .from("hr_payroll_payment_batch_lines" as any)
        .insert(
          input.lines
            .filter((l) => Number(l.amount) > 0)
            .map((l) => ({ batch_id: bid, payroll_id: l.payroll_id, employee_id: l.employee_id, amount: l.amount, kind: input.kind })) as any,
        );
      if (e2) {
        await supabase.from("hr_payroll_payment_batches" as any).delete().eq("id", bid);
        toast({ title: "Failed to insert lines", description: e2.message, variant: "destructive" });
        return null;
      }
      const { error: e3 } = await (supabase as any).rpc("post_payroll_payment_batch", { p_batch_id: bid });
      if (e3) {
        toast({ title: "Failed to post payment", description: e3.message, variant: "destructive" });
        return null;
      }
      toast({ title: "Payment posted", description: `${input.kind === "salary" ? "Salary" : "MPF"} payment of ${total.toLocaleString()} recorded.` });
      await reload();
      return bid as string;
    },
    [year, month, reload],
  );

  const voidBatch = useCallback(
    async (batchId: string) => {
      const { error } = await (supabase as any).rpc("void_payroll_payment_batch", { p_batch_id: batchId });
      if (error) {
        toast({ title: "Void failed", description: error.message, variant: "destructive" });
        return false;
      }
      toast({ title: "Batch voided" });
      await reload();
      return true;
    },
    [reload],
  );

  return { batches, lines, loading, reload, createAndPost, voidBatch };
}
