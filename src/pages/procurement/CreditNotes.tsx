import { useEffect, useMemo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Plus, Receipt, AlertTriangle, Paperclip, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { BookCreditNoteDialog } from "@/components/finance/payables/BookCreditNoteDialog";
import type { APInvoice } from "@/hooks/usePayables";

type CN = {
  id: string;
  credit_note_number: string | null;
  credit_note_date: string | null;
  original_amount: number | null;
  remaining_balance: number | null;
  status: string | null;
  supplier_id: string | null;
  source_invoice_id: string | null;
  venue: string | null;
  notes: string | null;
  attachment_url: string | null;
  created_at: string | null;
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return `${String(dt.getDate()).padStart(2, "0")} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}
function fmtMoney(n?: number | null) {
  const v = Number(n || 0);
  return v.toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, string> = {
    draft: "bg-secondary text-secondary-foreground",
    approved: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    fully_applied: "bg-green-500/15 text-green-400 border border-green-500/30",
    needs_review: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    voided: "bg-red-500/15 text-red-400 border border-red-500/30",
  };
  const label: Record<string, string> = {
    draft: "Draft",
    approved: "Approved",
    fully_applied: "Fully applied",
    needs_review: "Needs review",
    voided: "Voided",
  };
  const k = status || "draft";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${map[k] || map.draft}`}>
      {label[k] || k}
    </span>
  );
}

