import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  ScanLine, Receipt, FileSpreadsheet, CreditCard, Landmark, FileSignature,
  Users, Wallet, MoreHorizontal, Eye, Search, Calendar, Filter,
  FileText, AlertTriangle, ShieldCheck, Link2, XCircle, Layers, ArrowDownUp, Columns3,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useInvoiceData } from "@/hooks/useInvoiceData";
import AttachmentViewerDialog from "@/components/invoices/AttachmentViewerDialog";

type DocType =
  | "all" | "daily_sales" | "invoice" | "settlement" | "bank_statement"
  | "contract" | "payroll" | "petty_cash" | "other";

const TYPE_TILES: { key: DocType; label: string; icon: any }[] = [
  { key: "all", label: "All Types", icon: Layers },
  { key: "daily_sales", label: "Daily Sales / EOD Report", icon: Receipt },
  { key: "invoice", label: "Invoice / Bill", icon: FileSpreadsheet },
  { key: "settlement", label: "Payment Processor / Settlement", icon: CreditCard },
  { key: "bank_statement", label: "Bank Statement", icon: Landmark },
  { key: "contract", label: "Contract / Agreement", icon: FileSignature },
  { key: "payroll", label: "Payroll File", icon: Users },
  { key: "petty_cash", label: "Petty Cash Receipt", icon: Wallet },
  { key: "other", label: "Other", icon: MoreHorizontal },
];

const PICKER_TYPES = TYPE_TILES.filter((t) => t.key !== "all");

const STATUSES = ["Extracted", "Needs Review", "Needs Approval", "Linked", "Failed", "Archived"] as const;
type DocStatus = typeof STATUSES[number];

const statusChip = (s: DocStatus) => {
  switch (s) {
    case "Extracted": return "chip chip-success";
    case "Linked": return "chip chip-info";
    case "Needs Review": return "chip chip-warn";
    case "Needs Approval": return "chip chip-warn";
    case "Failed": return "chip chip-danger";
    case "Archived": return "chip chip-neutral";
  }
};

const typeChip = (label: string) => {
  // soft colored pill for document type column
  const map: Record<string, string> = {
    "Daily Sales / EOD Report": "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20",
    "Invoice / Bill": "bg-sky-500/10 text-sky-300 border border-sky-500/20",
    "Payment Processor / Settlement": "bg-violet-500/10 text-violet-300 border border-violet-500/20",
    "Bank Statement": "bg-amber-500/10 text-amber-300 border border-amber-500/20",
    "Contract / Agreement": "bg-orange-500/10 text-orange-300 border border-orange-500/20",
    "Payroll File": "bg-pink-500/10 text-pink-300 border border-pink-500/20",
    "Petty Cash Receipt": "bg-fuchsia-500/10 text-fuchsia-300 border border-fuchsia-500/20",
    "Other": "bg-zinc-500/10 text-zinc-300 border border-zinc-500/20",
  };
  return `inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${map[label] || map["Other"]}`;
};

function KpiTile({ icon: Icon, label, value, hint, tone }: {
  icon: any; label: string; value: string | number; hint: string; tone: "info" | "warn" | "approval" | "linked" | "danger";
}) {
  const tones: Record<string, string> = {
    info: "bg-sky-500/10 text-sky-400",
    warn: "bg-amber-500/10 text-amber-400",
    approval: "bg-violet-500/10 text-violet-400",
    linked: "bg-emerald-500/10 text-emerald-400",
    danger: "bg-rose-500/10 text-rose-400",
  };
  const hintTones: Record<string, string> = {
    info: "text-emerald-400",
    warn: "text-amber-400",
    approval: "text-muted-foreground",
    linked: "text-muted-foreground",
    danger: "text-rose-400",
  };
  return (
    <Card className="card-glass p-4">
      <div className="flex items-start gap-3">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-display font-semibold td-num mt-0.5">{value}</div>
          <div className={`text-xs mt-0.5 ${hintTones[tone]}`}>{hint}</div>
        </div>
      </div>
    </Card>
  );
}

