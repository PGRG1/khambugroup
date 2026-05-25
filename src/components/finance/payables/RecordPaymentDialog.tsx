import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Receipt } from "lucide-react";
import type { APInvoice, APBankAccountLite, APCreditNote } from "@/hooks/usePayables";

const METHODS = ["FPS", "Cheque", "Bank Transfer", "Cash", "Credit Card", "Other"];
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Allocation = { cash: string; creditNoteId: string | null; creditAmt: string };

export function RecordPaymentDialog({
  open,
  onOpenChange,
  invoice,
  supplierInvoices,
  bankAccounts,
  creditNotes = [],
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoice: APInvoice | null;
  supplierInvoices: APInvoice[];
  bankAccounts: APBankAccountLite[];
  creditNotes?: APCreditNote[];
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
  const [alloc, setAlloc] = useState<Record<string, Allocation>>({});
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
      setAlloc({ [invoice.id]: { cash: invoice.outstanding_amount.toFixed(2), creditNoteId: null, creditAmt: "" } });
    }
  }, [open, invoice, bankAccounts]);

  const openInvoices = useMemo(() => {
    if (!invoice) return [];
    return supplierInvoices
      .filter((i) => i.supplier_id === invoice.supplier_id && i.outstanding_amount > 0.01 && i.payment_status !== "voided")
      .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
  }, [supplierInvoices, invoice]);

  const supplierCNs = useMemo(
    () => creditNotes.filter((c) => invoice && c.supplier_id === invoice.supplier_id),
    [creditNotes, invoice]
  );

  const paymentAmt = Number(amount) || 0;
  const totalCash = useMemo(
    () => Object.values(alloc).reduce((s, a) => s + (Number(a.cash) || 0), 0),
    [alloc]
  );
  const totalCredit = useMemo(
    () => Object.values(alloc).reduce((s, a) => s + (Number(a.creditAmt) || 0), 0),
    [alloc]
  );
  const unallocated = Math.max(0, paymentAmt - totalCash);
  const remainingOutstanding = useMemo(
    () =>
      openInvoices.reduce(
        (s, i) => s + Math.max(0, i.outstanding_amount - ((Number(alloc[i.id]?.cash) || 0) + (Number(alloc[i.id]?.creditAmt) || 0))),
        0
      ),
    [openInvoices, alloc]
  );

  // Track credit-note usage across all rows (a CN can be used on multiple invoices in one go)
  const creditUsageById = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of Object.values(alloc)) {
      if (a.creditNoteId && Number(a.creditAmt) > 0) {
        m.set(a.creditNoteId, (m.get(a.creditNoteId) || 0) + Number(a.creditAmt));
      }
    }
    return m;
  }, [alloc]);

  if (!invoice) return null;

  const goNext = () => {
    if (paymentAmt < 0) return toast.error("Payment amount cannot be negative");
    if (paymentAmt > 0) {
      if (!method) return toast.error("Select a payment method");
      if (!bankAccountId) return toast.error("Select a paid-from account");
      if (method === "Cheque" && !chequeNumber.trim()) return toast.error("Enter the cheque number");
    }
    setStep(2);
  };

  const setRow = (id: string, patch: Partial<Allocation>) => {
    setAlloc((prev) => ({ ...prev, [id]: { ...(prev[id] || { cash: "", creditNoteId: null, creditAmt: "" }), ...patch } }));
  };

  const payFullCash = (i: APInvoice) => {
    const otherCash = Object.entries(alloc).reduce(
      (s, [k, v]) => (k === i.id ? s : s + (Number(v.cash) || 0)),
      0
    );
    const room = Math.max(0, paymentAmt - otherCash);
    const credit = Number(alloc[i.id]?.creditAmt) || 0;
    const needed = Math.max(0, i.outstanding_amount - credit);
    setRow(i.id, { cash: Math.min(needed, room).toFixed(2) });
  };

  const applyCreditNote = (i: APInvoice, cn: APCreditNote) => {
    const alreadyUsedFromThisCN = creditUsageById.get(cn.id) || 0;
    const cnAvail = Math.max(0, cn.remaining_balance - alreadyUsedFromThisCN + (Number(alloc[i.id]?.creditAmt) || 0));
    const cash = Number(alloc[i.id]?.cash) || 0;
    const need = Math.max(0, i.outstanding_amount - cash);
    const toApply = Math.min(cnAvail, need);
    if (toApply <= 0) {
      toast.error("No room to apply this credit note");
      return;
    }
    const ok = window.confirm(
      `Apply HK$ ${fmt(toApply)} from credit note ${cn.credit_note_number || "(unnamed)"}?\n` +
        `Remaining credit after this: HK$ ${fmt(cn.remaining_balance - alreadyUsedFromThisCN - toApply)}`
    );
    if (!ok) return;
    setRow(i.id, { creditNoteId: cn.id, creditAmt: toApply.toFixed(2) });
  };

  const clearCreditNote = (i: APInvoice) => {
    setRow(i.id, { creditNoteId: null, creditAmt: "" });
  };

  const save = async () => {
    // Validate cash
    if (totalCash > paymentAmt + 0.01) {
      return toast.error("Total cash allocated exceeds the payment amount");
    }
    // Validate per-invoice ceiling and CN balance
    for (const i of openInvoices) {
      const row = alloc[i.id];
      if (!row) continue;
      const cash = Number(row.cash) || 0;
      const credit = Number(row.creditAmt) || 0;
      if (cash + credit > i.outstanding_amount + 0.01) {
        return toast.error(`Allocation for invoice ${i.invoice_number} exceeds its outstanding`);
      }
      if (row.creditNoteId) {
        const cn = supplierCNs.find((c) => c.id === row.creditNoteId);
        if (!cn) return toast.error("Selected credit note no longer available");
        if (credit > cn.remaining_balance + 0.01) {
          return toast.error(`Credit applied exceeds remaining balance of ${cn.credit_note_number}`);
        }
      }
    }
    // Aggregate CN usage cannot exceed remaining
    for (const [cnId, used] of creditUsageById.entries()) {
      const cn = supplierCNs.find((c) => c.id === cnId);
      if (cn && used > cn.remaining_balance + 0.01) {
        return toast.error(`Total credit applied exceeds available on ${cn.credit_note_number}`);
      }
    }
    if (paymentAmt === 0 && totalCredit === 0) {
      return toast.error("Enter a cash amount or apply a credit note");
    }
    if (unallocated > 0.01 && paymentAmt > 0) {
      const ok = window.confirm(
        `HK$ ${fmt(unallocated)} will be saved as an Advance / On-Account payment. Continue?`
      );
      if (!ok) return;
    }

    setSaving(true);
    const allocations = openInvoices
      .map((i) => ({
        invoice_id: i.id,
        amount_allocated: Number(alloc[i.id]?.cash) || 0,
        credit_note_id: alloc[i.id]?.creditNoteId || null,
        credit_note_amount_applied: Number(alloc[i.id]?.creditAmt) || 0,
      }))
      .filter((a) => a.amount_allocated > 0 || a.credit_note_amount_applied > 0);

    const { error } = await (supabase as any).rpc("record_payment_with_allocations", {
      p_payment: {
        payment_date: date,
        amount: paymentAmt,
        payment_method: paymentAmt > 0 ? method : "Credit Note",
        paid_from_account_id: paymentAmt > 0 ? bankAccountId : null,
        reference_number: reference,
        cheque_number: method === "Cheque" ? chequeNumber : "",
        notes,
        supplier_id: invoice.supplier_id,
        match_status: paymentAmt > 0 ? "awaiting_bank_match" : "not_required",
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
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Record Payment
            <span className="text-xs text-muted-foreground font-normal">
              Step {step} of 2 · {step === 1 ? "Payment Details" : "Allocate Payment"}
            </span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{invoice.supplier_name}</p>
        </DialogHeader>

        {step === 1 ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Payment Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Cash Payment Amount (HK$)</Label>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Use 0 if fully settling with a credit note.
              </p>
            </div>
            {paymentAmt > 0 && (
              <>
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
              </>
            )}
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {supplierCNs.length > 0 && (
              <div className="text-[11px] text-emerald-300/80 bg-emerald-500/5 border border-emerald-500/20 rounded p-2">
                {supplierCNs.length} approved credit note{supplierCNs.length > 1 ? "s" : ""} available for this supplier · Total HK$ {fmt(supplierCNs.reduce((s, c) => s + c.remaining_balance, 0))}
              </div>
            )}
            <div className="overflow-x-auto border border-border/40 rounded-lg max-h-[420px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">Invoice #</th>
                    <th className="text-left px-3 py-2">Due</th>
                    <th className="text-right px-3 py-2">Outstanding</th>
                    <th className="text-right px-3 py-2 w-32">Credit Applied</th>
                    <th className="text-right px-3 py-2 w-32">Cash to Pay</th>
                    <th className="text-right px-3 py-2">Remaining</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {openInvoices.length === 0 ? (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No open invoices for this supplier.</td></tr>
                  ) : openInvoices.map((i) => {
                    const row = alloc[i.id] || { cash: "", creditNoteId: null, creditAmt: "" };
                    const cash = Number(row.cash) || 0;
                    const credit = Number(row.creditAmt) || 0;
                    const remaining = Math.max(0, i.outstanding_amount - cash - credit);
                    const cn = row.creditNoteId ? supplierCNs.find((c) => c.id === row.creditNoteId) : null;
                    const availCNs = supplierCNs.map((c) => ({
                      ...c,
                      effectiveRemaining:
                        c.remaining_balance -
                        ((creditUsageById.get(c.id) || 0) - (row.creditNoteId === c.id ? credit : 0)),
                    })).filter((c) => c.effectiveRemaining > 0.01);
                    return (
                      <tr key={i.id} className="hover:bg-muted/20">
                        <td className="px-3 py-1.5 font-medium">{i.invoice_number || "—"}</td>
                        <td className="px-3 py-1.5 font-mono">{i.due_date || "—"}</td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmt(i.outstanding_amount)}</td>
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-1 justify-end">
                            <Input
                              inputMode="decimal"
                              className="h-7 text-right font-mono w-20"
                              value={row.creditAmt}
                              onChange={(e) => setRow(i.id, { creditAmt: e.target.value })}
                              placeholder="0.00"
                              disabled={!row.creditNoteId}
                            />
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Apply credit note">
                                  <Receipt className="h-3.5 w-3.5" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-72 p-2" align="end">
                                {availCNs.length === 0 ? (
                                  <div className="text-xs text-muted-foreground px-2 py-3 text-center">
                                    No credit notes with remaining balance.
                                  </div>
                                ) : (
                                  <div className="space-y-1">
                                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1 mb-1">
                                      Apply credit note
                                    </div>
                                    {availCNs.map((c) => (
                                      <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => applyCreditNote(i, c)}
                                        className="w-full text-left text-xs hover:bg-muted/40 rounded px-2 py-1.5 flex justify-between items-center"
                                      >
                                        <span>
                                          <div className="font-medium">{c.credit_note_number || "(unnamed)"}</div>
                                          <div className="text-[10px] text-muted-foreground">{c.credit_note_date}</div>
                                        </span>
                                        <span className="font-mono text-emerald-400">HK$ {fmt(c.effectiveRemaining)}</span>
                                      </button>
                                    ))}
                                    {row.creditNoteId && (
                                      <button
                                        type="button"
                                        onClick={() => clearCreditNote(i)}
                                        className="w-full text-left text-[11px] hover:bg-muted/40 rounded px-2 py-1.5 text-amber-400"
                                      >
                                        Remove credit note from this invoice
                                      </button>
                                    )}
                                  </div>
                                )}
                              </PopoverContent>
                            </Popover>
                          </div>
                          {cn && (
                            <div className="text-[10px] text-emerald-400/80 text-right mt-0.5 truncate">
                              from {cn.credit_note_number || "CN"}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            inputMode="decimal"
                            className="h-7 text-right font-mono"
                            value={row.cash}
                            onChange={(e) => setRow(i.id, { cash: e.target.value })}
                            placeholder="0.00"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums">{fmt(remaining)}</td>
                        <td className="px-2 py-1 whitespace-nowrap">
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => payFullCash(i)}>Full</Button>
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setRow(i.id, { cash: "" })}>Clear</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-5 gap-2 text-xs bg-muted/30 rounded-lg p-3 border border-border/40">
              <SumItem label="Payment Amount" value={paymentAmt} />
              <SumItem label="Credit Applied" value={totalCredit} accent={totalCredit > 0 ? "text-emerald-400" : ""} />
              <SumItem label="Cash Allocated" value={totalCash} accent={totalCash > paymentAmt + 0.01 ? "text-red-400" : ""} />
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
            <Button onClick={save} disabled={saving || totalCash > paymentAmt + 0.01}>
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
