import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { APInvoice, APCreditNote, APBankAccountLite } from "@/hooks/usePayables";

const METHODS = ["FPS", "Cheque", "Bank Transfer", "Cash", "Credit Card", "Other"];
const fmt = (n: number) => (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface InvAlloc {
  invoiceId: string;
  creditApplied: number;
  cashPaid: number;
}

export function ExerciseCreditDialog({
  open,
  onOpenChange,
  supplierId,
  supplierName,
  availableCNs,
  openInvoices,
  bankAccounts,
  tenantId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  supplierId: string;
  supplierName: string;
  availableCNs: APCreditNote[];
  openInvoices: APInvoice[];
  bankAccounts: APBankAccountLite[];
  tenantId: string;
  onSaved: () => void;
}) {
  const [selectedCnIds, setSelectedCnIds] = useState<Set<string>>(new Set());
  const [invAllocs, setInvAllocs] = useState<Record<string, { credit: string; cash: string }>>({});
  const [recordCash, setRecordCash] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Bank Transfer");
  const [bankAccountId, setBankAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  // Sort invoices oldest first
  const sortedInvoices = useMemo(
    () => [...openInvoices].sort((a, b) => (a.invoice_date || "").localeCompare(b.invoice_date || "")),
    [openInvoices]
  );

  const totalCredits = useMemo(
    () => availableCNs.filter((c) => selectedCnIds.has(c.id)).reduce((s, c) => s + c.remaining_balance, 0),
    [availableCNs, selectedCnIds]
  );

  useEffect(() => {
    if (open) {
      setSelectedCnIds(new Set());
      setInvAllocs({});
      setRecordCash(false);
      setPaymentMethod("Bank Transfer");
      setBankAccountId(bankAccounts[0]?.id ?? "");
      setReference("");
      setPaymentDate(new Date().toISOString().slice(0, 10));
    }
  }, [open, bankAccounts]);

  // Auto-distribute when credit selection changes
  useEffect(() => {
    let remaining = totalCredits;
    const next: Record<string, { credit: string; cash: string }> = {};
    for (const inv of sortedInvoices) {
      const apply = Math.min(remaining, inv.outstanding_amount);
      remaining -= apply;
      next[inv.id] = {
        credit: apply > 0 ? apply.toFixed(2) : "0.00",
        cash: "0.00",
      };
    }
    setInvAllocs(next);
  }, [totalCredits, sortedInvoices]);

  const totalCreditApplied = useMemo(
    () => Object.values(invAllocs).reduce((s, a) => s + (Number(a.credit) || 0), 0),
    [invAllocs]
  );
  const totalCash = useMemo(
    () => Object.values(invAllocs).reduce((s, a) => s + (Number(a.cash) || 0), 0),
    [invAllocs]
  );
  const totalOutstanding = sortedInvoices.reduce((s, i) => s + i.outstanding_amount, 0);
  const netDue = Math.max(0, totalOutstanding - totalCreditApplied);

  const toggleCn = (id: string) => {
    setSelectedCnIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const handleSave = async () => {
    if (selectedCnIds.size === 0) {
      toast.error("Select at least one credit note");
      return;
    }
    if (totalCreditApplied <= 0 && totalCash <= 0) {
      toast.error("Allocate credits or cash to invoices");
      return;
    }
    if (totalCreditApplied > totalCredits + 0.01) {
      toast.error("Allocated credit exceeds selected credit notes");
      return;
    }
    setSaving(true);
    try {
      const selectedCNs = availableCNs.filter((c) => selectedCnIds.has(c.id));

      // 1. Distribute creditApplied across selected CNs in order
      let creditRemaining = totalCreditApplied;
      const cnDeductions: { cn: APCreditNote; deduct: number }[] = [];
      for (const cn of selectedCNs) {
        if (creditRemaining <= 0) break;
        const take = Math.min(creditRemaining, cn.remaining_balance);
        cnDeductions.push({ cn, deduct: take });
        creditRemaining -= take;
      }

      // 2. Update CNs
      for (const { cn, deduct } of cnDeductions) {
        const newBalance = Math.max(0, cn.remaining_balance - deduct);
        const newStatus = newBalance <= 0.01 ? "fully_applied" : "approved";
        const { error } = await supabase
          .from("credit_notes")
          .update({
            remaining_balance: newBalance,
            status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", cn.id)
          .eq("tenant_id", tenantId);
        if (error) throw error;
      }

      // 3. Update invoices
      for (const inv of sortedInvoices) {
        const a = invAllocs[inv.id];
        if (!a) continue;
        const credit = Number(a.credit) || 0;
        const cash = Number(a.cash) || 0;
        const applied = credit + cash;
        if (applied <= 0) continue;
        const newBalance = Math.max(0, inv.outstanding_amount - applied);
        const newStatus = newBalance <= 0.01 ? "paid" : "partial";
        const { error } = await supabase
          .from("invoices")
          .update({
            remaining_balance: newBalance,
            amount_paid: (inv.amount_paid || 0) + applied,
            payment_status: newStatus,
          })
          .eq("id", inv.id)
          .eq("tenant_id", tenantId);
        if (error) throw error;
      }

      // 4. Insert payment + allocations
      const cashTotal = recordCash ? totalCash : 0;
      const hasAnyAlloc = totalCreditApplied > 0 || cashTotal > 0;
      if (hasAnyAlloc) {
        const cnSummary = selectedCNs.map((c) => c.credit_note_number).join(", ");
        const { data: payment, error: pErr } = await supabase
          .from("payments")
          .insert({
            supplier_id: supplierId,
            payment_date: paymentDate,
            amount: cashTotal,
            payment_method: cashTotal > 0 ? paymentMethod : "Credit Note",
            paid_from_account_id: cashTotal > 0 ? (bankAccountId || null) : null,
            reference_number: reference || null,
            notes: `Credit exercise — ${cnSummary}`,
            tenant_id: tenantId,
          } as any)
          .select()
          .single();
        if (pErr) throw pErr;

        // Allocations: walk CNs in order and distribute per invoice
        let cnIdx = 0;
        let cnLeft = cnDeductions[0]?.deduct ?? 0;
        for (const inv of sortedInvoices) {
          const a = invAllocs[inv.id];
          if (!a) continue;
          let need = Number(a.credit) || 0;
          const cash = recordCash ? Number(a.cash) || 0 : 0;
          if (need <= 0 && cash <= 0) continue;
          while (need > 0 && cnIdx < cnDeductions.length) {
            if (cnLeft <= 0) {
              cnIdx++;
              if (cnIdx >= cnDeductions.length) break;
              cnLeft = cnDeductions[cnIdx].deduct;
            }
            const portion = Math.min(need, cnLeft);
            const { error } = await supabase.from("payment_allocations").insert({
              payment_id: payment.id,
              invoice_id: inv.id,
              amount_allocated: 0,
              credit_note_id: cnDeductions[cnIdx].cn.id,
              credit_note_amount_applied: portion,
            } as any);
            if (error) throw error;
            need -= portion;
            cnLeft -= portion;
          }
          if (cash > 0) {
            const { error } = await supabase.from("payment_allocations").insert({
              payment_id: payment.id,
              invoice_id: inv.id,
              amount_allocated: cash,
              credit_note_id: null,
              credit_note_amount_applied: 0,
            } as any);
            if (error) throw error;
          }
        }
      }

      toast.success("Credits exercised successfully");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to exercise credits");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Exercise Credits — {supplierName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Step 1 — Select credits */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Available credits</div>
            {availableCNs.length === 0 ? (
              <div className="text-sm text-muted-foreground">No exercisable credits.</div>
            ) : (
              <div className="space-y-1.5">
                {availableCNs.map((cn) => (
                  <label key={cn.id} className="flex items-center gap-3 rounded-md border border-border/40 px-3 py-2 hover:bg-card/40">
                    <Checkbox checked={selectedCnIds.has(cn.id)} onCheckedChange={() => toggleCn(cn.id)} />
                    <div className="flex-1 grid grid-cols-3 gap-3 text-sm">
                      <div className="font-medium">{cn.credit_note_number}</div>
                      <div className="text-muted-foreground truncate">{cn.notes || "—"}</div>
                      <div className="text-right td-num text-green-400">HK$ {fmt(cn.remaining_balance)}</div>
                    </div>
                  </label>
                ))}
                <div className="text-right text-sm pt-2">
                  <span className="text-muted-foreground">Total credits selected: </span>
                  <span className="td-num text-green-400 font-semibold">HK$ {fmt(totalCredits)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Step 2 — Apply against invoices */}
          {sortedInvoices.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Apply against (oldest first)</div>
              <div className="space-y-1.5">
                {sortedInvoices.map((inv) => {
                  const a = invAllocs[inv.id] || { credit: "0.00", cash: "0.00" };
                  return (
                    <div key={inv.id} className="grid grid-cols-[1fr_120px_120px] gap-3 items-center rounded-md border border-border/40 px-3 py-2 text-sm">
                      <div>
                        <div className="font-medium">{inv.invoice_number}</div>
                        <div className="text-xs text-muted-foreground">{inv.invoice_date} • Outstanding HK$ {fmt(inv.outstanding_amount)}</div>
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Credit</Label>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 text-right td-num"
                          value={a.credit}
                          onChange={(e) => setInvAllocs((prev) => ({ ...prev, [inv.id]: { ...a, credit: e.target.value } }))}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Cash</Label>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-8 text-right td-num"
                          value={a.cash}
                          disabled={!recordCash}
                          onChange={(e) => setInvAllocs((prev) => ({ ...prev, [inv.id]: { ...a, cash: e.target.value } }))}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-right text-sm mt-2">
                <span className="text-muted-foreground">Net payment required: </span>
                <span className="td-num font-semibold">HK$ {fmt(netDue)}</span>
              </div>
            </div>
          )}

          {/* Step 3 — Record cash payment */}
          <div className="rounded-md border border-border/40 p-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={recordCash} onCheckedChange={(v) => setRecordCash(!!v)} />
              <span>Also record cash payment for the remaining balance</span>
            </label>
            {recordCash && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <Label>Payment method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Bank account</Label>
                  <Select value={bankAccountId} onValueChange={setBankAccountId}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.bank_name} {b.account_number_last4 ? `•••${b.account_number_last4}` : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Reference</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} />
                </div>
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || selectedCnIds.size === 0}>
            {saving ? "Saving..." : "Exercise credits"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
