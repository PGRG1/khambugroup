import React, { useState, useMemo, useCallback } from "react";
import { useInvoiceData } from "@/hooks/useInvoiceData";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Download, FileDown, Loader2, FileText, Image as ImageIcon, FileSpreadsheet, File as FileIcon, MoreVertical, Search, X } from "lucide-react";
import { format } from "date-fns";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";

const VENUES = ["The Carpet Bar", "Bosa", "Khambu"];
const STATUSES = ["pending", "verified", "approved", "paid", "overdue", "cancelled", "disputed"];

function fileKind(name: string | null | undefined, url?: string | null): "pdf" | "image" | "sheet" | "other" {
  const n = (name || url || "").toLowerCase();
  if (n.endsWith(".pdf")) return "pdf";
  if (/\.(jpe?g|png|gif|webp|heic|bmp)$/.test(n)) return "image";
  if (/\.(xlsx?|csv|numbers)$/.test(n)) return "sheet";
  return "other";
}

function KindIcon({ kind, className = "h-6 w-6" }: { kind: ReturnType<typeof fileKind>; className?: string }) {
  const map = { pdf: FileText, image: ImageIcon, sheet: FileSpreadsheet, other: FileIcon } as const;
  const Icon = map[kind];
  return <Icon className={className} />;
}

const STATUS_TONE: Record<string, string> = {
  approved: "bg-primary/10 text-primary border-primary/25",
  paid: "bg-primary/10 text-primary border-primary/25",
  verified: "bg-info/10 text-info border-info/30",
  pending: "bg-warning/10 text-warning border-warning/30",
  disputed: "bg-warning/10 text-warning border-warning/30",
  overdue: "bg-destructive/10 text-destructive border-destructive/25",
  cancelled: "bg-muted text-muted-foreground border-border",
};

