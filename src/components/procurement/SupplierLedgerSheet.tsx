import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { downloadCSV } from "@/utils/csvDownload";
import type { APInvoice, APCreditNote, APBankAccountLite } from "@/hooks/usePayables";
import { RecordPaymentDialog } from "@/components/finance/payables/RecordPaymentDialog";
import { BookCreditNoteDialog } from "@/components/finance/payables/BookCreditNoteDialog";
import { ExerciseCreditDialog } from "./ExerciseCreditDialog";
import { AddChargeDialog } from "./AddChargeDialog";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = (n: number) => (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return `${String(dt.getDate()).padStart(2, "0")} ${MONTHS[dt.getMonth()]} ${String(dt.getFullYear()).slice(2)}`;
};

type LedgerType = "invoice" | "payment" | "credit_applied" | "credit_note" | "charge";

interface LedgerEntry {
  id: string;
  date: string;
  type: LedgerType;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

const TYPE_CONFIG: Record<LedgerType, { label: string; className: string }> = {
  invoice:        { label: "Invoice",     className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  payment:        { label: "Payment",     className: "bg-green-500/15 text-green-400 border-green-500/30" },
  credit_note:    { label: "Credit note", className: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  credit_applied: { label: "CN applied",  className: "bg-green-500/15 text-green-400 border-green-500/30" },
  charge:         { label: "Charge",      className: "bg-red-500/15 text-red-400 border-red-500/30" },
};

const PERIODS = [
  { value: "all", label: "All time" },
  { value: "month", label: "This month" },
  { value: "3m", label: "Last 3 months" },
  { value: "year", label: "This year" },
];

function periodStart(value: string): string | null {
  const now = new Date();
  if (value === "month") return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  if (value === "3m") return new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10);
  if (value === "year") return `${now.getFullYear()}-01-01`;
  return null;
}

export interface SupplierLedgerSheetProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  supplierId: string;
  supplierName: string;
  invoices: APInvoice[];
  allInvoices: APInvoice[];
  creditNotes: APCreditNote[];
  payments: any[];
  allocations: any[];
  bankAccounts: APBankAccountLite[];
  venues: string[];
  tenantId: string;
  onRefresh: () => void;
}

export function SupplierLedgerSheet({
  open,
  onOpenChange,
  supplierId,
  supplierName,
  invoices,
  allInvoices,
  creditNotes,
  payments,
  bankAccounts,
  venues,
  tenantId,
  onRefresh,
}: SupplierLedgerSheetProps) {
  const [period, setPeriod] = useState("all");
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payDialogInvoice, setPayDialogInvoice] = useState<APInvoice | null>(null);
  const [exerciseOpen, setExerciseOpen] = useState(false);
  const [bookCNOpen, setBookCNOpen] = useState(false);
  const [addChargeOpen, setAddChargeOpen] = useState(false);

  const availableCNs = useMemo(
    () => creditNotes.filter((c) => c.status === "approved" && c.remaining_balance > 0.01),
    [creditNotes]
  );
  const pendingCNs = useMemo(
    () => creditNotes.filter((c) => c.status === "draft" || c.status === "needs_review"),
    [creditNotes]
  );
  const historicalCNs = useMemo(
    () => creditNotes.filter((c) => c.status === "fully_applied" || c.status === "voided"),
    [creditNotes]
  );
  const availableCreditsTotal = availableCNs.reduce((s, c) => s + c.remaining_balance, 0);

  const openInvoices = useMemo(
    () => invoices.filter((i) => i.outstanding_amount > 0 && i.payment_status !== "voided"),
    [invoices]
  );

