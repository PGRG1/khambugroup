import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { APInvoice } from "@/hooks/usePayables";

type AllocRow = {
  id: string;
  amount_allocated: number;
  credit_note_amount_applied: number;
  credit_note_id: string | null;
  credit_note_number: string | null;
  payment: {
    id: string;
    payment_date: string;
    amount: number;
    payment_method: string;
    reference_number: string;
    cheque_number: string;
    match_status: string;
    notes: string;
    paid_from_account_id: string | null;
  };
};

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PaymentHistoryDialog({
  open,
  onOpenChange,
  invoice,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoice: APInvoice | null;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<AllocRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !invoice) return;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("payment_allocations")
        .select(
          "id, amount_allocated, credit_note_amount_applied, credit_note_id, " +
            "payment:payments(id, payment_date, amount, payment_method, reference_number, cheque_number, match_status, notes, paid_from_account_id), " +
            "credit_note:credit_notes(credit_note_number)"
        )
        .eq("invoice_id", invoice.id);
      const mapped: AllocRow[] = (data || []).map((r: any) => ({
        id: r.id,
        amount_allocated: Number(r.amount_allocated) || 0,
        credit_note_amount_applied: Number(r.credit_note_amount_applied) || 0,
        credit_note_id: r.credit_note_id,
        credit_note_number: r.credit_note?.credit_note_number || null,
        payment: r.payment,
      }));
      mapped.sort((a, b) => (b.payment?.payment_date || "").localeCompare(a.payment?.payment_date || ""));
      setRows(mapped);
      setLoading(false);
    })();
  }, [open, invoice?.id]);

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
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
                  <th className="text-right px-3 py-2">Cash Applied</th>
                  <th className="text-right px-3 py-2">Credit Applied</th>
                  <th className="text-left px-3 py-2">Method</th>
                  <th className="text-left px-3 py-2">Reference</th>
                  <th className="text-left px-3 py-2">Credit Note</th>
                  <th className="text-left px-3 py-2">Bank Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-xs font-mono">{r.payment?.payment_date || "—"}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">
                      {r.amount_allocated > 0 ? fmt(r.amount_allocated) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-emerald-400">
                      {r.credit_note_amount_applied > 0 ? fmt(r.credit_note_amount_applied) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">{r.payment?.payment_method || "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.payment?.reference_number || r.payment?.cheque_number || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">{r.credit_note_number || "—"}</td>
                    <td className="px-3 py-2 text-xs capitalize">
                      {(r.payment?.match_status || "").replace(/_/g, " ")}
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
