import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, CheckCircle2, AlertCircle } from "lucide-react";
import { Supplier } from "@/hooks/useInvoiceData";
import { useToast } from "@/hooks/use-toast";

interface StandardProduct {
  id: string;
  name: string;
  category: string;
}

interface LineItemRow {
  id: string;
  invoice_date: string;
  supplier_name: string;
  invoice_number: string;
  item_code: string;
  master_name: string;
  standard_product_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  net_amount: number;
}

interface Props {
  suppliers: Supplier[];
}

export default function LineItemsTab({ suppliers }: Props) {
  const [rows, setRows] = useState<LineItemRow[]>([]);
  const [products, setProducts] = useState<StandardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [mappingFilter, setMappingFilter] = useState("all");
  const [sortKey, setSortKey] = useState<string>("invoice_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: items }, { data: invoices }, { data: prods }] = await Promise.all([
      supabase.from("invoice_line_items").select("id, item_code, description, pack_size, quantity, unit, unit_price, tax_amount, total, invoice_id, standard_product_id"),
      supabase.from("invoices").select("id, invoice_number, supplier_id, invoice_date"),
      supabase.from("standard_products").select("id, name, category").eq("is_active", true).order("name"),
    ]);

    if (prods) setProducts(prods as StandardProduct[]);
    if (!items || !invoices) { setLoading(false); return; }

    const invMap = new Map(invoices.map((i: any) => [i.id, i]));
    const supMap = new Map(suppliers.map(s => [s.id, s.name]));
    const prodMap = new Map((prods || []).map((p: any) => [p.id, p.name]));

    const mapped: LineItemRow[] = items.map((li: any) => {
      const inv = invMap.get(li.invoice_id);
      return {
        id: li.id,
        invoice_date: inv?.invoice_date || "",
        supplier_name: inv ? (supMap.get(inv.supplier_id) || "Unknown") : "Unknown",
        invoice_number: inv?.invoice_number || "",
        item_code: li.item_code || "",
        master_name: li.standard_product_id ? (prodMap.get(li.standard_product_id) || "") : "",
        standard_product_id: li.standard_product_id || null,
        description: `${li.description || ""}${li.pack_size ? ` [${li.pack_size}]` : ""}`,
        quantity: li.quantity || 0,
        unit: li.unit || "unit",
        unit_price: li.unit_price || 0,
        net_amount: li.total || 0,
      };
    });

    setRows(mapped);
    setLoading(false);
  }, [suppliers]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const assignMaster = async (lineItemId: string, productId: string) => {
    const { error } = await supabase.from("invoice_line_items").update({ standard_product_id: productId } as any).eq("id", lineItemId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    const prod = products.find(p => p.id === productId);
    setRows(prev => prev.map(r => r.id === lineItemId ? { ...r, standard_product_id: productId, master_name: prod?.name || "" } : r));
    toast({ title: "Assigned", description: `Linked to ${prod?.name}` });
  };

  const clearMaster = async (lineItemId: string) => {
    const { error } = await supabase.from("invoice_line_items").update({ standard_product_id: null } as any).eq("id", lineItemId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setRows(prev => prev.map(r => r.id === lineItemId ? { ...r, standard_product_id: null, master_name: "" } : r));
  };

  const filtered = useMemo(() => {
    let result = rows;
    if (supplierFilter !== "all") result = result.filter(r => r.supplier_name === supplierFilter);
    if (mappingFilter === "unmapped") result = result.filter(r => !r.standard_product_id);
    else if (mappingFilter === "mapped") result = result.filter(r => !!r.standard_product_id);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.description.toLowerCase().includes(q) || r.item_code.toLowerCase().includes(q) ||
        r.master_name.toLowerCase().includes(q) || r.invoice_number.toLowerCase().includes(q) ||
        r.supplier_name.toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) => {
      const av = (a as any)[sortKey], bv = (b as any)[sortKey];
      let cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, supplierFilter, mappingFilter, search, sortKey, sortDir]);

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
  const unmappedCount = rows.filter(r => !r.standard_product_id).length;
  const mappedCount = rows.length - unmappedCount;

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
      {/* Summary badges */}
      <div className="flex gap-2 flex-wrap items-center">
        <Badge variant="outline" className="gap-1 text-xs">
          <CheckCircle2 className="h-3 w-3 text-green-500" /> {mappedCount} mapped
        </Badge>
        <Badge variant="outline" className="gap-1 text-xs">
          <AlertCircle className="h-3 w-3 text-amber-500" /> {unmappedCount} unmapped
        </Badge>
      </div>

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
        <Select value={mappingFilter} onValueChange={setMappingFilter}>
          <SelectTrigger className="w-[150px] h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Items</SelectItem>
            <SelectItem value="unmapped">Unmapped Only</SelectItem>
            <SelectItem value="mapped">Mapped Only</SelectItem>
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
                <td colSpan={10} className="text-center text-muted-foreground py-10 text-sm">No line items found</td>
              </tr>
            ) : (
              filtered.map((row, idx) => (
                <tr key={row.id} className={`border-b border-border/40 transition-colors hover:bg-accent/30 ${idx % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{formatDate(row.invoice_date)}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{row.supplier_name}</td>
                  <td className="px-3 py-2 tabular-nums">{row.invoice_number}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{row.item_code}</td>
                  <td className="px-3 py-1.5 min-w-[180px]">
                    {row.standard_product_id ? (
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                        <span className="text-foreground font-medium truncate">{row.master_name}</span>
                        <button onClick={() => clearMaster(row.id)} className="text-[10px] text-muted-foreground hover:text-destructive ml-1 shrink-0">✕</button>
                      </div>
                    ) : (
                      <Select onValueChange={(v) => assignMaster(row.id, v)}>
                        <SelectTrigger className="h-7 text-[11px] border-dashed border-amber-400/50 bg-amber-500/5 text-amber-600">
                          <SelectValue placeholder="Assign master..." />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map(p => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">
                              {p.name} <span className="text-muted-foreground ml-1">({p.category})</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </td>
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
                <td colSpan={9} className="px-3 py-2.5 text-right font-semibold text-foreground text-[12px]">Total</td>
                <td className="px-3 py-2.5 text-right font-bold tabular-nums text-foreground text-[13px]">{formatCurrency(totalNet)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
