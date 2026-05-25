import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import type { APInvoice } from "@/hooks/usePayables";

type Pay = {
  id: string;
  payment_date: string;
  amount: number;
  payment_method: string | null;
  reference: string | null;
  match_status: string | null;
  notes: string | null;
};

export function PaymentHistoryDialog({
  open,
  onOpenChange,
  invoice,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoice: APInvoice | null;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<Pay[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!invoice) return;
    setLoading(true);
    const { data } = await supabase
      .from("invoice_payments")
      .select("id, payment_date, amount, payment_method, reference, match_status, notes")
      .eq("invoice_id", invoice.id)
      .order("payment_date", { ascending: false });
    setRows((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice?.id]);

  if (!invoice) return null;

  const reverse = async (p: Pay) => {
    if (!confirm(`Reverse payment of HK$ ${Number(p.amount).toFixed(2)} on ${p.payment_date}?`)) return;
    await supabase.from("invoice_payments").delete().eq("id", p.id);
    const newPaid = Math.max(0, invoice.amount_paid - Number(p.amount));
    const newRemaining = Math.max(0, invoice.total_amount - newPaid);
    const newStatus = newRemaining >= invoice.total_amount - 0.01 ? "unpaid" : newRemaining <= 0.01 ? "paid" : "partially_paid";
    await supabase.from("invoices").update({
      amount_paid: newPaid,
      remaining_balance: newRemaining,
      payment_status: newStatus,
      bank_match_status: newStatus === "unpaid" ? "not_ready" : "awaiting_bank_match",
    } as any).eq("id", invoice.id);
    toast.success("Payment reversed");
    await load();
    onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Payment History</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {invoice.supplier_name} · Inv {invoice.invoice_number}
          </p>
        </DialogHeader>
        <div className="border border-border/40 rounded-lg overflow-hidden">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No payments recorded yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-right px-3 py-2">Amount</th>
                  <th className="text-left px-3 py-2">Method</th>
                  <th className="text-left px-3 py-2">Reference</th>
                  <th className="text-left px-3 py-2">Match</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 text-xs font-mono">{p.payment_date}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{Number(p.amount).toFixed(2)}</td>
                    <td className="px-3 py-2 text-xs">{p.payment_method || "—"}</td>
                    <td className="px-3 py-2 text-xs">{p.reference || "—"}</td>
                    <td className="px-3 py-2 text-xs capitalize">{(p.match_status || "").replace(/_/g, " ")}</td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => reverse(p)} title="Reverse payment">
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
