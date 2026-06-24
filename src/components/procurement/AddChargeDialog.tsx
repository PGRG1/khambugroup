import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { APInvoice } from "@/hooks/usePayables";

const CHARGE_TYPES = ["Interest", "Late fee", "Bank charge", "Other"];

export function AddChargeDialog({
  open,
  onOpenChange,
  supplierId,
  supplierName,
  tenantId,
  openInvoices,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  supplierId: string;
  supplierName: string;
  tenantId: string;
  openInvoices: APInvoice[];
  onSaved: () => void;
}) {
  const [chargeType, setChargeType] = useState("Interest");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [linkedInvoiceId, setLinkedInvoiceId] = useState<string>("none");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setChargeType("Interest");
      setAmount("");
      setDate(new Date().toISOString().slice(0, 10));
      setDescription("");
      setReference("");
      setLinkedInvoiceId("none");
      setNotes("");
    }
  }, [open]);

  const handleSave = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!description.trim()) {
      toast.error("Description is required");
      return;
    }
    setSaving(true);
    try {
      const ts = Date.now();
      const invoiceNumber = `CHARGE-${ts}`;
      const linkedNote =
        linkedInvoiceId !== "none"
          ? `\nLinked invoice: ${openInvoices.find((i) => i.id === linkedInvoiceId)?.invoice_number || ""}`
          : "";
      const fullNotes = `[CHARGE:${chargeType}] ${description.trim()}${reference ? ` (Ref: ${reference})` : ""}${linkedNote}${notes ? `\n${notes}` : ""}`;
      const { error } = await supabase.from("invoices").insert({
        supplier_id: supplierId,
        invoice_date: date,
        invoice_number: invoiceNumber,
        total_amount: amt,
        remaining_balance: amt,
        amount_paid: 0,
        payment_status: "pending",
        status: "confirmed",
        review_status: "Approved",
        venue: "",
        notes: fullNotes,
        tenant_id: tenantId,
      } as any);
      if (error) throw error;
      toast.success(`Charge of HK$ ${amt.toFixed(2)} added to ${supplierName} ledger`);
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to add charge");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Charge — {supplierName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Charge type</Label>
              <Select value={chargeType} onValueChange={setChargeType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHARGE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (HK$)</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Reference (optional)</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Late payment interest Jun 2026" />
          </div>
          {openInvoices.length > 0 && (
            <div>
              <Label>Link to invoice (optional)</Label>
              <Select value={linkedInvoiceId} onValueChange={setLinkedInvoiceId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {openInvoices.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.invoice_number} — HK$ {i.outstanding_amount.toFixed(2)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Add charge"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
