import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import type { APInvoice } from "@/hooks/usePayables";
import {
  autoAllocateFifo,
  isDisputedInvoice,
  round2,
} from "@/utils/supplierPaymentAllocation";

export type ExistingPayment = {
  id: string;
  payment_date: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  allocated: number;
};

/**
 * Match an already-recorded payment to invoices later. This never changes the
 * payment itself (date, amount, method, bank account, receipts) and never adds
 * another ledger entry — it only writes allocation rows.
 */
export function AllocateExistingPaymentDialog({
  open,
  onOpenChange,
  payment,
  invoices,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  payment: ExistingPayment | null;
  invoices: APInvoice[];
  onSaved: () => void;
}) {
  const { tenantId } = useActiveTenant();
  const [rows, setRows] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const remaining = payment ? round2(payment.amount - payment.allocated) : 0;

  const eligible = useMemo(
    () => invoices.filter((i) => i.outstanding_amount > 0.01 && i.payment_status !== "voided"),
    [invoices],
  );

  useEffect(() => {
    if (open) setRows({});
  }, [open, payment?.id]);

  if (!payment) return null;

  const allocated = round2(Object.values(rows).reduce((s, v) => s + (Number(v) || 0), 0));
  const stillUnallocated = round2(Math.max(0, remaining - allocated));

  const suggest = () => {
    const suggestions = autoAllocateFifo(
      remaining,
      eligible.map((i) => ({
        id: i.id,
        invoice_number: i.invoice_number,
        invoice_date: i.invoice_date,
        due_date: i.due_date,
        outstanding_amount: i.outstanding_amount,
        payment_status: i.payment_status,
        review_status: i.review_status,
      })),
      payment.payment_date,
    );
    if (!suggestions.length) toast.info("No eligible invoices dated on or before the payment date");
    setRows(Object.fromEntries(suggestions.map((s) => [s.invoice_id, s.amount.toFixed(2)])));
  };

  const save = async () => {
    if (!tenantId) return;
    if (allocated <= 0.005) return toast.error("Enter at least one allocation amount");
    if (allocated > remaining + 0.01) return toast.error("Allocation exceeds the remaining payment amount");
    for (const inv of eligible) {
      const amt = Number(rows[inv.id]) || 0;
      if (amt > inv.outstanding_amount + 0.01) {
        return toast.error(`Allocation for invoice ${inv.invoice_number} exceeds its outstanding`);
      }
    }
    setSaving(true);
    const payload = Object.entries(rows)
      .map(([invoice_id, v]) => ({
        tenant_id: tenantId,
        payment_id: payment.id,
        invoice_id,
        amount_allocated: round2(Number(v) || 0),
      }))
      .filter((r) => r.amount_allocated > 0.005);
    const { error } = await supabase.from("payment_allocations").insert(payload as any);
    setSaving(false);
    if (error) return toast.error("Allocation failed: " + error.message);
    toast.success("Payment matched to invoices");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Match payment to invoices</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Payment of HK$ {payment.amount.toFixed(2)} on {payment.payment_date} — HK$ {remaining.toFixed(2)} still
            unallocated. Matching does not change the payment or the supplier balance.
          </p>
        </DialogHeader>

        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={suggest}>Auto-allocate (oldest first)</Button>
        </div>

        <div className="max-h-[380px] overflow-y-auto border border-border/40 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">Invoice</th>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-right px-3 py-2">Outstanding</th>
                <th className="text-right px-3 py-2 w-[140px]">Allocate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {eligible.length === 0 ? (
                <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No open invoices.</td></tr>
              ) : eligible.map((i) => (
                <tr key={i.id}>
                  <td className="px-3 py-2 font-mono text-xs">
                    {i.invoice_number}
                    {isDisputedInvoice(i) && (
                      <Badge variant="outline" className="ml-2 text-[10px] bg-red-500/15 text-red-400 border-red-500/30">Disputed</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{i.invoice_date}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{i.outstanding_amount.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">
                    <Input
                      className="h-8 text-right"
                      inputMode="decimal"
                      value={rows[i.id] ?? ""}
                      onChange={(e) => setRows((p) => ({ ...p, [i.id]: e.target.value }))}
                      placeholder="0.00"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-3 gap-2 text-xs bg-muted/30 rounded-lg p-3 border border-border/40">
          <div><div className="text-muted-foreground">Remaining payment</div><div className="tabular-nums">{remaining.toFixed(2)}</div></div>
          <div><div className="text-muted-foreground">Allocating now</div><div className="tabular-nums">{allocated.toFixed(2)}</div></div>
          <div><div className="text-muted-foreground">Still unallocated</div><div className="tabular-nums text-amber-400">{stillUnallocated.toFixed(2)}</div></div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save allocation"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
