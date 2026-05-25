import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fetchAllRows } from "@/utils/fetchAllRows";
import type { APInvoice } from "@/hooks/usePayables";

type Txn = {
  id: string;
  txn_date: string;
  description: string;
  reference: string;
  money_out: number;
  status: string;
  bank_account_id: string;
};

export function AllocatePaymentDialog({
  open,
  onOpenChange,
  invoice,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoice: APInvoice | null;
  onSaved: () => void;
}) {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !invoice) return;
    (async () => {
      setLoading(true);
      const rows = await fetchAllRows(
        "bank_transactions",
        "id, txn_date, description, reference, money_out, status, bank_account_id"
      );
      const target = invoice.outstanding_amount > 0 ? invoice.outstanding_amount : invoice.total_amount;
      const filtered = (rows as any[])
        .filter((r) => Number(r.money_out) > 0)
        .filter((r) => Math.abs(Number(r.money_out) - target) < target * 0.2 + 5)
        .sort((a, b) => Math.abs(Number(a.money_out) - target) - Math.abs(Number(b.money_out) - target))
        .slice(0, 50);
      setTxns(filtered);
      setSelected(null);
      setLoading(false);
    })();
  }, [open, invoice]);

  if (!invoice) return null;

  const visible = txns.filter(
    (t) =>
      !search ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.reference.toLowerCase().includes(search.toLowerCase())
  );

  const allocate = async () => {
    if (!selected) return;
    setSaving(true);
    const { data: pays } = await supabase
      .from("invoice_payments")
      .select("id")
      .eq("invoice_id", invoice.id)
      .order("payment_date", { ascending: false })
      .limit(1);
    const lastPayId = pays?.[0]?.id;
    if (lastPayId) {
      await supabase.from("invoice_payments")
        .update({ bank_transaction_id: selected, match_status: "matched" } as any)
        .eq("id", lastPayId);
    }
    await supabase.from("invoices")
      .update({ bank_match_status: "matched" } as any)
      .eq("id", invoice.id);
    await supabase.from("bank_transactions")
      .update({
        status: "matched",
        matched_record_type: "invoice_payment",
        matched_record_id: invoice.id,
      } as any)
      .eq("id", selected);
    toast.success("Allocated to bank transaction");
    setSaving(false);
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Allocate to Bank Transaction</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Match {invoice.supplier_name} · Inv {invoice.invoice_number} (HK$ {invoice.outstanding_amount.toFixed(2)}) to a bank statement line.
          </p>
        </DialogHeader>
        <Input placeholder="Search description or reference…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="max-h-[400px] overflow-y-auto border border-border/40 rounded-lg">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : visible.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No nearby bank transactions found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Description</th>
                  <th className="text-right px-3 py-2">Out</th>
                  <th className="text-left px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {visible.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => setSelected(t.id)}
                    className={`cursor-pointer hover:bg-muted/40 ${selected === t.id ? "bg-emerald-500/10" : ""}`}
                  >
                    <td className="px-3 py-2 text-xs font-mono">{t.txn_date}</td>
                    <td className="px-3 py-2 text-xs truncate max-w-[280px]">{t.description}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{Number(t.money_out).toFixed(2)}</td>
                    <td className="px-3 py-2 text-xs capitalize">{t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={allocate} disabled={!selected || saving}>{saving ? "Saving…" : "Allocate"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
