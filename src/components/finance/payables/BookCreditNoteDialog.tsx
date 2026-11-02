import {currencySymbol,getBaseCurrency,baseAmount} from '@/utils/money';
import {lookupFxRate} from '@/hooks/useFxRate';
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { APInvoice } from "@/hooks/usePayables";

type SupplierTuple = [string, string]; // [id, name]

export function BookCreditNoteDialog({
  open,
  onOpenChange,
  suppliers,
  venues,
  invoices,
  defaultSupplierId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  suppliers: SupplierTuple[];
  venues: string[];
  invoices: APInvoice[];
  defaultSupplierId?: string;
  onSaved: () => void;
}) {
  const [supplierId, setSupplierId] = useState<string>("");
  const [cnNumber, setCnNumber] = useState("");
  const [cnDate, setCnDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [venue, setVenue] = useState<string>("none");
  const [sourceInvoiceId, setSourceInvoiceId] = useState<string>("none");
  const [status, setStatus] = useState<string>("approved");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [currency, setCurrency] = useState("");

  // Document currency: source invoice first, then the supplier's billing currency, else base.
  useEffect(() => {
    if (!open) return;
    const src = invoices.find((i) => i.id === sourceInvoiceId);
    if (src?.currency) { setCurrency(src.currency); return; }
    if (!supplierId) { setCurrency(getBaseCurrency()); return; }
    let live = true;
    void supabase.from("suppliers").select("default_currency").eq("id", supplierId).maybeSingle().then(({ data }) => { if (live) setCurrency(((data as any)?.default_currency as string) || getBaseCurrency()); });
    return () => { live = false; };
  }, [open, supplierId, sourceInvoiceId, invoices]);

  useEffect(() => {
    if (open) {
      setSupplierId(defaultSupplierId || "");
      setCnNumber("");
      setCnDate(new Date().toISOString().slice(0, 10));
      setAmount("");
      setVenue("none");
      setSourceInvoiceId("none");
      setStatus("approved");
      setNotes("");
    }
  }, [open, defaultSupplierId]);

  const supplierInvoices = useMemo(
    () =>
      invoices
        .filter((i) => i.supplier_id === supplierId && i.payment_status !== "voided")
        .sort((a, b) => (b.invoice_date || "").localeCompare(a.invoice_date || "")),
    [invoices, supplierId]
  );

  const save = async () => {
    const amt = Number(amount);
    if (!supplierId) return toast.error("Select a supplier");
    if (!amt || amt <= 0) return toast.error("Enter a credit note amount greater than 0");
    if (!cnDate) return toast.error("Select a credit note date");

    setSaving(true);
    const base = getBaseCurrency(), cur = (currency || base).toUpperCase();
    let fx: { currency: string; fx_rate?: number; original_currency_amount?: number; original_remaining?: number } = { currency: cur };
    let baseAmt = amt;
    if (cur !== base) {
      const tenant = (invoices[0] as any)?.tenant_id;
      const { data: t } = tenant ? { data: tenant } : await supabase.from("suppliers").select("tenant_id").eq("id", supplierId).maybeSingle().then(r => ({ data: (r.data as any)?.tenant_id }));
      const hit = t ? await lookupFxRate(t, cnDate, cur).catch(() => null) : null;
      if (!hit?.rate) { setSaving(false); return toast.error(`No ${cur} rate for ${cnDate}`); }
      baseAmt = baseAmount(amt, hit.rate, base);
      fx = { currency: cur, fx_rate: hit.rate, original_currency_amount: amt, original_remaining: amt };
    }
    const { error } = await (supabase as any).from("credit_notes").insert({
      ...fx,
      supplier_id: supplierId,
      credit_note_number: cnNumber.trim(),
      credit_note_date: cnDate,
      original_amount: baseAmt,
      remaining_balance: baseAmt,
      status,
      venue: venue === "none" ? null : venue,
      source_invoice_id: sourceInvoiceId === "none" ? null : sourceInvoiceId,
      notes,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Credit note booked");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Book Credit Note</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Record a supplier credit note. Approved credit notes become available to apply against open invoices.
          </p>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Supplier *</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="Select supplier…" /></SelectTrigger>
              <SelectContent>
                {suppliers.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Credit Note #</Label>
            <Input value={cnNumber} onChange={(e) => setCnNumber(e.target.value)} placeholder="e.g. CN-2026-0042" />
          </div>
          <div>
            <Label>Credit Note Date *</Label>
            <Input type="date" value={cnDate} onChange={(e) => setCnDate(e.target.value)} />
          </div>

          <div>
            <Label>Amount ({currencySymbol(currency || getBaseCurrency())}) *</Label>
            <Input aria-label="Credit note currency" className="mb-1" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="approved">Approved (available to apply)</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="needs_review">Needs Review</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Venue</Label>
            <Select value={venue} onValueChange={setVenue}>
              <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {venues.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Linked Invoice</Label>
            <Select value={sourceInvoiceId} onValueChange={setSourceInvoiceId} disabled={!supplierId}>
              <SelectTrigger><SelectValue placeholder={supplierId ? "Optional" : "Pick supplier first"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {supplierInvoices.slice(0, 100).map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {(i.invoice_number || "(no #)") + " · " + i.invoice_date}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for credit note, reference, etc." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Book Credit Note"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
