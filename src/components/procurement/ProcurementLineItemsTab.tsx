import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, X, AlertTriangle, Download, Eye } from "lucide-react";
import { downloadCSV } from "@/utils/csvDownload";
import AttachmentViewerDialog from "@/components/invoices/AttachmentViewerDialog";

interface LineItemRow {
  id: string;
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  supplier_name: string;
  description: string;
  pack_size: string;
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
}

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => {
  if (!d) return "";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export default function ProcurementLineItemsTab() {
  const [rows, setRows] = useState<LineItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [sortColumns, setSortColumns] = useState<Array<{key: string, dir: "asc"|"desc"}>>([{ key: "invoice_date", dir: "desc" }]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFileUrl, setViewerFileUrl] = useState("");
  const [viewerTitle, setViewerTitle] = useState("");
  const fetchData = useCallback(async () => {
    setLoading(true);
    const [liData, invRes, supRes, pmRes] = await Promise.all([
      fetchAllRows("invoice_line_items", "*", { col: "created_at", asc: false }),
      supabase.from("invoices").select("id, invoice_number, invoice_date, supplier_id, file_url"),
      supabase.from("suppliers").select("id, name"),
      supabase.from("product_master").select("id, internal_product_name, internal_sku, external_sku"),
    ]);

    const invMap = new Map((invRes.data || []).map((i: any) => [i.id, i]));
    const supMap = new Map((supRes.data || []).map((s: any) => [s.id, s.name]));
    const pmMap = new Map((pmRes.data || []).map((p: any) => [p.id, { name: p.internal_product_name, sku: p.internal_sku, ext_sku: p.external_sku }]));

    const mapped: LineItemRow[] = liData.map((li: any) => {
      const inv = invMap.get(li.invoice_id);
      const pmId = li.product_master_id || li.standard_product_id;
      const pm = pmId ? pmMap.get(pmId) : null;
      return {
        id: li.id,
        invoice_id: li.invoice_id,
        invoice_number: inv?.invoice_number || "",
        invoice_date: inv?.invoice_date || "",
        supplier_name: inv ? (supMap.get(inv.supplier_id) || "Unknown") : "Unknown",
        description: li.description || "",
        pack_size: li.pack_size || "",
        quantity: li.quantity || 0,
        unit: li.unit || "",
        unit_price: li.unit_price || 0,
        total: li.total || 0,
        standard_product_id: li.standard_product_id,
        product_master_id: li.product_master_id,
        master_name: pm?.name || "",
        internal_sku: pm?.sku || "",
        external_sku: pm?.ext_sku || "",
        file_url: inv?.file_url || "",
      };
    });

    setRows(mapped);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Subscribe to invoice_line_items changes for auto-refresh
  useEffect(() => {
    const channel = supabase
      .channel("procurement-line-items")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoice_line_items" }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const suppliers = useMemo(() => [...new Set(rows.map(r => r.supplier_name))].sort(), [rows]);

  const toggleSort = (key: string) => {
    setSortColumns(prev => {
      const idx = prev.findIndex(s => s.key === key);
      if (idx === -1) return [...prev, { key, dir: "asc" as const }];
      if (prev[idx].dir === "asc") return prev.map((s, i) => i === idx ? { ...s, dir: "desc" as const } : s);
      return prev.filter((_, i) => i !== idx);
    });
  };

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
    let result = rows.filter(r => {
      if (supplierFilter !== "all" && r.supplier_name !== supplierFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return r.description.toLowerCase().includes(q) ||
          r.internal_sku.toLowerCase().includes(q) ||
          r.external_sku.toLowerCase().includes(q) ||
          r.invoice_number.toLowerCase().includes(q) ||
          r.supplier_name.toLowerCase().includes(q) ||
          r.master_name.toLowerCase().includes(q);
      }
      return true;
    });
    result.sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [rows, search, supplierFilter, sortKey, sortDir]);

  const totalNet = filtered.reduce((s, r) => s + r.total, 0);
  const unmatchedCount = filtered.filter(r => !r.product_master_id && !r.standard_product_id).length;
  const hasFilters = search || supplierFilter !== "all";

  const columns = [
    { key: "invoice_date", label: "Date", w: "w-[95px]" },
    { key: "supplier_name", label: "Supplier", w: "min-w-[140px]" },
    { key: "invoice_number", label: "Invoice #", w: "w-[110px]" },
    { key: "internal_sku", label: "Internal SKU", w: "w-[100px]" },
    { key: "external_sku", label: "External SKU", w: "w-[100px]" },
    { key: "master_name", label: "Internal Product Name", w: "min-w-[160px]" },
    { key: "description", label: "Supplier Product Name", w: "min-w-[200px]" },
    { key: "quantity", label: "Qty", w: "w-[55px]", align: "right" as const },
    { key: "unit", label: "Unit", w: "w-[55px]" },
    { key: "unit_price", label: "Unit Price", w: "w-[90px]", align: "right" as const },
    { key: "total", label: "Net Amount", w: "w-[100px]", align: "right" as const },
  ];

  if (loading) return <div className="py-12 text-center text-muted-foreground">Loading line items...</div>;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search description, code, invoice #, supplier..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-[160px] h-9 text-xs"><SelectValue placeholder="Supplier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            {suppliers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        {hasFilters && (
          <button onClick={() => { setSearch(""); setSupplierFilter("all"); }} className="text-xs text-primary hover:underline flex items-center gap-1">
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

      <div className="flex items-center gap-3">
        <p className="text-xs text-muted-foreground">
          Showing {filtered.length} of {rows.length} line items · Total: <span className="font-semibold">${fmt(totalNet)}</span>
        </p>
        {unmatchedCount > 0 && (
          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-700">
            <AlertTriangle className="h-3 w-3 mr-1" />{unmatchedCount} unmatched
          </Badge>
        )}
      </div>

      {/* Table */}
      <div className="card-glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] leading-tight">
            <thead>
              <tr className="bg-primary text-primary-foreground">
                <th className="px-2 py-2.5 w-8"></th>
                {columns.map(col => (
                  <th key={col.key} className={`text-left px-3 py-2.5 font-semibold cursor-pointer select-none ${col.w} ${col.align === "right" ? "text-right" : ""}`} onClick={() => toggleSort(col.key)}>
                    <span className="flex items-center gap-1">{col.label}<SortIcon col={col.key} /></span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={columns.length} className="text-center py-12 text-muted-foreground">
                  No line items found. Upload invoices in the Invoices tab to see extracted data here.
                </td></tr>
              ) : filtered.map((r, idx) => {
                const isUnmatched = !r.product_master_id && !r.standard_product_id;
                return (
                <tr key={r.id} className={`border-b border-border/40 hover:bg-accent/30 transition-colors ${isUnmatched ? "bg-amber-50/60 dark:bg-amber-950/20" : idx % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                  <td className="px-2 py-2 text-center">
                    {r.file_url ? (
                      <button
                        onClick={() => { setViewerFileUrl(r.file_url); setViewerTitle(`Invoice ${r.invoice_number}`); setViewerOpen(true); }}
                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                        title="View attachment"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmtDate(r.invoice_date)}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{r.supplier_name}</td>
                  <td className="px-3 py-2 font-mono text-primary">{r.invoice_number}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{r.internal_sku || "—"}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{r.external_sku || "—"}</td>
                  <td className="px-3 py-2">
                    {r.master_name ? (
                      <span className="text-foreground font-medium">{r.master_name}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 text-[11px] font-medium">
                        <AlertTriangle className="h-3 w-3" />Unmatched
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-foreground">
                    {r.description}
                    {r.pack_size && <span className="text-muted-foreground ml-1">[{r.pack_size}]</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.quantity}</td>
                  <td className="px-3 py-2 text-center text-muted-foreground">{r.unit}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(r.unit_price)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmt(r.total)}</td>
                </tr>
                );
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-muted/40 font-semibold text-[12px]">
                  <td colSpan={12} className="px-3 py-2 text-right">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(totalNet)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <AttachmentViewerDialog
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        fileUrl={viewerFileUrl}
        title={viewerTitle}
      />
    </div>
  );
}
