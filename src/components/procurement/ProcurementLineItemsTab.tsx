import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, X, AlertTriangle, Download, Eye } from "lucide-react";
import { downloadCSV } from "@/utils/csvDownload";
import { toggleSortColumns, sortRows, type SortColumn } from "@/utils/tableSort";
import AttachmentViewerDialog from "@/components/invoices/AttachmentViewerDialog";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useIsMobile } from "@/hooks/use-mobile";
import { useActiveTenant } from "@/hooks/useActiveTenant";

interface LineItemRow {
  id: string;
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  supplier_name: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  standard_product_id: string | null;
  product_master_id: string | null;
  master_name: string;
  internal_sku: string;
  external_sku: string;
  file_url: string;
  _s: string;
}

interface InvoiceMeta { id: string; invoice_number: string; invoice_date: string; supplier_id: string; file_url: string | null; }
interface PMMeta { name: string; sku: string; ext_sku: string; }

const fmtWhole = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtPrice = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => {
  if (!d) return "";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const GRID_COLS = "32px 95px minmax(140px,1fr) 110px 100px 100px minmax(160px,1.2fr) minmax(200px,1.6fr) 55px 55px 90px 100px";

function buildRow(li: any, invMap: Map<string, InvoiceMeta>, supMap: Map<string, string>, pmMap: Map<string, PMMeta>): LineItemRow {
  const inv = invMap.get(li.invoice_id);
  const pmId = li.product_master_id || li.standard_product_id;
  const pm = pmId ? pmMap.get(pmId) : null;
  const supplier_name = inv ? (supMap.get(inv.supplier_id) || "Unknown") : "Unknown";
  const invoice_number = inv?.invoice_number || "";
  const description = li.description || "";
  const internal_sku = pm?.sku || "";
  const external_sku = (li.item_code && String(li.item_code).trim()) || pm?.ext_sku || "";
  const master_name = pm?.name || "";
  return {
    id: li.id,
    invoice_id: li.invoice_id,
    invoice_number,
    invoice_date: inv?.invoice_date || "",
    supplier_name,
    description,
    quantity: li.quantity || 0,
    unit: li.unit || "",
    unit_price: li.unit_price || 0,
    total: li.total || 0,
    standard_product_id: li.standard_product_id,
    product_master_id: li.product_master_id,
    master_name,
    internal_sku,
    external_sku,
    file_url: inv?.file_url || "",
    _s: `${supplier_name} ${invoice_number} ${internal_sku} ${external_sku} ${master_name} ${description}`.toLowerCase(),
  };
}

function StatTile({ label, value, active, onClick, tone = "neutral" }: {
  label: string; value: string; active?: boolean; onClick?: () => void;
  tone?: "neutral" | "warn" | "primary";
}) {
  const toneCls = tone === "warn"
    ? "text-warning"
    : tone === "primary" ? "text-primary" : "text-foreground";
  const activeCls = active ? "ring-2 ring-primary/60 bg-primary/5" : "";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`text-left rounded-lg border border-border/60 bg-card/50 px-3 py-2 transition-colors ${onClick ? "hover:border-border cursor-pointer" : "cursor-default"} ${activeCls}`}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
      <div className={`text-lg font-semibold tabular-nums mt-0.5 ${toneCls}`}>{value}</div>
    </button>
  );
}