  // Build ledger
  const ledgerEntries = useMemo<LedgerEntry[]>(() => {
    const entries: Omit<LedgerEntry, "balance">[] = [];
    invoices.forEach((inv) => {
      const isCharge = inv.invoice_number?.startsWith("CHARGE-");
      entries.push({
        id: `inv-${inv.id}`,
        date: inv.invoice_date,
        type: isCharge ? "charge" : "invoice",
        reference: inv.invoice_number,
        description: isCharge ? "Charge / adjustment" : `Invoice — ${inv.venue || ""}`,
        debit: inv.total_amount,
        credit: 0,
      });
    });
    payments.forEach((p) => {
      const amt = Number(p.amount) || 0;
      if (amt > 0) {
        entries.push({
          id: `pay-${p.id}`,
          date: p.payment_date,
          type: "payment",
          reference: p.reference_number || p.payment_method || "",
          description: `Payment — ${p.payment_method || ""}`,
          debit: 0,
          credit: amt,
        });
      }
    });
    creditNotes
      .filter((cn) => cn.status !== "voided")
      .forEach((cn) => {
        const applied = cn.applied_amount || (cn.original_amount - cn.remaining_balance);
        if (applied > 0.01) {
          entries.push({
            id: `cna-${cn.id}`,
            date: cn.credit_note_date,
            type: "credit_applied",
            reference: cn.credit_note_number,
            description: `Credit applied — ${cn.notes || ""}`,
            debit: 0,
            credit: applied,
          });
        }
        if (cn.status !== "fully_applied") {
          entries.push({
            id: `cn-${cn.id}`,
            date: cn.credit_note_date,
            type: "credit_note",
            reference: cn.credit_note_number,
            description: `Credit note booked — ${cn.notes || ""}`,
            debit: 0,
            credit: 0,
          });
        }
      });
    const sorted = entries.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    let balance = 0;
    return sorted.map((e) => {
      balance = balance + e.debit - e.credit;
      return { ...e, balance };
    });
  }, [invoices, payments, creditNotes]);

  const filteredLedger = useMemo(() => {
    const start = periodStart(period);
    if (!start) return ledgerEntries;
    return ledgerEntries.filter((e) => e.date >= start);
  }, [ledgerEntries, period]);

  const totals = useMemo(() => {
    let dr = 0, cr = 0;
    for (const e of filteredLedger) { dr += e.debit; cr += e.credit; }
    return { dr, cr, net: dr - cr };
  }, [filteredLedger]);

  const netOutstanding = useMemo(
    () => invoices.reduce((s, i) => s + (i.outstanding_amount || 0), 0) - availableCreditsTotal,
    [invoices, availableCreditsTotal]
  );

  const handleApproveCN = async (cnId: string) => {
    const { error } = await supabase
      .from("credit_notes")
      .update({ status: "approved", updated_at: new Date().toISOString() })
      .eq("id", cnId)
      .eq("tenant_id", tenantId);
    if (error) toast.error("Failed to approve credit note");
    else { toast.success("Credit note approved — now available to exercise"); onRefresh(); }
  };

  const handleVoidCN = async (cnId: string) => {
    const { error } = await supabase
      .from("credit_notes")
      .update({ status: "voided", remaining_balance: 0, updated_at: new Date().toISOString() })
      .eq("id", cnId)
      .eq("tenant_id", tenantId);
    if (error) toast.error("Failed to void credit note");
    else { toast.success("Credit note voided"); onRefresh(); }
  };

  const exportLedger = () => {
    downloadCSV(
      filteredLedger.map((e) => ({
        date: e.date,
        type: TYPE_CONFIG[e.type].label,
        reference: e.reference,
        description: e.description,
        debit: e.debit.toFixed(2),
        credit: e.credit.toFixed(2),
        balance: e.balance.toFixed(2),
      })),
      [
        { key: "date", label: "Date" },
        { key: "type", label: "Type" },
        { key: "reference", label: "Reference" },
        { key: "description", label: "Description" },
        { key: "debit", label: "Debit" },
        { key: "credit", label: "Credit" },
        { key: "balance", label: "Balance" },
      ],
      `${supplierName.replace(/\s+/g, "_")}_ledger`
    );
  };

  const handlePayInvoice = (inv: APInvoice) => {
    setPayDialogInvoice(inv);
    setPayDialogOpen(true);
  };

