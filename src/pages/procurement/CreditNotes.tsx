import { useEffect, useMemo, useState, useCallback } from "react";
import { useVenueScope } from "@/hooks/useVenueScope";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Paperclip, Download, MoreHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { BookCreditNoteDialog } from "@/components/finance/payables/BookCreditNoteDialog";
import type { APInvoice } from "@/hooks/usePayables";
import { RevenuePageTop } from "@/components/revenue/RevenuePageTop";
import { Toolbar, FilterPanel, FilterGroup, SortMenu } from "@/components/kit";
import { usePeriodFilter } from "@/hooks/usePeriodFilter";
import { usePagination } from "@/components/common/data-table";
import { downloadCSV } from "@/utils/csvDownload";
import { formatDate, formatTableCurrency, formatTableInteger } from "@/utils/format";

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

const STATUS_LABEL: Record<string, string> = { draft: "Draft", approved: "Approved", fully_applied: "Fully applied", needs_review: "Needs review", voided: "Voided" };
const STATUS_TONE: Record<string, string> = { draft: "text-muted-foreground", approved: "text-primary", fully_applied: "text-muted-foreground", needs_review: "text-warning", voided: "text-destructive" };
const statusWord = (s: string | null) => STATUS_LABEL[s || "draft"] || s || "Draft";
const isImage = (url: string) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);

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
  const [sort, setSort] = useState("newest");
  const [kind, setKind] = useState<"credit" | "debit">("credit");
  const venueScope = useVenueScope();

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
        review_status: null,
        is_disputed: false,
        dispute_notes: null,
        venue: i.venue || "",
        total_amount: Number(i.total_amount || 0),
        amount_paid: Number(i.amount_paid || 0),
        held_amount: 0,
        outstanding_amount: Number(i.remaining_balance ?? (Number(i.total_amount || 0) - Number(i.amount_paid || 0))),
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
        supplier_account_id: null,
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

  const period = usePeriodFilter(creditNotes.map(c => c.credit_note_date || ""), "all");
  // Debit notes are not stored yet; the switch appears only once any exist.
  const debitNotes: CN[] = [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = creditNotes.filter((cn) => {
      const supplierName = supplierMap.get(cn.supplier_id || "") || "";
      const invNum = linkedInvoiceMap.get(cn.source_invoice_id || "") || "";
      const matchesSearch = !q ||
        (cn.credit_note_number || "").toLowerCase().includes(q) ||
        supplierName.toLowerCase().includes(q) ||
        invNum.toLowerCase().includes(q);
      const matchesSupplier = supplierFilter === "all" || cn.supplier_id === supplierFilter;
      const matchesStatus = statusFilter === "all" || cn.status === statusFilter;
      const matchesVenue = venueScope.includesName(cn.venue);
      return matchesSearch && matchesSupplier && matchesStatus && matchesVenue && period.inPeriod(cn.credit_note_date);
    });
    const name = (c: CN) => supplierMap.get(c.supplier_id || "") || "";
    return list.sort((a, b) => sort === "oldest" ? (a.credit_note_date || "").localeCompare(b.credit_note_date || "")
      : sort === "amount" ? Number(b.original_amount || 0) - Number(a.original_amount || 0)
      : sort === "left" ? Number(b.remaining_balance || 0) - Number(a.remaining_balance || 0)
      : sort === "supplier" ? name(a).localeCompare(name(b))
      : (b.credit_note_date || "").localeCompare(a.credit_note_date || ""));
  }, [creditNotes, search, supplierFilter, statusFilter, venueScope.includesName, supplierMap, linkedInvoiceMap, period.inPeriod, sort]);

  const leftToUse = filtered.filter(c => c.status === "approved").reduce((s, c) => s + Number(c.remaining_balance || 0), 0);
  const pag = usePagination(filtered, 25);
  useEffect(() => { pag.setPage(1); }, [search, supplierFilter, statusFilter, sort, period.label, venueScope.label]);

  const supplierOf = (c: CN) => supplierMap.get(c.supplier_id || "") || "—";
  const invoiceOf = (c: CN) => (c.source_invoice_id && linkedInvoiceMap.get(c.source_invoice_id)) || "";

  const download = () => downloadCSV(filtered.map(c => ({
    date: c.credit_note_date ? formatDate(c.credit_note_date) : "", supplier: supplierOf(c), number: c.credit_note_number || "",
    invoice: invoiceOf(c), venue: c.venue || "", amount: Number(c.original_amount || 0).toFixed(2), left: Number(c.remaining_balance || 0).toFixed(2), status: statusWord(c.status),
  })), [
    { key: "date", label: "Date" }, { key: "supplier", label: "Supplier" }, { key: "number", label: "Note #" }, { key: "invoice", label: "For invoice" },
    { key: "venue", label: "Venue" }, { key: "amount", label: "Amount" }, { key: "left", label: "Left" }, { key: "status", label: "Status" },
  ], "credit_notes");

  const missing = (c: CN) => {
    const parts: string[] = [];
    if ((c.status || "draft") === "draft") parts.push("still a draft");
    if (!c.credit_note_number) parts.push("has no credit note number");
    if (!c.source_invoice_id) parts.push("isn't linked to an invoice");
    if (!parts.length) return null;
    return `This note ${parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1] : parts[0]}.`;
  };

  const sortOptions = [{ key: "newest", label: "Newest first", compactLabel: "Newest" }, { key: "oldest", label: "Oldest first", compactLabel: "Oldest" }, { key: "amount", label: "Highest amount", compactLabel: "Amount" }, { key: "left", label: "Most left to use", compactLabel: "Left" }, { key: "supplier", label: "Supplier A–Z", compactLabel: "A–Z" }];
  const activeFilters = Number(supplierFilter !== "all") + Number(statusFilter !== "all");
  const filter = (
    <FilterPanel activeCount={activeFilters} onReset={() => { setSupplierFilter("all"); setStatusFilter("all"); }} width={320}>
      <FilterGroup title="Supplier">
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger aria-label="Supplier"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All suppliers</SelectItem>{supplierTuples.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent>
        </Select>
      </FilterGroup>
      <FilterGroup title="Status">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All statuses</SelectItem>{Object.entries(STATUS_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
        </Select>
      </FilterGroup>
      <FilterGroup title="Venue">
        <p className="text-[13px] text-muted-foreground">{venueScope.label}</p>
        <div className="flex flex-wrap gap-1.5">{venueScope.venues.map(v => <Button key={v.id} variant="outline" size="sm" aria-pressed={venueScope.includesId(v.id)} onClick={() => venueScope.toggleVenue(v.id)}>{v.name}</Button>)}</div>
      </FilterGroup>
      <div className="min-[641px]:hidden"><FilterGroup title="Sort"><SortMenu value={sort} onChange={setSort} options={sortOptions} /></FilterGroup></div>
    </FilterPanel>
  );
  const segmented = debitNotes.length > 0 && (
    <div className="kit-seg shrink-0" aria-label="Note type">
      {([["credit", "Credit notes"], ["debit", "Debit notes"]] as const).map(([k, l]) => <Button key={k} variant="ghost" className="!h-8 !min-h-8 !px-2" aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</Button>)}
    </div>
  );
  const rowKeys = (open: () => void) => ({ tabIndex: 0, onClick: open, onKeyDown: (e: React.KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } } });
  const muted = (text: string) => <span className="text-muted-foreground">{text}</span>;

  return (
    <div className="w-full mx-auto space-y-6 min-w-0 max-[640px]:pb-24">
      <RevenuePageTop title="Credit & Debit Notes" actionsBesideTitle
        actions={<Button onClick={() => setCnDialogOpen(true)} className="h-9 px-3 min-[641px]:h-10"><Plus className="h-4 w-4 mr-1.5" /><span className="min-[641px]:hidden">Add</span><span className="max-[640px]:hidden">Add credit note</span></Button>}
        period={period.control} />
      <div data-invoice-tabs-host />

      <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Credit notes">
        <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5">
          <span>{period.label}</span>
          <span className="text-[13px] text-muted-foreground font-normal">· {formatTableInteger(filtered.length)} credit note{filtered.length === 1 ? "" : "s"} · {formatTableCurrency(leftToUse)} left to use</span>
        </h2>
        {disputedCount > 0 && (
          <p className="px-1 text-[13px] text-warning">
            {disputedCount} disputed invoice{disputedCount === 1 ? "" : "s"} may need a credit note from the supplier ·{" "}
            <Link to="/procurement/invoices?status=disputed" className="underline underline-offset-2 font-medium">View</Link>
          </p>
        )}
        <Toolbar mobileSearchBelow searchAfterControls search={search} onSearch={setSearch} placeholder="Search note #, supplier or invoice #"
          filter={<>{segmented}{filter}</>}
          sort={<div className="max-[640px]:hidden"><SortMenu value={sort} onChange={setSort} options={sortOptions} /></div>}
          downloadControl={<Button variant="outline" size="icon" className="kit-btn kit-tool-btn kit-btn-icon" aria-label="Download credit notes" title="Download CSV" onClick={download}><Download className="h-4 w-4" /></Button>} />

        {loading ? <p className="p-10 text-center text-sm text-muted-foreground">Loading credit notes…</p>
          : !filtered.length ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-sm text-muted-foreground">No credit notes match this period and filters.</p>
              <Button variant="outline" onClick={() => setCnDialogOpen(true)}><Plus className="h-4 w-4 mr-1" />Add credit note</Button>
            </div>
          ) : <>
            <ul className="min-[641px]:hidden divide-y divide-border/60" aria-label="Credit note list">
              {pag.pageItems.map(c => (
                <li key={c.id} className="px-2 py-3">
                  <Button variant="ghost" className="block w-full h-auto p-0 text-left font-normal hover:bg-transparent" onClick={() => setSelectedCn(c)}>
                    <span className="flex justify-between gap-2 text-[13px]"><span className="min-w-0 whitespace-normal">{supplierOf(c)}</span><span className="td-num shrink-0">{formatTableCurrency(Number(c.original_amount || 0))}</span></span>
                    <span className="block mt-1 text-xs text-muted-foreground whitespace-normal">{c.credit_note_date ? formatDate(c.credit_note_date) : "—"} · {c.credit_note_number || "No number"} · <span className={STATUS_TONE[c.status || "draft"]}>{statusWord(c.status)}</span></span>
                  </Button>
                </li>
              ))}
            </ul>
            <div className="kit hidden min-[641px]:block">
              <table className="sales-table !w-full !table-fixed" aria-label="Credit notes table">
                <thead><tr>
                  <th className="sales-cell-left w-[12%]">Date</th><th className="sales-cell-left">Supplier</th><th className="sales-cell-left w-[14%]">Note #</th>
                  <th className="sales-cell-left w-[14%]">For invoice</th><th className="sales-cell-right w-[12%]">Amount</th><th className="sales-cell-right w-[12%]">Left</th><th className="sales-cell-left w-[12%]">Status</th>
                </tr></thead>
                <tbody>
                  {pag.pageItems.map(c => (
                    <tr key={c.id} className="sales-record-row" {...rowKeys(() => setSelectedCn(c))}>
                      <td className="sales-cell-left">{c.credit_note_date ? formatDate(c.credit_note_date) : "—"}</td>
                      <td className="sales-cell-left !whitespace-normal break-words">{supplierOf(c)}</td>
                      <td className="sales-cell-left td-num break-all !whitespace-normal">{c.credit_note_number || muted("No number")}</td>
                      <td className="sales-cell-left td-num break-all !whitespace-normal">{invoiceOf(c) || muted("Not linked")}</td>
                      <td className="td-num">{formatTableCurrency(Number(c.original_amount || 0))}</td>
                      <td className="td-num">{formatTableCurrency(Number(c.remaining_balance || 0))}</td>
                      <td className={`sales-cell-left ${STATUS_TONE[c.status || "draft"]}`}>{statusWord(c.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>}
        {pag.totalPages > 1 && (
          <div className="flex justify-between items-center gap-2 kit-divider pt-2 text-xs text-muted-foreground">
            <span className="td-num">{formatTableInteger(pag.rangeStart)}–{formatTableInteger(pag.rangeEnd)} of {formatTableInteger(pag.total)}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" aria-label="Previous page" className="h-8 w-8" disabled={pag.page <= 1} onClick={() => pag.setPage(pag.page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label="Next page" className="h-8 w-8" disabled={pag.page >= pag.totalPages} onClick={() => pag.setPage(pag.page + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </section>

      <Dialog open={!!selectedCn} onOpenChange={(o) => !o && setSelectedCn(null)}>
        <DialogContent className="kit sales-day-dialog bg-background max-w-[640px] grid-cols-[minmax(0,1fr)] p-0 gap-0 w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] rounded-lg overflow-y-auto">
          {selectedCn && (() => {
            const note = missing(selectedCn);
            return (
              <div className="min-w-0 p-5 sm:p-7 space-y-5">
                <div className="pr-8 space-y-1.5">
                  <DialogTitle className="text-[16px] break-words">{supplierOf(selectedCn)}</DialogTitle>
                  <DialogDescription className="text-[13px]">Credit note · {selectedCn.credit_note_number || "no number"} · {statusWord(selectedCn.status)}</DialogDescription>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13px]">
                  {[["Date", selectedCn.credit_note_date ? formatDate(selectedCn.credit_note_date) : "—"], ["Venue", selectedCn.venue || "—"], ["Amount", formatTableCurrency(Number(selectedCn.original_amount || 0))], ["Left to use", formatTableCurrency(Number(selectedCn.remaining_balance || 0))]].map(([l, v]) => (
                    <div key={l} className="min-w-0"><p className="kit-group-h mb-1">{l}</p><p className="td-num break-words">{v}</p></div>
                  ))}
                </div>
                {note && <p className="text-[13px] text-warning">{note}</p>}
                <div>
                  <p className="kit-group-h mb-2">Attachment</p>
                  {selectedCn.attachment_url ? (
                    <a href={selectedCn.attachment_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[13px] text-primary">
                      {isImage(selectedCn.attachment_url) ? <img src={selectedCn.attachment_url} alt="Credit note attachment" className="h-24 w-auto rounded-md border border-border object-cover" /> : <><Paperclip className="h-4 w-4" />Open attachment</>}
                    </a>
                  ) : <p className="text-[13px] text-muted-foreground">No attachment</p>}
                </div>
                {selectedCn.notes && <div><p className="kit-group-h mb-1">Notes</p><p className="text-[13px] whitespace-pre-wrap">{selectedCn.notes}</p></div>}
                <div className="flex items-center justify-between gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="outline" className="kit-btn kit-btn-secondary"><MoreHorizontal className="h-4 w-4 mr-1" />More</Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem disabled={!selectedCn.attachment_url} onSelect={() => selectedCn.attachment_url && window.open(selectedCn.attachment_url, "_blank", "noopener")}>Open attachment</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button className="kit-btn kit-btn-primary" onClick={() => setSelectedCn(null)}>Close</Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

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