function StatTile({ label, value, tone }: { label: string; value: string; tone?: "primary" }) {
  return (
    <div className="text-left rounded-lg border border-border/60 bg-card/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
      <div className={`text-lg font-semibold tabular-nums mt-0.5 ${tone === "primary" ? "text-primary" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

export default function DocumentsTab() {
  const { invoices, suppliers, loading } = useInvoiceData();
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [venueFilter, setVenueFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [downloading, setDownloading] = useState(false);

  const docsInvoices = useMemo(() => invoices.filter((inv) => inv.file_url), [invoices]);

  const periods = useMemo(() => {
    const set = new Set<string>();
    docsInvoices.forEach((inv) => { if (inv.invoice_date) set.add(inv.invoice_date.slice(0, 7)); });
    return Array.from(set).sort().reverse();
  }, [docsInvoices]);

  const filtered = useMemo(() => {
    let list = docsInvoices;
    if (periodFilter !== "all") list = list.filter((inv) => inv.invoice_date.startsWith(periodFilter));
    if (supplierFilter !== "all") list = list.filter((inv) => inv.supplier_id === supplierFilter);
    if (venueFilter !== "all") list = list.filter((inv) => inv.venue === venueFilter);
    if (statusFilter !== "all") list = list.filter((inv) => inv.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (inv) =>
          inv.invoice_number.toLowerCase().includes(q) ||
          (inv.supplier_name || "").toLowerCase().includes(q) ||
          (inv.file_name || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [docsInvoices, periodFilter, supplierFilter, venueFilter, statusFilter, search]);

  const stats = useMemo(() => {
    const now = new Date();
    const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let thisMonth = 0, pdfs = 0, images = 0, other = 0;
    for (const inv of docsInvoices) {
      if (inv.invoice_date && inv.invoice_date.startsWith(curMonth)) thisMonth++;
      const k = fileKind(inv.file_name, inv.file_url);
      if (k === "pdf") pdfs++;
      else if (k === "image") images++;
      else other++;
    }
    return { total: docsInvoices.length, thisMonth, pdfs, images, other };
  }, [docsInvoices]);

  const allSelected = filtered.length > 0 && filtered.every((inv) => selectedIds.has(inv.id));

  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((inv) => inv.id)));
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const downloadFiles = useCallback(
    async (items: typeof filtered) => {
      if (items.length === 0) return;
      setDownloading(true);
      let success = 0;
      for (const inv of items) {
        if (!inv.file_url) continue;
        const { data, error } = await supabase.storage.from("invoice-files").createSignedUrl(inv.file_url, 300);
        if (error || !data?.signedUrl) { console.error("Failed", inv.file_url, error); continue; }
        const a = document.createElement("a");
        a.href = data.signedUrl;
        a.download = inv.file_name || `invoice-${inv.invoice_number}`;
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        success++;
        if (items.length > 1) await new Promise((r) => setTimeout(r, 350));
      }
      setDownloading(false);
      toast({ title: `Downloaded ${success} file${success !== 1 ? "s" : ""}` });
    },
    [toast]
  );

  const previewFile = useCallback(async (inv: typeof filtered[number]) => {
    if (!inv.file_url) return;
    const { data } = await supabase.storage.from("invoice-files").createSignedUrl(inv.file_url, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }, []);

  const handleDownloadSelected = () => downloadFiles(filtered.filter((inv) => selectedIds.has(inv.id)));
  const handleDownloadAll = () => downloadFiles(filtered);

  const hasFilters = search || periodFilter !== "all" || supplierFilter !== "all" || venueFilter !== "all" || statusFilter !== "all";
  const clearFilters = () => { setSearch(""); setPeriodFilter("all"); setSupplierFilter("all"); setVenueFilter("all"); setStatusFilter("all"); };

  const scopeLabel = useMemo(() => {
    const parts: string[] = [];
    if (periodFilter !== "all") parts.push(periodFilter);
    if (supplierFilter !== "all") parts.push(suppliers.find(s => s.id === supplierFilter)?.name ?? "supplier");
    if (venueFilter !== "all") parts.push(venueFilter);
    if (statusFilter !== "all") parts.push(statusFilter);
    return parts.length ? parts.join(" · ") : "All documents";
  }, [periodFilter, supplierFilter, venueFilter, statusFilter, suppliers]);

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {loading ? Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[64px] rounded-lg border border-border/60 bg-card/40 animate-pulse" />
        )) : (
          <>
            <StatTile label="Total Documents" value={stats.total.toLocaleString()} tone="primary" />
            <StatTile label="This Month" value={stats.thisMonth.toLocaleString()} />
            <StatTile label="PDF" value={stats.pdfs.toLocaleString()} />
            <StatTile label="Images" value={stats.images.toLocaleString()} />
            <StatTile label="Other" value={stats.other.toLocaleString()} />
          </>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search invoice # or supplier…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue placeholder="Period" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Periods</SelectItem>
            {periods.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-[180px] h-9 text-xs"><SelectValue placeholder="Supplier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers & Vendors</SelectItem>
            {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={venueFilter} onValueChange={setVenueFilter}>
          <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue placeholder="Venue" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Venues</SelectItem>
            {VENUES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasFilters && (
          <button onClick={clearFilters} className="text-xs text-primary hover:underline inline-flex items-center gap-1 h-9">
            <X className="h-3 w-3" /> Clear
          </button>
        )}
        <div className="flex gap-2 ml-auto">
          <Button size="sm" variant="outline" disabled={selectedIds.size === 0 || downloading} onClick={handleDownloadSelected} className="h-9">
            {downloading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            Download Selected
          </Button>
          <Button size="sm" disabled={filtered.length === 0 || downloading} onClick={handleDownloadAll} className="h-9">
            <FileDown className="h-4 w-4 mr-1" />
            Download All
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Showing {scopeLabel} · <span className="tabular-nums">{filtered.length.toLocaleString()}</span> of <span className="tabular-nums">{docsInvoices.length.toLocaleString()}</span> documents
          {selectedIds.size > 0 && <> · <span className="text-primary tabular-nums">{selectedIds.size} selected</span></>}
        </p>
        {filtered.length > 0 && (
          <button onClick={toggleAll} className="text-xs text-primary hover:underline">
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className={isMobile ? "space-y-2" : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className={`${isMobile ? "h-16" : "h-[168px]"} rounded-xl border border-border/60 bg-card/40 animate-pulse`} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm rounded-xl border border-border/60 bg-card/40">
          No documents found.
        </div>
      ) : isMobile ? (
        <div className="space-y-2">
          {filtered.map((inv) => {
            const kind = fileKind(inv.file_name, inv.file_url);
            const selected = selectedIds.has(inv.id);
            const tone = STATUS_TONE[inv.status] || STATUS_TONE.cancelled;
            return (
              <div key={inv.id} className={`rounded-lg border p-3 flex items-start gap-3 transition-colors ${selected ? "border-primary/60 bg-primary/[0.04]" : "border-border/60 bg-card/50"}`}>
                <Checkbox checked={selected} onCheckedChange={() => toggleOne(inv.id)} className="mt-1" />
                <button onClick={() => previewFile(inv)} className="rounded-md bg-primary/10 text-primary p-2 shrink-0">
                  <KindIcon kind={kind} className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-mono text-xs font-medium truncate flex-1">{inv.invoice_number}</div>
                    <Badge variant="outline" className={`capitalize text-[10px] ${tone}`}>{inv.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{inv.supplier_name || "—"} · {inv.venue}</div>
                  <div className="text-[11px] text-muted-foreground">{inv.invoice_date ? format(new Date(inv.invoice_date + "T00:00:00"), "d MMM yyyy") : "—"}</div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0"><MoreVertical className="h-4 w-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => previewFile(inv)}>Preview</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => downloadFiles([inv])}>Download</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {filtered.map((inv) => {
            const kind = fileKind(inv.file_name, inv.file_url);
            const selected = selectedIds.has(inv.id);
            const tone = STATUS_TONE[inv.status] || STATUS_TONE.cancelled;
            return (
              <div
                key={inv.id}
                className={`group relative rounded-xl border p-3 transition-colors ${selected ? "border-primary/60 bg-primary/[0.05]" : "border-border/60 bg-card/50 hover:border-border"}`}
              >
                <div className="absolute top-2 left-2 z-10">
                  <Checkbox checked={selected} onCheckedChange={() => toggleOne(inv.id)} />
                </div>
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
                  <Button size="icon" variant="secondary" className="h-7 w-7" onClick={() => downloadFiles([inv])} disabled={downloading}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => previewFile(inv)}
                  className="w-full flex flex-col items-center gap-2 pt-6"
                >
                  <div className="rounded-lg bg-primary/10 text-primary p-4">
                    <KindIcon kind={kind} className="h-8 w-8" />
                  </div>
                  <div className="w-full text-center min-w-0">
                    <div className="font-mono text-xs font-medium truncate">{inv.invoice_number}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{inv.supplier_name || "—"}</div>
                    <div className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                      {inv.invoice_date ? format(new Date(inv.invoice_date + "T00:00:00"), "d MMM yyyy") : "—"}
                    </div>
                  </div>
                </button>
                <div className="mt-2 flex items-center justify-center">
                  <Badge variant="outline" className={`capitalize text-[10px] ${tone}`}>{inv.status}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