export default function CreditNotes() {
  const { tenantId } = useActiveTenant();
  const [loading, setLoading] = useState(true);
  const [creditNotes, setCreditNotes] = useState<CN[]>([]);
  const [supplierMap, setSupplierMap] = useState<Map<string, string>>(new Map());
  const [supplierTuples, setSupplierTuples] = useState<[string, string][]>([]);
  const [venues, setVenues] = useState<string[]>([]);
  const [invoices, setInvoices] = useState<APInvoice[]>([]);
  const [linkedInvoiceMap, setLinkedInvoiceMap] = useState<Map<string, string>>(new Map());
  const [disputedCount, setDisputedCount] = useState(0);

  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [venueFilter, setVenueFilter] = useState<string>("all");

  const [cnDialogOpen, setCnDialogOpen] = useState(false);
  const [selectedCn, setSelectedCn] = useState<CN | null>(null);

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const cns = await fetchAllRows(
        "credit_notes",
        "id, credit_note_number, credit_note_date, original_amount, remaining_balance, status, supplier_id, source_invoice_id, venue, notes, attachment_url, created_at",
        { col: "credit_note_date", asc: false },
        tenantId,
      );

      const suppliersRaw = await fetchAllRows("suppliers", "id, name", undefined, tenantId);
      const sMap = new Map<string, string>(suppliersRaw.map((s: any) => [s.id, s.name]));
      const sTuples: [string, string][] = suppliersRaw
        .filter((s: any) => s.name)
        .map((s: any) => [s.id, s.name] as [string, string])
        .sort((a, b) => a[1].localeCompare(b[1]));

      const venuesRaw = await fetchAllRows("invoices", "venue", undefined, tenantId);
      const vs = [...new Set((venuesRaw as any[]).map(v => v.venue).filter(Boolean))].sort() as string[];

      const { data: invoicesRaw } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, due_date, supplier_id, venue, total_amount, amount_paid, remaining_balance, payment_status, status")
        .eq("tenant_id", tenantId)
        .order("invoice_date", { ascending: false });

      const apInvoices: APInvoice[] = ((invoicesRaw as any[]) || []).map((i: any) => ({
        id: i.id,
        invoice_date: i.invoice_date,
        due_date: i.due_date,
        invoice_number: i.invoice_number || "",
        supplier_id: i.supplier_id,
        supplier_name: sMap.get(i.supplier_id) || "",
        venue: i.venue || "",
        total_amount: Number(i.total_amount || 0),
        amount_paid: Number(i.amount_paid || 0),
        outstanding_amount: Number(i.remaining_balance ?? (i.total_amount - i.amount_paid) ?? 0),
        age_days: 0,
        bucket: "",
        payment_status: i.payment_status || "",
        raw_payment_status: i.payment_status || "",
        bank_match_status: "",
        scheduled_payment_date: null,
        exception_note: null,
        last_payment_method: null,
        last_paid_from_account_id: null,
        last_paid_from_account_name: null,
        file_url: null,
      }));

      const linkedIds = cns.map((c: any) => c.source_invoice_id).filter(Boolean);
      const lMap = new Map<string, string>();
      if (linkedIds.length > 0) {
        const { data: linked } = await supabase
          .from("invoices")
          .select("id, invoice_number")
          .in("id", linkedIds);
        (linked || []).forEach((i: any) => lMap.set(i.id, i.invoice_number));
      }

      const { count } = await supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "disputed");

      setCreditNotes(cns as CN[]);
      setSupplierMap(sMap);
      setSupplierTuples(sTuples);
      setVenues(vs);
      setInvoices(apInvoices);
      setLinkedInvoiceMap(lMap);
      setDisputedCount(count || 0);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load credit notes");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return creditNotes.filter((cn) => {
      const supplierName = supplierMap.get(cn.supplier_id || "") || "";
      const invNum = linkedInvoiceMap.get(cn.source_invoice_id || "") || "";
      const matchesSearch = !q ||
        (cn.credit_note_number || "").toLowerCase().includes(q) ||
        supplierName.toLowerCase().includes(q) ||
        invNum.toLowerCase().includes(q);
      const matchesSupplier = supplierFilter === "all" || cn.supplier_id === supplierFilter;
      const matchesStatus = statusFilter === "all" || cn.status === statusFilter;
      const matchesVenue = venueFilter === "all" || cn.venue === venueFilter;
      return matchesSearch && matchesSupplier && matchesStatus && matchesVenue;
    });
  }, [creditNotes, search, supplierFilter, statusFilter, venueFilter, supplierMap, linkedInvoiceMap]);

  const summary = useMemo(() => {
    const available = creditNotes
      .filter((c) => c.status === "approved")
      .reduce((s, c) => s + Number(c.remaining_balance || 0), 0);
    const pending = creditNotes.filter((c) => c.status === "draft" || c.status === "needs_review").length;
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const appliedThisMonth = creditNotes
      .filter((c) => c.status === "fully_applied" && (c.created_at || "").startsWith(ym))
      .reduce((s, c) => s + (Number(c.original_amount || 0) - Number(c.remaining_balance || 0)), 0);
    return { available, pending, appliedThisMonth };
  }, [creditNotes]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-display">
            <span className="text-gradient-gold">Credit & Debit Notes</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track formal supplier credit notes and debit notes.
          </p>
        </div>
        <Button
          onClick={() => setCnDialogOpen(true)}
          className="bg-amber-500 hover:bg-amber-600 text-black"
        >
          <Plus className="h-4 w-4 mr-1" /> New credit note
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="text-xs text-amber-400/80 uppercase tracking-wide">Available credits</div>
            <div className="text-2xl font-bold text-amber-400 mt-1 td-num">${fmtMoney(summary.available)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">ready to apply</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Pending review</div>
            <div className="text-2xl font-bold mt-1 td-num">{summary.pending}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">awaiting approval</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">Applied this month</div>
            <div className="text-2xl font-bold mt-1 td-num">${fmtMoney(summary.appliedThisMonth)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">fully applied</div>
          </CardContent>
        </Card>
      </div>

      {/* Disputed banner */}
      {disputedCount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            <span>
              {disputedCount} disputed invoice{disputedCount === 1 ? "" : "s"} may require a credit note from the supplier.
            </span>
          </div>
          <Link
            to="/procurement/invoices?status=disputed"
            className="text-sm text-amber-400 hover:text-amber-300 font-medium whitespace-nowrap"
          >
            View disputed invoices →
          </Link>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search CN#, supplier, invoice..."
            className="pl-8 h-9"
          />
        </div>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="All suppliers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All suppliers</SelectItem>
            {supplierTuples.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="fully_applied">Fully applied</SelectItem>
            <SelectItem value="needs_review">Needs review</SelectItem>
            <SelectItem value="voided">Voided</SelectItem>
          </SelectContent>
        </Select>
        <Select value={venueFilter} onValueChange={setVenueFilter}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="All venues" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All venues</SelectItem>
            {venues.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="credit">
        <TabsList>
          <TabsTrigger value="credit">Credit Notes ({filtered.length})</TabsTrigger>
          <TabsTrigger value="debit">Debit Notes (0)</TabsTrigger>
        </TabsList>

        <TabsContent value="credit" className="mt-3">
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <Receipt className="h-8 w-8 mx-auto text-muted-foreground" />
                  <div className="text-base font-medium">No credit notes yet</div>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Credit notes are created when suppliers issue a formal credit document outside of an invoice.
                  </p>
                  <Button
                    onClick={() => setCnDialogOpen(true)}
                    className="bg-amber-500 hover:bg-amber-600 text-black"
                  >
                    <Plus className="h-4 w-4 mr-1" /> New credit note
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium" style={{ width: 100 }}>CN #</th>
                        <th className="text-left px-3 py-2 font-medium" style={{ width: 80 }}>Date</th>
                        <th className="text-left px-3 py-2 font-medium" style={{ width: 120 }}>Supplier</th>
                        <th className="text-left px-3 py-2 font-medium" style={{ width: 70 }}>Venue</th>
                        <th className="text-left px-3 py-2 font-medium" style={{ width: 100 }}>Linked invoice</th>
                        <th className="text-right px-3 py-2 font-medium" style={{ width: 70 }}>Original</th>
                        <th className="text-right px-3 py-2 font-medium" style={{ width: 70 }}>Applied</th>
                        <th className="text-right px-3 py-2 font-medium" style={{ width: 70 }}>Remaining</th>
                        <th className="text-left px-3 py-2 font-medium" style={{ width: 90 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((cn) => {
                        const supplierName = supplierMap.get(cn.supplier_id || "") || "—";
                        const invNum = linkedInvoiceMap.get(cn.source_invoice_id || "") || "—";
                        const applied = Number(cn.original_amount || 0) - Number(cn.remaining_balance || 0);
                        const remaining = Number(cn.remaining_balance || 0);
                        return (
                          <tr
                            key={cn.id}
                            onClick={() => setSelectedCn(cn)}
                            className="border-t border-border/40 cursor-pointer hover:bg-muted/40 hover:border-l-[3px] hover:border-l-amber-500 transition-colors"
                          >
                            <td className="px-3 py-2 font-mono font-semibold">{cn.credit_note_number || "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground">{fmtDate(cn.credit_note_date)}</td>
                            <td className="px-3 py-2 truncate" title={supplierName}>{supplierName}</td>
                            <td className="px-3 py-2 text-muted-foreground">{cn.venue || "—"}</td>
                            <td className="px-3 py-2 font-mono text-xs">{invNum}</td>
                            <td className="px-3 py-2 text-right td-num">${fmtMoney(cn.original_amount)}</td>
                            <td className="px-3 py-2 text-right td-num text-muted-foreground">${fmtMoney(applied)}</td>
                            <td className={`px-3 py-2 text-right td-num ${remaining > 0 ? "text-amber-400 font-semibold" : "text-muted-foreground"}`}>
                              ${fmtMoney(remaining)}
                            </td>
                            <td className="px-3 py-2"><StatusBadge status={cn.status} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="debit" className="mt-3">
          <Card>
            <CardContent className="p-12 text-center space-y-2">
              <div className="text-base font-medium">Debit notes coming soon</div>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Used when you need to formally notify a supplier of an amount they owe you.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail Sheet */}
      <Sheet open={!!selectedCn} onOpenChange={(o) => !o && setSelectedCn(null)}>
        <SheetContent className="sm:max-w-[560px] overflow-y-auto">
          {selectedCn && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono">{selectedCn.credit_note_number || "(no number)"}</SheetTitle>
                <SheetDescription>
                  {(supplierMap.get(selectedCn.supplier_id || "") || "—")} · {fmtDate(selectedCn.credit_note_date)}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 mt-4">
                <Card>
                  <CardContent className="p-4 space-y-2 text-sm">
                    <Row label="Supplier" value={supplierMap.get(selectedCn.supplier_id || "") || "—"} />
                    <Row label="Date" value={fmtDate(selectedCn.credit_note_date)} />
                    <Row label="Venue" value={selectedCn.venue || "—"} />
                    <Row
                      label="Linked invoice"
                      value={
                        selectedCn.source_invoice_id
                          ? (linkedInvoiceMap.get(selectedCn.source_invoice_id) || "—")
                          : "—"
                      }
                      mono
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Status</span>
                      <StatusBadge status={selectedCn.status} />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 space-y-2 text-sm">
                    <Row label="Original amount" value={`$${fmtMoney(selectedCn.original_amount)}`} num />
                    <Row
                      label="Applied"
                      value={`$${fmtMoney(Number(selectedCn.original_amount || 0) - Number(selectedCn.remaining_balance || 0))}`}
                      num
                    />
                    <Row
                      label="Remaining balance"
                      value={`$${fmtMoney(selectedCn.remaining_balance)}`}
                      num
                      highlight={Number(selectedCn.remaining_balance || 0) > 0}
                    />
                  </CardContent>
                </Card>

                {selectedCn.notes && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Notes</div>
                    <p className="text-sm whitespace-pre-wrap rounded-md border border-border/50 bg-muted/20 p-3">
                      {selectedCn.notes}
                    </p>
                  </div>
                )}

                {selectedCn.attachment_url && (
                  <a
                    href={selectedCn.attachment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300"
                  >
                    <Paperclip className="h-4 w-4" />
                    View attachment →
                  </a>
                )}
              </div>

              <SheetFooter className="mt-6">
                <Button variant="ghost" onClick={() => setSelectedCn(null)}>Close</Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* New CN dialog */}
      <BookCreditNoteDialog
        open={cnDialogOpen}
        onOpenChange={setCnDialogOpen}
        suppliers={supplierTuples}
        venues={venues}
        invoices={invoices}
        onSaved={() => {
          setCnDialogOpen(false);
          fetchData();
        }}
      />
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  num,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  num?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between items-center gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={[
          mono ? "font-mono text-xs" : "",
          num ? "td-num" : "",
          highlight ? "text-amber-400 font-semibold" : "",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}
