import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { APInvoice, APBankAccountLite } from "@/hooks/usePayables";

const METHODS = ["FPS", "Cheque", "Bank Transfer", "Cash", "Credit Card", "Other"];
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function RecordPaymentDialog({
  open,
  onOpenChange,
  invoice,
  supplierInvoices,
  bankAccounts,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoice: APInvoice | null;
  supplierInvoices: APInvoice[];
  bankAccounts: APBankAccountLite[];
  onSaved: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Bank Transfer");
  const [bankAccountId, setBankAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && invoice) {
      setStep(1);
      setDate(new Date().toISOString().slice(0, 10));
      setAmount(invoice.outstanding_amount.toFixed(2));
      setMethod(invoice.last_payment_method || "Bank Transfer");
      setBankAccountId(invoice.last_paid_from_account_id || (bankAccounts[0]?.id ?? ""));
      setReference("");
      setChequeNumber("");
      setNotes("");
      setAlloc({ [invoice.id]: invoice.outstanding_amount.toFixed(2) });
    }
  }, [open, invoice, bankAccounts]);

  const openInvoices = useMemo(() => {
    if (!invoice) return [];
    return supplierInvoices
      .filter((i) => i.supplier_id === invoice.supplier_id && i.outstanding_amount > 0.01 && i.payment_status !== "voided")
      .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
  }, [supplierInvoices, invoice]);

  const paymentAmt = Number(amount) || 0;
  const totalAllocated = useMemo(
    () => Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0),
    [alloc]
  );
  const unallocated = Math.max(0, paymentAmt - totalAllocated);
  const remainingOutstanding = useMemo(
    () => openInvoices.reduce((s, i) => s + Math.max(0, i.outstanding_amount - (Number(alloc[i.id]) || 0)), 0),
    [openInvoices, alloc]
  );

  if (!invoice) return null;

  const goNext = () => {
    if (!paymentAmt || paymentAmt <= 0) return toast.error("Enter a positive payment amount");
    if (!method) return toast.error("Select a payment method");
    if (!bankAccountId) return toast.error("Select a paid-from account");
    if (method === "Cheque" && !chequeNumber.trim()) return toast.error("Enter the cheque number");
    setStep(2);
  };

  const setAllocFor = (id: string, value: string) => {
    setAlloc((prev) => ({ ...prev, [id]: value }));
  };

  const payFull = (i: APInvoice) => {
    const otherAllocs = Object.entries(alloc).reduce(
      (s, [k, v]) => (k === i.id ? s : s + (Number(v) || 0)),
      0
    );
    const room = Math.max(0, paymentAmt - otherAllocs);
    setAllocFor(i.id, Math.min(i.outstanding_amount, room).toFixed(2));
  };

  const save = async () => {
    if (totalAllocated > paymentAmt + 0.01) {
      return toast.error("Total allocated exceeds the payment amount");
    }
    for (const i of openInvoices) {
      const a = Number(alloc[i.id]) || 0;
      if (a > i.outstanding_amount + 0.01) {
        return toast.error(`Allocation for invoice ${i.invoice_number} exceeds its outstanding`);
      }
    }
    if (unallocated > 0.01) {
      const ok = window.confirm(
        `HK$ ${fmt(unallocated)} will be saved as an Advance / On-Account payment. Continue?`
      );
      if (!ok) return;
    }

    setSaving(true);
    const allocations = openInvoices
      .map((i) => ({ invoice_id: i.id, amount_allocated: Number(alloc[i.id]) || 0 }))
      .filter((a) => a.amount_allocated > 0);

    const { error } = await (supabase as any).rpc("record_payment_with_allocations", {
      p_payment: {
        payment_date: date,
        amount: paymentAmt,
        payment_method: method,
        paid_from_account_id: bankAccountId,
        reference_number: reference,
        cheque_number: method === "Cheque" ? chequeNumber : "",
        notes,
        supplier_id: invoice.supplier_id,
        match_status: "awaiting_bank_match",
      },
      p_allocations: allocations,
    });

    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Payment recorded");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Record Payment
            <span className="text-xs text-muted-foreground font-normal">
              Step {step} of 2 · {step === 1 ? "Payment Details" : "Allocate Payment"}
            </span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {invoice.supplier_name}
          </p>
        </DialogHeader>

        {step === 1 ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Payment Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Payment Amount (HK$)</Label>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Paid From Account</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.account_name || b.bank_name} {b.account_number_last4 ? `•••${b.account_number_last4}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reference Number</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="FPS ref, txn id…" />
            </div>
            {method === "Cheque" && (
              <div>
                <Label>Cheque Number</Label>
                <Input value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} />
              </div>
            )}
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto border border-border/40 rounded-lg max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">Invoice #</th>
                    <th className="text-left px-3 py-2">Inv Date</th>
                    <th className="text-left px-3 py-2">Due Date</th>
                    <th className="text-right px-3 py-2">Invoice Amt</th>
                    <th className="text-right px-3 py-2">Outstanding</th>
                    <th className="text-right px-3 py-2 w-32">Amount to Pay</th>
                    <th className="text-right px-3 py-2">Remaining</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {openInvoices.length === 0 ? (
                    <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">No open invoices for this supplier.</td></tr>
                  ) : openInvoices.map((i) => {
                    const a = Number(alloc[i.id]) || 0;
                    const remaining = Math.max(0, i.outstanding_amount - a);
                    return (
                      <tr key={i.id} className="hover:bg-muted/20">
                        <td className="px-3 py-1.5 font-medium">{i.invoice_number || "—"}</td>
                        <td className="px-3 py-1.5 font-mono">{i.invoice_date}</td>
                        <td className="px-3 py-1.5 font-mono">{i.due_date || "—"}</td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmt(i.total_amount)}</td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmt(i.outstanding_amount)}</td>
                        <td className="px-2 py-1">
                          <Input
                            inputMode="decimal"
                            className="h-7 text-right font-mono"
                            value={alloc[i.id] ?? ""}
                            onChange={(e) => setAllocFor(i.id, e.target.value)}
                            placeholder="0.00"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmt(remaining)}</td>
                        <td className="px-2 py-1 whitespace-nowrap">
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => payFull(i)}>Full</Button>
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setAllocFor(i.id, "")}>Clear</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-4 gap-2 text-xs bg-muted/30 rounded-lg p-3 border border-border/40">
              <SumItem label="Payment Amount" value={paymentAmt} />
              <SumItem label="Total Allocated" value={totalAllocated} accent={totalAllocated > paymentAmt + 0.01 ? "text-red-400" : "text-emerald-400"} />
              <SumItem label="Unallocated" value={unallocated} accent={unallocated > 0.01 ? "text-amber-400" : ""} hint={unallocated > 0.01 ? "Advance / On-Account" : undefined} />
              <SumItem label="Remaining Outstanding" value={remainingOutstanding} />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === 2 && (
            <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          {step === 1 ? (
            <Button onClick={goNext}>Next <ArrowRight className="h-4 w-4 ml-1" /></Button>
          ) : (
            <Button onClick={save} disabled={saving || totalAllocated > paymentAmt + 0.01}>
              {saving ? "Saving…" : "Record Payment"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SumItem({ label, value, accent, hint }: { label: string; value: number; accent?: string; hint?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-mono tabular-nums text-base font-semibold ${accent || ""}`}>HK$ {fmt(value)}</div>
      {hint && <div className="text-[10px] text-amber-400 mt-0.5">{hint}</div>}
    </div>
  );
}