  const allocCountByPayment = useMemo(() => {
    // approximate from invoice count
    return new Map<string, number>();
  }, []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-5xl p-0 overflow-y-auto">
        <SheetHeader className="p-5 border-b border-border sticky top-0 bg-background z-10">
          <SheetTitle className="text-xl">{supplierName}</SheetTitle>
          <div className="flex items-center justify-between flex-wrap gap-3 mt-2">
            <div className="flex items-center gap-6 text-sm">
              <div>
                <span className="text-muted-foreground">Outstanding: </span>
                <span className={`td-num font-semibold ${netOutstanding > 0 ? "text-amber-400" : "text-green-400"}`}>
                  HK$ {fmt(Math.abs(netOutstanding))} {netOutstanding > 0 ? "Dr" : "Cr"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Available credits: </span>
                <span className="td-num text-green-400 font-semibold">HK$ {fmt(availableCreditsTotal)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" onClick={() => {
                const oldest = openInvoices.sort((a, b) => (a.due_date || a.invoice_date).localeCompare(b.due_date || b.invoice_date))[0];
                if (oldest) handlePayInvoice(oldest);
                else toast.info("No open invoices to pay");
              }}>Record payment</Button>
              <Button size="sm" variant="outline" disabled={availableCreditsTotal === 0} onClick={() => setExerciseOpen(true)}>Exercise credit</Button>
              <Button size="sm" variant="outline" onClick={() => setBookCNOpen(true)}>Book credit note</Button>
              <Button size="sm" variant="outline" onClick={() => setAddChargeOpen(true)}>Add charge</Button>
              <Button size="sm" variant="ghost" onClick={exportLedger}>Export</Button>
            </div>
          </div>
        </SheetHeader>

        <div className="p-5">
          <Tabs defaultValue="ledger">
            <TabsList>
              <TabsTrigger value="ledger">Ledger</TabsTrigger>
              <TabsTrigger value="open">Open invoices ({openInvoices.length})</TabsTrigger>
              <TabsTrigger value="credits">Credits ({creditNotes.length})</TabsTrigger>
              <TabsTrigger value="payments">Payments ({payments.length})</TabsTrigger>
            </TabsList>

            {/* LEDGER */}
            <TabsContent value="ledger" className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground">{filteredLedger.length} entries</div>
              </div>
              <div className="overflow-x-auto rounded-md border border-border/40">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left py-2 px-3 w-[90px]">Date</th>
                      <th className="text-left py-2 px-3 w-[110px]">Type</th>
                      <th className="text-left py-2 px-3 w-[120px]">Reference</th>
                      <th className="text-left py-2 px-3">Description</th>
                      <th className="text-right py-2 px-3 w-[100px]">Debit</th>
                      <th className="text-right py-2 px-3 w-[100px]">Credit</th>
                      <th className="text-right py-2 px-3 w-[110px]">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLedger.length === 0 ? (
                      <tr><td colSpan={7} className="text-center text-muted-foreground py-6">No ledger entries.</td></tr>
                    ) : filteredLedger.map((e) => {
                      const cfg = TYPE_CONFIG[e.type];
                      return (
                        <tr key={e.id} className="border-b border-border/30">
                          <td className="py-2 px-3 td-num">{fmtDate(e.date)}</td>
                          <td className="py-2 px-3"><Badge variant="outline" className={`text-[10px] ${cfg.className}`}>{cfg.label}</Badge></td>
                          <td className="py-2 px-3 font-mono text-xs">{e.reference}</td>
                          <td className="py-2 px-3 truncate max-w-[300px]" title={e.description}>{e.description}</td>
                          <td className={`py-2 px-3 text-right td-num ${e.debit > 0 ? "text-amber-400" : "text-muted-foreground/40"}`}>{e.debit > 0 ? fmt(e.debit) : "—"}</td>
                          <td className={`py-2 px-3 text-right td-num ${e.credit > 0 ? "text-green-400" : "text-muted-foreground/40"}`}>{e.credit > 0 ? fmt(e.credit) : "—"}</td>
                          <td className={`py-2 px-3 text-right td-num ${e.balance > 0 ? "text-amber-400" : "text-green-400"}`}>{fmt(Math.abs(e.balance))} {e.balance >= 0 ? "Dr" : "Cr"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {filteredLedger.length > 0 && (
                    <tfoot>
                      <tr className="border-t border-border bg-muted/20 text-sm font-semibold">
                        <td colSpan={4} className="py-2 px-3 text-right text-muted-foreground">Totals</td>
                        <td className="py-2 px-3 text-right td-num text-amber-400">{fmt(totals.dr)}</td>
                        <td className="py-2 px-3 text-right td-num text-green-400">{fmt(totals.cr)}</td>
                        <td className={`py-2 px-3 text-right td-num ${totals.net > 0 ? "text-amber-400" : "text-green-400"}`}>{fmt(Math.abs(totals.net))} {totals.net >= 0 ? "Dr" : "Cr"}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </TabsContent>

            {/* OPEN INVOICES */}
            <TabsContent value="open" className="mt-4">
              <div className="overflow-x-auto rounded-md border border-border/40">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left py-2 px-3">Date</th>
                      <th className="text-left py-2 px-3">Invoice #</th>
                      <th className="text-left py-2 px-3">Venue</th>
                      <th className="text-right py-2 px-3">Total</th>
                      <th className="text-right py-2 px-3">Paid</th>
                      <th className="text-right py-2 px-3">Outstanding</th>
                      <th className="text-right py-2 px-3">Age</th>
                      <th className="text-right py-2 px-3">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openInvoices.length === 0 ? (
                      <tr><td colSpan={8} className="text-center text-muted-foreground py-6">No open invoices.</td></tr>
                    ) : openInvoices.map((inv) => (
                      <tr key={inv.id} className="border-b border-border/30">
                        <td className="py-2 px-3 td-num">{fmtDate(inv.invoice_date)}</td>
                        <td className="py-2 px-3 font-mono text-xs">{inv.invoice_number}</td>
                        <td className="py-2 px-3">{inv.venue || "—"}</td>
                        <td className="py-2 px-3 text-right td-num">{fmt(inv.total_amount)}</td>
                        <td className="py-2 px-3 text-right td-num text-muted-foreground">{fmt(inv.amount_paid)}</td>
                        <td className="py-2 px-3 text-right td-num text-amber-400">{fmt(inv.outstanding_amount)}</td>
                        <td className={`py-2 px-3 text-right td-num ${inv.age_days > 60 ? "text-red-400" : ""}`}>{inv.age_days}d</td>
                        <td className="py-2 px-3 text-right">
                          <Button size="sm" variant="outline" onClick={() => handlePayInvoice(inv)}>Pay this</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* CREDITS */}
            <TabsContent value="credits" className="mt-4 space-y-5">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => setBookCNOpen(true)}>Book new credit note</Button>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Available — exercisable</div>
                <CreditTable
                  rows={availableCNs}
                  showRemaining
                  actions={(cn) => (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setExerciseOpen(true)}>Exercise</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleVoidCN(cn.id)}>Void</Button>
                    </>
                  )}
                />
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Pending — not yet exercisable</div>
                <CreditTable
                  rows={pendingCNs}
                  showStatus
                  actions={(cn) => (
                    <>
                      <Button size="sm" variant="outline" onClick={() => handleApproveCN(cn.id)}>Approve</Button>
                      <Button size="sm" variant="ghost" onClick={() => handleVoidCN(cn.id)}>Void</Button>
                    </>
                  )}
                />
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Historical</div>
                <CreditTable rows={historicalCNs} showStatus />
              </div>
            </TabsContent>

            {/* PAYMENTS */}
            <TabsContent value="payments" className="mt-4">
              <div className="overflow-x-auto rounded-md border border-border/40">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="text-left py-2 px-3">Date</th>
                      <th className="text-right py-2 px-3">Amount</th>
                      <th className="text-left py-2 px-3">Method</th>
                      <th className="text-left py-2 px-3">Reference</th>
                      <th className="text-right py-2 px-3">Invoices settled</th>
                      <th className="text-left py-2 px-3">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.length === 0 ? (
                      <tr><td colSpan={6} className="text-center text-muted-foreground py-6">No payments recorded.</td></tr>
                    ) : [...payments]
                      .sort((a, b) => (b.payment_date || "").localeCompare(a.payment_date || ""))
                      .map((p) => (
                        <tr key={p.id} className="border-b border-border/30">
                          <td className="py-2 px-3 td-num">{fmtDate(p.payment_date)}</td>
                          <td className="py-2 px-3 text-right td-num text-green-400">{fmt(p.amount)}</td>
                          <td className="py-2 px-3">{p.payment_method}</td>
                          <td className="py-2 px-3 font-mono text-xs">{p.reference_number || "—"}</td>
                          <td className="py-2 px-3 text-right td-num">{allocCountByPayment.get(p.id) || 0}</td>
                          <td className="py-2 px-3"><Badge variant="outline" className="text-[10px]">{p.match_status || "—"}</Badge></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Dialogs */}
        <RecordPaymentDialog
          open={payDialogOpen}
          onOpenChange={(o) => { setPayDialogOpen(o); if (!o) setPayDialogInvoice(null); }}
          invoice={payDialogInvoice}
          supplierInvoices={allInvoices}
          bankAccounts={bankAccounts}
          creditNotes={availableCNs}
          onSaved={() => { setPayDialogOpen(false); setPayDialogInvoice(null); onRefresh(); }}
        />
        <ExerciseCreditDialog
          open={exerciseOpen}
          onOpenChange={setExerciseOpen}
          supplierId={supplierId}
          supplierName={supplierName}
          availableCNs={availableCNs}
          openInvoices={openInvoices}
          bankAccounts={bankAccounts}
          tenantId={tenantId}
          onSaved={() => { setExerciseOpen(false); onRefresh(); }}
        />
        <BookCreditNoteDialog
          open={bookCNOpen}
          onOpenChange={setBookCNOpen}
          suppliers={[[supplierId, supplierName]]}
          venues={venues}
          invoices={invoices}
          defaultSupplierId={supplierId}
          onSaved={() => { setBookCNOpen(false); onRefresh(); }}
        />
        <AddChargeDialog
          open={addChargeOpen}
          onOpenChange={setAddChargeOpen}
          supplierId={supplierId}
          supplierName={supplierName}
          tenantId={tenantId}
          openInvoices={openInvoices}
          onSaved={() => { setAddChargeOpen(false); onRefresh(); }}
        />
      </SheetContent>
    </Sheet>
  );
}

function CreditTable({
  rows,
  showRemaining,
  showStatus,
  actions,
}: {
  rows: APCreditNote[];
  showRemaining?: boolean;
  showStatus?: boolean;
  actions?: (cn: APCreditNote) => React.ReactNode;
}) {
  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground py-3">None.</div>;
  }
  const statusBadge = (s: string) => {
    if (s === "draft") return <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">Draft</Badge>;
    if (s === "needs_review") return <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30">Needs review</Badge>;
    if (s === "approved") return <Badge variant="outline" className="text-[10px] bg-green-500/15 text-green-400 border-green-500/30">Approved</Badge>;
    if (s === "fully_applied") return <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">Fully applied</Badge>;
    if (s === "voided") return <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground line-through">Voided</Badge>;
    return <Badge variant="outline" className="text-[10px]">{s}</Badge>;
  };
  return (
    <div className="overflow-x-auto rounded-md border border-border/40">
      <table className="w-full text-sm">
        <thead className="bg-muted/30">
          <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
            <th className="text-left py-2 px-3">CN #</th>
            <th className="text-left py-2 px-3">Date</th>
            <th className="text-right py-2 px-3">Original</th>
            {showRemaining && <th className="text-right py-2 px-3">Remaining</th>}
            {showStatus && <th className="text-left py-2 px-3">Status</th>}
            <th className="text-left py-2 px-3">Notes</th>
            {actions && <th className="text-right py-2 px-3">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((cn) => (
            <tr key={cn.id} className="border-b border-border/30">
              <td className="py-2 px-3 font-mono text-xs">{cn.credit_note_number}</td>
              <td className="py-2 px-3 td-num">{fmtDate(cn.credit_note_date)}</td>
              <td className="py-2 px-3 text-right td-num">{fmt(cn.original_amount)}</td>
              {showRemaining && <td className="py-2 px-3 text-right td-num text-green-400 font-semibold">{fmt(cn.remaining_balance)}</td>}
              {showStatus && <td className="py-2 px-3">{statusBadge(cn.status)}</td>}
              <td className="py-2 px-3 truncate max-w-[260px]" title={cn.notes}>{cn.notes || "—"}</td>
              {actions && <td className="py-2 px-3 text-right space-x-1">{actions(cn)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
