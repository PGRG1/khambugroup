import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { APInvoice, APBankAccountLite } from "@/hooks/usePayables";

const METHODS = ["Bank Transfer", "Cheque", "Cash", "FPS", "Credit Card", "Other"];

export function RecordPaymentDialog({
  open,
  onOpenChange,
  invoice,
  bankAccounts,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoice: APInvoice | null;
  bankAccounts: APBankAccountLite[];
  onSaved: () => void;
}) {
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<string>("Bank Transfer");
  const [bankAccountId, setBankAccountId] = useState<string>("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && invoice) {
      setDate(new Date().toISOString().slice(0, 10));
      setAmount(invoice.outstanding_amount.toFixed(2));
      setMethod(invoice.last_payment_method || "Bank Transfer");
      setBankAccountId(invoice.last_paid_from_account_id || (bankAccounts[0]?.id ?? ""));
      setReference("");
      setNotes("");
    }
  }, [open, invoice, bankAccounts]);

  if (!invoice) return null;

  const save = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    setSaving(true);
    const { error: payErr } = await supabase.from("invoice_payments").insert({
      invoice_id: invoice.id,
      payment_date: date,
      amount: amt,
      payment_method: method,
      bank_account_id: bankAccountId || null,
      reference,
      notes,
      match_status: "awaiting_bank_match",
    } as any);
    if (payErr) {
      toast.error(payErr.message);
      setSaving(false);
      return;
    }
    const newPaid = (invoice.amount_paid || 0) + amt;
    const newRemaining = Math.max(0, invoice.total_amount - newPaid);
    const newStatus = newRemaining <= 0.01 ? "paid" : "partially_paid";
    const { error: upErr } = await supabase
      .from("invoices")
      .update({
        amount_paid: newPaid,
        remaining_balance: newRemaining,
        payment_status: newStatus,
        payment_method: method,
        bank_match_status: "awaiting_bank_match",
      } as any)
      .eq("id", invoice.id);
    if (upErr) toast.error(upErr.message);
    else toast.success("Payment recorded");
    setSaving(false);
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {invoice.supplier_name} · Inv {invoice.invoice_number} · Outstanding HK$ {invoice.outstanding_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Payment Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Amount (HK$)</Label>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Paid From Account</Label>
            <Select value={bankAccountId || "__none"} onValueChange={(v) => setBankAccountId(v === "__none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— None —</SelectItem>
                {bankAccounts.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.account_name || b.bank_name} {b.account_number_last4 ? `•••${b.account_number_last4}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Reference</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque #, FPS ref, etc." />
          </div>
          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Record Payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
