import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Supplier } from "@/hooks/useInvoiceData";

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
}

interface Props {
  suppliers: Supplier[];
}

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
      const [items, { data: invoices }, { data: products }] = await Promise.all([
        fetchAllRows("invoice_line_items", "id, item_code, description, pack_size, quantity, unit, unit_price, tax_amount, total, invoice_id, standard_product_id"),
        supabase.from("invoices").select("id, invoice_number, supplier_id, invoice_date, file_url"),
        supabase.from("standard_products").select("id, name"),
      ]);

      if (!items.length || !invoices) { setLoading(false); return; }

      const invMap = new Map(invoices.map((i: any) => [i.id, i]));
      const supMap = new Map(suppliers.map(s => [s.id, s.name]));
      const prodMap = new Map((products || []).map((p: any) => [p.id, p.name]));

      const mapped: LineItemRow[] = items.map((li: any) => {
        const inv = invMap.get(li.invoice_id);
        return {
          id: li.id,
          invoice_date: inv?.invoice_date || "",
          supplier_name: inv ? (supMap.get(inv.supplier_id) || "Unknown") : "Unknown",
          invoice_number: inv?.invoice_number || "",
          item_code: li.item_code || "",
          master_name: li.standard_product_id ? (prodMap.get(li.standard_product_id) || "") : "",
          description: `${li.description || ""}${li.pack_size ? ` [${li.pack_size}]` : ""}`,
          quantity: li.quantity || 0,
          unit: li.unit || "unit",
          unit_price: li.unit_price || 0,
          net_amount: li.total || 0,
          file_url: inv?.file_url || "",
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
      result = result.filter(r =>
        r.description.toLowerCase().includes(q) ||
        r.item_code.toLowerCase().includes(q) ||
        r.master_name.toLowerCase().includes(q) ||
        r.invoice_number.toLowerCase().includes(q) ||
        r.supplier_name.toLowerCase().includes(q)
      );
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

  const uniqueSuppliers = [...new Set(rows.map(r => r.supplier_name))].sort();
  const totalNet = filtered.reduce((s, r) => s + r.net_amount, 0);

  if (loading) return <p className="text-muted-foreground p-4 text-sm">Loading line items...</p>;

  const columns: { key: string; label: string; align?: "right" | "left" }[] = [
    { key: "invoice_date", label: "Date" },
    { key: "supplier_name", label: "Supplier" },
    { key: "invoice_number", label: "Invoice No." },
    { key: "item_code", label: "Product No." },
    { key: "master_name", label: "Master Name" },
    { key: "description", label: "Product Description" },
    { key: "quantity", label: "Qty", align: "right" },
    { key: "unit", label: "Order Unit" },
    { key: "unit_price", label: "Unit Price", align: "right" },
    { key: "net_amount", label: "Net Amount", align: "right" },
  ];

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-xs" />
        </div>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-[180px] h-9 text-xs"><SelectValue placeholder="All Suppliers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            {uniqueSuppliers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">
          Showing {filtered.length} of {rows.length} items
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-auto bg-card">
        <table className="w-full text-[12px] leading-tight">
          <thead>
            <tr className="bg-primary text-primary-foreground">
              <th className="px-2 py-2.5 w-8"></th>
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-3 py-2.5 font-semibold whitespace-nowrap cursor-pointer select-none transition-colors hover:bg-primary/80 ${col.align === "right" ? "text-right" : "text-left"}`}
                  onClick={() => toggleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-0.5">
                    {col.label}
                    <SortIcon col={col.key} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="text-center text-muted-foreground py-10 text-sm">No line items found</td>
              </tr>
            ) : (
              filtered.map((row, idx) => (
                <tr key={row.id} className={`border-b border-border/40 transition-colors hover:bg-accent/30 ${idx % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                  <td className="px-2 py-2 text-center">
                    {row.file_url ? (
                      <button
                        onClick={() => { setViewerFileUrl(row.file_url); setViewerTitle(`Invoice ${row.invoice_number}`); setViewerOpen(true); }}
                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                        title="View attachment"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatDate(row.invoice_date)}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{row.supplier_name}</td>
                  <td className="px-3 py-2 tabular-nums">{row.invoice_number}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{row.item_code}</td>
                  <td className="px-3 py-2 text-foreground">{row.master_name}</td>
                  <td className="px-3 py-2 max-w-[280px] truncate text-muted-foreground">{row.description}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{row.quantity}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.unit}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatCurrency(row.unit_price)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold text-foreground">{formatCurrency(row.net_amount)}</td>
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-primary/10 border-t-2 border-primary/30">
                <td colSpan={10} className="px-3 py-2.5 text-right font-semibold text-foreground text-[12px]">Total</td>
                <td className="px-3 py-2.5 text-right font-bold tabular-nums text-foreground text-[13px]">{formatCurrency(totalNet)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
