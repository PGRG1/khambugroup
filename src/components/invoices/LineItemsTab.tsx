import React, { useState, useEffect, useMemo, useRef } from "react";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Eye, Sparkles, AlertTriangle } from "lucide-react";
import { Supplier } from "@/hooks/useInvoiceData";
import AttachmentViewerDialog from "./AttachmentViewerDialog";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface LineItemRow {
  id: string;
  invoice_date: string;
  supplier_name: string;
  invoice_number: string;
  item_code: string;
  master_name: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  net_amount: number;
  file_url: string;
  ai_suggestion: any;
  // pre-lowered for fast search
  _s: string;
}

interface Props {
  suppliers: Supplier[];
}

// Column template — keep header & rows in lockstep
const GRID_COLS = "32px 110px minmax(140px,1fr) 120px 110px minmax(160px,1.2fr) minmax(220px,1.6fr) 70px 80px 100px 110px";

export default function LineItemsTab({ suppliers }: Props) {
  const [rows, setRows] = useState<LineItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [sortKey, setSortKey] = useState<string>("invoice_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerFileUrl, setViewerFileUrl] = useState("");
  const [viewerTitle, setViewerTitle] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [items, invoices, products] = await Promise.all([
        fetchAllRows("invoice_line_items", "id, item_code, description, pack_size, quantity, unit, unit_price, tax_amount, total, invoice_id, standard_product_id"),
        fetchAllRows("invoices", "id, invoice_number, supplier_id, invoice_date, file_url"),
        fetchAllRows("standard_products", "id, name"),
      ]);

      if (!items.length || !invoices) { setLoading(false); return; }

      const invMap = new Map(invoices.map((i: any) => [i.id, i]));
      const supMap = new Map(suppliers.map(s => [s.id, s.name]));
      const prodMap = new Map((products || []).map((p: any) => [p.id, p.name]));

      const mapped: LineItemRow[] = items.map((li: any) => {
        const inv = invMap.get(li.invoice_id);
        const supplier_name = inv ? (supMap.get(inv.supplier_id) || "Unknown") : "Unknown";
        const invoice_number = inv?.invoice_number || "";
        const item_code = li.item_code || "";
        const master_name = li.standard_product_id ? (prodMap.get(li.standard_product_id) || "") : "";
        const description = `${li.description || ""}${li.pack_size ? ` [${li.pack_size}]` : ""}`;
        return {
          id: li.id,
          invoice_date: inv?.invoice_date || "",
          supplier_name,
          invoice_number,
          item_code,
          master_name,
          description,
          quantity: li.quantity || 0,
          unit: li.unit || "unit",
          unit_price: li.unit_price || 0,
          net_amount: li.total || 0,
          file_url: inv?.file_url || "",
          _s: `${supplier_name} ${invoice_number} ${item_code} ${master_name} ${description}`.toLowerCase(),
        };
      });

      setRows(mapped);
      setLoading(false);
    })();
  }, [suppliers]);

  const filtered = useMemo(() => {
    let result = rows;
    if (supplierFilter !== "all") {
      result = result.filter(r => r.supplier_name === supplierFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(r => r._s.includes(q));
    }
    return [...result].sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      let cmp = 0;
      if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, supplierFilter, search, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40 ml-1" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const formatCurrency = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatDate = (d: string) => {
    if (!d) return "";
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  const uniqueSuppliers = useMemo(() => [...new Set(rows.map(r => r.supplier_name))].sort(), [rows]);
  const totalNet = useMemo(() => filtered.reduce((s, r) => s + r.net_amount, 0), [filtered]);

  // Virtualization
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 100,
  });

  if (loading) return <p className="text-muted-foreground p-4 text-sm">Loading line items...</p>;

  const columns: { key: string; label: string; align?: "right" | "left" }[] = [
    { key: "invoice_date", label: "Date" },
    { key: "supplier_name", label: "Supplier & Vendor" },
    { key: "invoice_number", label: "Invoice No." },
    { key: "item_code", label: "Product No." },
    { key: "master_name", label: "Master Name" },
    { key: "description", label: "Product Description" },
    { key: "quantity", label: "Qty", align: "right" },
    { key: "unit", label: "Order Unit" },
    { key: "unit_price", label: "Unit Price", align: "right" },
    { key: "net_amount", label: "Net Amount", align: "right" },
  ];

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-xs" />
        </div>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-[180px] h-9 text-xs"><SelectValue placeholder="All Suppliers & Vendors" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers & Vendors</SelectItem>
            {uniqueSuppliers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">
          Showing {filtered.length} of {rows.length} items
        </span>
      </div>

      {/* Virtualized "Table" (div-grid based for absolute-positioning support) */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Header */}
        <div
          className="grid bg-primary text-primary-foreground text-[12px] font-semibold"
          style={{ gridTemplateColumns: GRID_COLS }}
        >
          <div></div>
          {columns.map(col => (
            <div
              key={col.key}
              className={`px-3 py-2.5 cursor-pointer select-none transition-colors hover:bg-primary/80 whitespace-nowrap ${col.align === "right" ? "text-right justify-end" : "text-left"} flex items-center`}
              onClick={() => toggleSort(col.key)}
            >
              <span className="inline-flex items-center gap-0.5">
                {col.label}
                <SortIcon col={col.key} />
              </span>
            </div>
          ))}
        </div>

        {/* Scrollable virtualized body */}
        <div
          ref={scrollRef}
          className="overflow-auto"
          style={{ height: "calc(100vh - 320px)", minHeight: 400 }}
        >
          {filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-10 text-sm">No line items found</div>
          ) : (
            <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative", width: "100%" }}>
              {virtualItems.map(vRow => {
                const row = filtered[vRow.index];
                const idx = vRow.index;
                return (
                  <div
                    key={row.id}
                    className={`grid items-center border-b border-border/40 transition-colors hover:bg-accent/30 text-[12px] ${idx % 2 === 0 ? "bg-card" : "bg-muted/20"}`}
                    style={{
                      gridTemplateColumns: GRID_COLS,
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: vRow.size,
                      transform: `translateY(${vRow.start}px)`,
                    }}
                  >
                    <div className="px-2 text-center">
                      {row.file_url ? (
                        <button
                          onClick={() => { setViewerFileUrl(row.file_url); setViewerTitle(`Invoice ${row.invoice_number}`); setViewerOpen(true); }}
                          className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                          title="View attachment"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                    <div className="px-3 whitespace-nowrap text-muted-foreground">{formatDate(row.invoice_date)}</div>
                    <div className="px-3 font-medium text-foreground truncate">{row.supplier_name}</div>
                    <div className="px-3 tabular-nums truncate">{row.invoice_number}</div>
                    <div className="px-3 font-mono text-[11px] text-muted-foreground truncate">{row.item_code}</div>
                    <div className="px-3 text-foreground truncate">{row.master_name}</div>
                    <div className="px-3 truncate text-muted-foreground">{row.description}</div>
                    <div className="px-3 text-right tabular-nums text-foreground">{row.quantity}</div>
                    <div className="px-3 text-muted-foreground">{row.unit}</div>
                    <div className="px-3 text-right tabular-nums text-foreground">{formatCurrency(row.unit_price)}</div>
                    <div className="px-3 text-right tabular-nums font-semibold text-foreground">{formatCurrency(row.net_amount)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {filtered.length > 0 && (
          <div
            className="grid bg-primary/10 border-t-2 border-primary/30 font-semibold text-foreground text-[12px]"
            style={{ gridTemplateColumns: GRID_COLS }}
          >
            <div></div>
            <div className="col-span-9 px-3 py-2.5 text-right" style={{ gridColumn: "span 9" }}>Total</div>
            <div className="px-3 py-2.5 text-right tabular-nums font-bold text-[13px]">{formatCurrency(totalNet)}</div>
          </div>
        )}
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