export default function DocumentCentre() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { invoices, suppliers } = useInvoiceData();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUrl, setViewerUrl] = useState("");
  const [viewerTitle, setViewerTitle] = useState("");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<DocType>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const ALL_COLUMNS = [
    { key: "file_name", label: "File Name" },
    { key: "doc_type", label: "Document Type" },
    { key: "source", label: "Source Workflow" },
    { key: "linked", label: "Linked Record" },
    { key: "status", label: "Status" },
    { key: "uploaded_at", label: "Uploaded Date" },
    { key: "uploaded_by", label: "Uploaded By" },
  ] as const;
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_COLUMNS.map((c) => [c.key, true])),
  );
  type SortKey = "uploaded_at" | "file_name" | "doc_type" | "status";
  const [sortKey, setSortKey] = useState<SortKey>("uploaded_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const SORT_LABELS: Record<SortKey, string> = {
    uploaded_at: "Uploaded Date",
    file_name: "File Name",
    doc_type: "Document Type",
    status: "Status",
  };

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const handlePick = (type: DocType) => {
    setPickerOpen(false);
    if (type === "daily_sales") navigate("/?scan=1");
    else if (type === "invoice") navigate("/procurement/invoices?scan=1");
    else if (type === "settlement") navigate("/finance/payments-settlements");
    else toast({ title: "Coming soon", description: `${PICKER_TYPES.find(t => t.key === type)?.label} workflow is not yet available.` });
  };

  const supplierMap = useMemo(() => {
    const m = new Map<string, string>();
    (suppliers || []).forEach((s: any) => m.set(s.id, s.name));
    return m;
  }, [suppliers]);

  const toDocStatus = (inv: any): DocStatus => {
    const s = (inv.status || "").toLowerCase();
    if (s === "cancelled" || s === "archived") return "Archived";
    if (s === "disputed" || s === "failed") return "Failed";
    if (s === "pending") return "Needs Review";
    if (s === "verified") return "Needs Approval";
    if (inv.supplier_id && inv.invoice_number) return "Linked";
    return "Extracted";
  };

  const docs = useMemo(() => {
    return (invoices || [])
      .filter((inv: any) => inv.file_url || inv.file_name)
      .map((inv: any) => ({
        id: inv.id,
        file_name: inv.file_name || "—",
        file_size: inv.file_size_kb ? `${(inv.file_size_kb / 1024).toFixed(1)} MB` : "",
        doc_type: "Invoice / Bill" as string,
        type_key: "invoice" as DocType,
        source: "Documents & Bills",
        linked_label: `Invoice #${inv.invoice_number}`,
        status: toDocStatus(inv),
        uploaded_at: inv.created_at,
        uploaded_by: inv.uploaded_by_name || "—",
        file_url: inv.file_url,
      }))
      .sort((a, b) => (a.uploaded_at < b.uploaded_at ? 1 : -1));
  }, [invoices]);

  const filtered = useMemo(() => {
    let list = docs;
    if (typeFilter !== "all") list = list.filter((d) => d.type_key === typeFilter);
    if (statusFilter !== "all") list = list.filter((d) => d.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((d) =>
        d.file_name.toLowerCase().includes(q) ||
        d.linked_label.toLowerCase().includes(q) ||
        d.doc_type.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a: any, b: any) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return list;
  }, [docs, typeFilter, statusFilter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(pageStart, pageStart + pageSize);
  const rangeStart = filtered.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(filtered.length, pageStart + pageSize);

  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (currentPage > 3) pages.push("...");
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
    return pages;
  };

  const kpis = useMemo(() => {
    const total = docs.length;
    const needsReview = docs.filter((d) => d.status === "Needs Review").length;
    const needsApproval = docs.filter((d) => d.status === "Needs Approval").length;
    const linked = docs.filter((d) => d.status === "Linked").length;
    const failed = docs.filter((d) => d.status === "Failed").length;
    const pct = (n: number) => (total ? `${((n / total) * 100).toFixed(1)}% of total` : "—");
    return { total, needsReview, needsApproval, linked, failed, pct };
  }, [docs]);

  const openAttachment = (url: string, title: string) => {
    setViewerUrl(url);
    setViewerTitle(title);
    setViewerOpen(true);
  };

  const fileIcon = (name: string) => {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "xlsx" || ext === "xls" || ext === "csv") return "bg-emerald-500/10 text-emerald-400";
    if (ext === "pdf") return "bg-rose-500/10 text-rose-400";
    return "bg-sky-500/10 text-sky-400";
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-semibold tracking-tight">Document Centre</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Central entry point for scanned and uploaded business documents.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents, names, or keywords…"
              className="pl-9 w-[340px] bg-background/40"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">⌘K</kbd>
          </div>
          <Button variant="outline" className="gap-2">
            <Calendar className="h-4 w-4" /> All Dates
          </Button>
          <Button onClick={() => setPickerOpen(true)} className="gap-2">
            <ScanLine className="h-4 w-4" /> Scan / Upload Document
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiTile icon={FileText} label="Total Documents" value={kpis.total.toLocaleString()} hint="All workflows" tone="info" />
        <KpiTile icon={AlertTriangle} label="Needs Review" value={kpis.needsReview} hint={kpis.pct(kpis.needsReview)} tone="warn" />
        <KpiTile icon={ShieldCheck} label="Needs Approval" value={kpis.needsApproval} hint={kpis.pct(kpis.needsApproval)} tone="approval" />
        <KpiTile icon={Link2} label="Linked Records" value={kpis.linked} hint={kpis.pct(kpis.linked)} tone="linked" />
        <KpiTile icon={XCircle} label="Failed Extraction" value={kpis.failed} hint={kpis.pct(kpis.failed)} tone="danger" />
      </div>

      {/* Type filter tiles */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TYPE_TILES.map((t) => {
          const active = typeFilter === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTypeFilter(t.key)}
              className={`shrink-0 flex flex-col items-center justify-center gap-1.5 px-4 py-3 min-w-[110px] rounded-lg border transition-all ${
                active
                  ? "border-primary/60 bg-primary/10 text-primary"
                  : "border-border/50 bg-card/40 text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              <t.icon className="h-4 w-4" />
              <span className="text-[11px] leading-tight text-center">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-3.5 w-3.5" /> Filters
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2"><Columns3 className="h-3.5 w-3.5" /> Columns</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {ALL_COLUMNS.map((c) => (
                <DropdownMenuCheckboxItem
                  key={c.key}
                  checked={!!visibleCols[c.key]}
                  onCheckedChange={(v) => setVisibleCols((prev) => ({ ...prev, [c.key]: !!v }))}
                >
                  {c.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowDownUp className="h-3.5 w-3.5" /> {SORT_LABELS[sortKey]} ({sortDir === "asc" ? "↑" : "↓"})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <DropdownMenuItem key={k} onClick={() => setSortKey(k)}>
                  {sortKey === k && <Check className="h-3.5 w-3.5 mr-2" />}
                  <span className={sortKey === k ? "" : "ml-[22px]"}>{SORT_LABELS[k]}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSortDir("asc")}>
                {sortDir === "asc" && <Check className="h-3.5 w-3.5 mr-2" />}
                <span className={sortDir === "asc" ? "" : "ml-[22px]"}>Ascending</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortDir("desc")}>
                {sortDir === "desc" && <Check className="h-3.5 w-3.5 mr-2" />}
                <span className={sortDir === "desc" ? "" : "ml-[22px]"}>Descending</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <Card className="card-glass overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {visibleCols.file_name && <TableHead>File Name</TableHead>}
                {visibleCols.doc_type && <TableHead>Document Type</TableHead>}
                {visibleCols.source && <TableHead>Source Workflow</TableHead>}
                {visibleCols.linked && <TableHead>Linked Record</TableHead>}
                {visibleCols.status && <TableHead>Status</TableHead>}
                {visibleCols.uploaded_at && <TableHead>Uploaded Date</TableHead>}
                {visibleCols.uploaded_by && <TableHead>Uploaded By</TableHead>}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                    No documents found. Click "Scan / Upload Document" to get started.
                  </TableCell>
                </TableRow>
              )}
              {pageItems.map((d) => (
                <TableRow key={d.id}>
                  {visibleCols.file_name && (
                    <TableCell>
                      <div className="flex items-center gap-3 min-w-0 max-w-[320px]">
                        <div className={`h-9 w-9 rounded flex items-center justify-center text-[10px] font-bold shrink-0 ${fileIcon(d.file_name)}`}>
                          {(d.file_name.split(".").pop() || "FILE").toUpperCase().slice(0, 4)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm truncate">{d.file_name}</div>
                          {d.file_size && <div className="text-[11px] text-muted-foreground">{d.file_size}</div>}
                        </div>
                      </div>
                    </TableCell>
                  )}
                  {visibleCols.doc_type && <TableCell><span className={typeChip(d.doc_type)}>{d.doc_type}</span></TableCell>}
                  {visibleCols.source && <TableCell className="text-muted-foreground text-sm">{d.source}</TableCell>}
                  {visibleCols.linked && (
                    <TableCell>
                      <span className="text-sky-400 hover:underline cursor-pointer text-sm">{d.linked_label}</span>
                    </TableCell>
                  )}
                  {visibleCols.status && <TableCell><span className={statusChip(d.status)}>{d.status}</span></TableCell>}
                  {visibleCols.uploaded_at && (
                    <TableCell className="text-sm td-num text-muted-foreground whitespace-nowrap">
                      {new Date(d.uploaded_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </TableCell>
                  )}
                  {visibleCols.uploaded_by && <TableCell className="text-sm text-muted-foreground">{d.uploaded_by}</TableCell>}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {d.file_url && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openAttachment(d.file_url, d.linked_label)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination footer */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border/50 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows per page:</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-[80px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="td-num">{rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {filtered.length.toLocaleString()}</span>
            <div className="flex items-center gap-1 ml-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setPage(1)}>
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {getPageNumbers().map((p, i) =>
                p === "..." ? (
                  <span key={`e-${i}`} className="px-2 text-muted-foreground">…</span>
                ) : (
                  <Button
                    key={p}
                    variant={p === currentPage ? "default" : "ghost"}
                    size="icon"
                    className="h-8 w-8 td-num"
                    onClick={() => setPage(p as number)}
                  >
                    {p}
                  </Button>
                ),
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}>
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>What are you uploading?</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            {PICKER_TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => handlePick(t.key)}
                className="flex items-start gap-3 p-4 rounded-lg border border-border/60 hover:border-primary hover:bg-accent/40 transition-all text-left"
              >
                <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <t.icon className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-sm">{t.label}</div>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <AttachmentViewerDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        fileUrl={viewerUrl}
        title={viewerTitle}
      />
    </div>
  );
}
