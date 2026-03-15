import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, X, AlertTriangle } from "lucide-react";

interface LineItemRow {
  id: string;
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  supplier_name: string;
  item_code: string;
  description: string;
  pack_size: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  standard_product_id: string | null;
  product_master_id: string | null;
  master_name: string;
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
  const [sortKey, setSortKey] = useState("invoice_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [liRes, invRes, supRes, pmRes] = await Promise.all([
      supabase.from("invoice_line_items").select("*").order("created_at", { ascending: false }),
      supabase.from("invoices").select("id, invoice_number, invoice_date, supplier_id"),
      supabase.from("suppliers").select("id, name"),
      supabase.from("product_master").select("id, internal_product_name"),
    ]);

    const invMap = new Map((invRes.data || []).map((i: any) => [i.id, i]));
    const supMap = new Map((supRes.data || []).map((s: any) => [s.id, s.name]));
    const pmMap = new Map((pmRes.data || []).map((p: any) => [p.id, p.internal_product_name]));

    const mapped: LineItemRow[] = (liRes.data || []).map((li: any) => {
      const inv = invMap.get(li.invoice_id);
      const pmId = li.product_master_id || li.standard_product_id;
      return {
        id: li.id,
        invoice_id: li.invoice_id,
        invoice_number: inv?.invoice_number || "",
        invoice_date: inv?.invoice_date || "",
        supplier_name: inv ? (supMap.get(inv.supplier_id) || "Unknown") : "Unknown",
        item_code: li.item_code || "",
        description: li.description || "",
        pack_size: li.pack_size || "",
        quantity: li.quantity || 0,
        unit: li.unit || "",
        unit_price: li.unit_price || 0,
        total: li.total || 0,
        standard_product_id: li.standard_product_id,
        product_master_id: li.product_master_id,
        master_name: pmId ? (pmMap.get(pmId) || "") : "",
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
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const filtered = useMemo(() => {
    let result = rows.filter(r => {
      if (supplierFilter !== "all" && r.supplier_name !== supplierFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return r.description.toLowerCase().includes(q) ||
          r.item_code.toLowerCase().includes(q) ||
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
  const hasFilters = search || supplierFilter !== "all";

  const columns = [
    { key: "invoice_date", label: "Date", w: "w-[95px]" },
    { key: "supplier_name", label: "Supplier", w: "min-w-[140px]" },
    { key: "invoice_number", label: "Invoice #", w: "w-[110px]" },
    { key: "item_code", label: "Product No.", w: "w-[90px]" },
    { key: "master_name", label: "Master Name", w: "min-w-[160px]" },
    { key: "description", label: "Product Description", w: "min-w-[200px]" },
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
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {rows.length} line items · Total: <span className="font-semibold">${fmt(totalNet)}</span>
      </p>

      {/* Table */}
      <div className="card-glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] leading-tight">
            <thead>
              <tr className="bg-primary text-primary-foreground">
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
              ) : filtered.map((r, idx) => (
                <tr key={r.id} className={`border-b border-border/40 hover:bg-accent/30 transition-colors ${idx % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmtDate(r.invoice_date)}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{r.supplier_name}</td>
                  <td className="px-3 py-2 font-mono text-primary">{r.invoice_number}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{r.item_code}</td>
                  <td className="px-3 py-2">
                    {r.master_name ? (
                      <span className="text-foreground font-medium">{r.master_name}</span>
                    ) : (
                      <span className="text-muted-foreground/50 italic">—</span>
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
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-muted/40 font-semibold text-[12px]">
                  <td colSpan={9} className="px-3 py-2 text-right">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmt(totalNet)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