export default function ProcurementLineItemsTab() {
  const [rows, setRows] = useState<LineItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState<string>("__latest__");
  const [showUnmatchedOnly, setShowUnmatchedOnly] = useState(false);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>([{ key: "invoice_date", dir: "desc" }]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFileUrl, setViewerFileUrl] = useState("");
  const [viewerTitle, setViewerTitle] = useState("");
  const isMobile = useIsMobile();

  const metaRef = useRef<{ invMap: Map<string, InvoiceMeta>; supMap: Map<string, string>; pmMap: Map<string, PMMeta> } | null>(null);

  const refetchLineItems = useCallback(async () => {
    if (!metaRef.current) return;
    const liData = await fetchAllRows("invoice_line_items", "*", { col: "created_at", asc: false });
    const { invMap, supMap, pmMap } = metaRef.current;
    setRows(liData.map((li: any) => buildRow(li, invMap, supMap, pmMap)));
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [liData, invData, supData, pmData] = await Promise.all([
      fetchAllRows("invoice_line_items", "*", { col: "created_at", asc: false }),
      fetchAllRows("invoices", "id, invoice_number, invoice_date, supplier_id, file_url"),
      fetchAllRows("suppliers", "id, name"),
      fetchAllRows("product_master", "id, internal_product_name, internal_sku, external_sku"),
    ]);
    const invMap = new Map<string, InvoiceMeta>(invData.map((i: any) => [i.id, i]));
    const supMap = new Map<string, string>(supData.map((s: any) => [s.id, s.name]));
    const pmMap = new Map<string, PMMeta>(pmData.map((p: any) => [p.id, { name: p.internal_product_name, sku: p.internal_sku, ext_sku: p.external_sku }]));
    metaRef.current = { invMap, supMap, pmMap };
    setRows(liData.map((li: any) => buildRow(li, invMap, supMap, pmMap)));
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("procurement-line-items")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoice_line_items" }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { refetchLineItems(); }, 300);
      })
      .subscribe();
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(channel); };
  }, [refetchLineItems]);

  const suppliers = useMemo(() => [...new Set(rows.map(r => r.supplier_name))].sort(), [rows]);

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.invoice_date) set.add(r.invoice_date.substring(0, 7));
    return [...set].sort().reverse();
  }, [rows]);

  useEffect(() => {
    if (monthFilter === "__latest__" && months.length > 0) setMonthFilter(months[0]);
  }, [months, monthFilter]);

  const fmtMonth = (ym: string) => {
    const [y, m] = ym.split("-");
    return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  };

  const toggleSort = (key: string, additive: boolean) => setSortColumns(prev => toggleSortColumns(prev, key, additive));

  const SortIcon = ({ col }: { col: string }) => {
    const entry = sortColumns.find(s => s.key === col);
    if (!entry) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return (
      <span className="inline-flex items-center gap-0.5">
        {entry.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        {sortColumns.length > 1 && <span className="text-[9px] font-bold">{sortColumns.indexOf(entry) + 1}</span>}
      </span>
    );
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let result = rows.filter(r => {
      if (supplierFilter !== "all" && r.supplier_name !== supplierFilter) return false;
      if (monthFilter !== "all" && monthFilter !== "__latest__" && (!r.invoice_date || !r.invoice_date.startsWith(monthFilter))) return false;
      if (showUnmatchedOnly && (r.product_master_id || r.standard_product_id)) return false;
      if (q && !r._s.includes(q)) return false;
      return true;
    });
    return sortRows(result, sortColumns);
  }, [rows, search, supplierFilter, monthFilter, showUnmatchedOnly, sortColumns]);

  const totalNet = filtered.reduce((s, r) => s + r.total, 0);
  const unmatchedCount = filtered.filter(r => !r.product_master_id && !r.standard_product_id).length;
  const distinctItems = useMemo(() => new Set(filtered.map(r => r.master_name || r.description)).size, [filtered]);
  const distinctSuppliers = useMemo(() => new Set(filtered.map(r => r.supplier_name)).size, [filtered]);
  const hasFilters = search || supplierFilter !== "all" || (monthFilter !== "all" && monthFilter !== months[0]) || showUnmatchedOnly;

  const columns = [
    { key: "invoice_date", label: "Date" },
    { key: "supplier_name", label: "Supplier & Vendor" },
    { key: "invoice_number", label: "Invoice #" },
    { key: "internal_sku", label: "Internal SKU" },
    { key: "external_sku", label: "External SKU" },
    { key: "master_name", label: "Internal Product Name" },
    { key: "description", label: "Supplier Product Name" },
    { key: "quantity", label: "Qty", align: "right" as const },
    { key: "unit", label: "Unit" },
    { key: "unit_price", label: "Unit Price", align: "right" as const },
    { key: "total", label: "Net Amount", align: "right" as const },
  ];

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 100,
  });

  const scopeLabel = useMemo(() => {
    const parts: string[] = [];
    parts.push(supplierFilter === "all" ? "All suppliers" : supplierFilter);
    const activeMonth = monthFilter === "__latest__" ? months[0] : monthFilter;
    parts.push(activeMonth && activeMonth !== "all" ? fmtMonth(activeMonth) : "All months");
    if (showUnmatchedOnly) parts.push("Unmatched only");
    return parts.join(" · ");
  }, [supplierFilter, monthFilter, months, showUnmatchedOnly]);

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[64px] rounded-lg border border-border/60 bg-card/40 animate-pulse" />)
        ) : (
          <>
            <StatTile label="Total Lines" value={filtered.length.toLocaleString()} />
            <StatTile label="Total Value" value={`HK$ ${fmtWhole(totalNet)}`} tone="primary" />
            <StatTile label="Distinct Items" value={distinctItems.toLocaleString()} />
            <StatTile label="Distinct Suppliers" value={distinctSuppliers.toLocaleString()} />
            <StatTile
              label="Unmatched"
              value={unmatchedCount.toLocaleString()}
              tone={unmatchedCount > 0 ? "warn" : "neutral"}
              active={showUnmatchedOnly}
              onClick={() => setShowUnmatchedOnly(v => !v)}
            />
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search description, code, invoice #, supplier..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-[180px] h-9 text-xs"><SelectValue placeholder="Supplier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers & Vendors</SelectItem>
            {suppliers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={monthFilter === "__latest__" ? "all" : monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {months.map(m => <SelectItem key={m} value={m}>{fmtMonth(m)}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasFilters && (
          <button onClick={() => { setSearch(""); setSupplierFilter("all"); setMonthFilter(months[0] || "all"); setShowUnmatchedOnly(false); }} className="text-xs text-primary hover:underline inline-flex items-center gap-1 h-9">
            <X className="h-3 w-3" /> Clear
          </button>
        )}
        <Button size="sm" variant="outline" onClick={() => downloadCSV(filtered.map(r => ({
          invoice_date: fmtDate(r.invoice_date), supplier_name: r.supplier_name, invoice_number: r.invoice_number,
          internal_sku: r.internal_sku || "", external_sku: r.external_sku || "",
          master_name: r.master_name || "", description: r.description,
          quantity: r.quantity, unit: r.unit, unit_price: r.unit_price.toFixed(2), total: r.total.toFixed(2),
        })), columns.map(c => ({ key: c.key, label: c.label })), "invoice_line_items")} className="h-9">
          <Download className="h-4 w-4 mr-1" />Download
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {scopeLabel} · <span className="tabular-nums">{filtered.length.toLocaleString()}</span> of <span className="tabular-nums">{rows.length.toLocaleString()}</span> lines
      </p>

      {/* Loading skeleton */}
      {loading ? (
        <div className="rounded-xl border border-border/60 bg-card/40 overflow-hidden">
          <div className="h-10 bg-primary/60" />
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-9 border-b border-border/40 bg-muted/10 animate-pulse" style={{ animationDelay: `${i * 40}ms` }} />
          ))}
        </div>
      ) : isMobile ? (
        // Mobile card list
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm rounded-xl border border-border/60 bg-card/40">
              No line items found.
            </div>
          ) : (
            filtered.slice(0, 200).map(r => {
              const isUnmatched = !r.product_master_id && !r.standard_product_id;
              return (
                <div key={r.id} className={`rounded-lg border p-3 space-y-1.5 ${isUnmatched ? "border-warning/40 bg-warning/[0.04]" : "border-border/60 bg-card/50"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm truncate">{r.master_name || r.description}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{r.supplier_name} · <span className="font-mono">{r.invoice_number}</span></div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold tabular-nums text-sm">HK$ {fmtWhole(r.total)}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">{r.quantity} {r.unit}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{fmtDate(r.invoice_date)}</span>
                    {isUnmatched && (
                      <span className="inline-flex items-center gap-1 text-warning">
                        <AlertTriangle className="h-3 w-3" />Unmatched
                      </span>
                    )}
                    {r.file_url && (
                      <button onClick={() => { setViewerFileUrl(r.file_url); setViewerTitle(`Invoice ${r.invoice_number}`); setViewerOpen(true); }} className="text-primary underline">View</button>
                    )}
                  </div>
                </div>
              );
            })
          )}
          {filtered.length > 200 && (
            <p className="text-center text-xs text-muted-foreground py-3">Showing first 200 rows — use filters to narrow down.</p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <div style={{ minWidth: 1400 }}>
              <div
                className="grid bg-primary text-primary-foreground text-[12px] font-semibold sticky top-0 z-10"
                style={{ gridTemplateColumns: GRID_COLS }}
              >
                <div></div>
                {columns.map(col => (
                  <div
                    key={col.key}
                    className={`px-3 py-2.5 cursor-pointer select-none whitespace-nowrap flex items-center ${col.align === "right" ? "justify-end" : ""}`}
                    onClick={(e) => toggleSort(col.key, e.shiftKey)}
                    title="Click to sort. Shift+click to add another column."
                  >
                    <span className="flex items-center gap-1">{col.label}<SortIcon col={col.key} /></span>
                  </div>
                ))}
              </div>

              <div
                ref={scrollRef}
                className="overflow-auto"
                style={{ height: "calc(100vh - 380px)", minHeight: 420 }}
              >
                {filtered.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    No line items found. Upload invoices in the Invoices tab to see extracted data here.
                  </div>
                ) : (
                  <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative", width: "100%" }}>
                    {virtualItems.map(vRow => {
                      const r = filtered[vRow.index];
                      const idx = vRow.index;
                      const isUnmatched = !r.product_master_id && !r.standard_product_id;
                      return (
                        <div
                          key={`${r.id}-${idx}`}
                          className={`grid items-center border-b border-border/40 hover:bg-accent/30 transition-colors text-[12px] ${isUnmatched ? "bg-warning/[0.06]" : idx % 2 === 0 ? "bg-card" : "bg-muted/20"}`}
                          style={{
                            gridTemplateColumns: GRID_COLS,
                            position: "absolute", top: 0, left: 0, width: "100%",
                            height: vRow.size, transform: `translateY(${vRow.start}px)`,
                          }}
                        >
                          <div className="px-2 text-center">
                            {r.file_url ? (
                              <button
                                onClick={() => { setViewerFileUrl(r.file_url); setViewerTitle(`Invoice ${r.invoice_number}`); setViewerOpen(true); }}
                                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                                title="View attachment"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </div>
                          <div className="px-3 text-muted-foreground whitespace-nowrap">{fmtDate(r.invoice_date)}</div>
                          <div className="px-3 font-medium text-foreground truncate" title={r.supplier_name}>{r.supplier_name}</div>
                          <div className="px-3 font-mono text-primary truncate" title={r.invoice_number}>{r.invoice_number}</div>
                          <div className="px-3 font-mono text-muted-foreground truncate">{r.internal_sku || "—"}</div>
                          <div className="px-3 font-mono text-muted-foreground truncate">{r.external_sku || "—"}</div>
                          <div className="px-3 truncate" title={r.master_name}>
                            {r.master_name ? (
                              <span className="text-foreground font-medium">{r.master_name}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-warning text-[11px] font-medium">
                                <AlertTriangle className="h-3 w-3" />Unmatched
                              </span>
                            )}
                          </div>
                          <div className="px-3 truncate text-foreground" title={r.description}>{r.description}</div>
                          <div className="px-3 text-right tabular-nums">{r.quantity}</div>
                          <div className="px-3 text-center text-muted-foreground">{r.unit}</div>
                          <div className="px-3 text-right tabular-nums">{fmtPrice(r.unit_price)}</div>
                          <div className="px-3 text-right tabular-nums font-semibold">HK$ {fmtWhole(r.total)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {filtered.length > 0 && (
                <div
                  className="grid bg-muted/40 font-semibold text-[12px] border-t border-border"
                  style={{ gridTemplateColumns: GRID_COLS }}
                >
                  <div></div>
                  <div className="px-3 py-2 text-right" style={{ gridColumn: "span 10" }}>Total</div>
                  <div className="px-3 py-2 text-right tabular-nums">HK$ {fmtWhole(totalNet)}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <AttachmentViewerDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        fileUrl={viewerFileUrl}
        title={viewerTitle}
      />
    </div>
  );
}
