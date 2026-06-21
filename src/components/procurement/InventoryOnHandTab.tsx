import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Package, DollarSign, TrendingUp, Search, ArrowUpDown, ArrowUp, ArrowDown, Download, AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { downloadCSV } from "@/utils/csvDownload";
import { Button } from "@/components/ui/button";

interface ProductRow {
  id: string;
  internal_sku: string;
  internal_product_name: string;
  level1_category: string;
  unit: string;
  unit_cost: number; // supplier-marked price
  status: string;
  min_stock_qty?: number | null;
  reorder_qty?: number | null;
}

interface AggregatedLineItem {
  product_master_id: string;
  total_qty: number;
  total_spend: number;
}

interface InventoryRow extends ProductRow {
  qty_on_hand: number;
  avg_cost: number;
  cost_value: number;
  supplier_value: number;
}

type SortKey = "internal_sku" | "internal_product_name" | "level1_category" | "qty_on_hand" | "avg_cost" | "cost_value" | "unit_cost" | "supplier_value";

export default function InventoryOnHandTab() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [lineAgg, setLineAgg] = useState<AggregatedLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortColumns, setSortColumns] = useState<Array<{key: SortKey, dir: "asc"|"desc"}>>([{ key: "internal_sku", dir: "asc" }]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [prodData, lineRes] = await Promise.all([
      fetchAllRows("product_master", "id, internal_sku, internal_product_name, level1_category, unit, unit_cost, status, min_stock_qty, reorder_qty", { col: "internal_sku", asc: true }),
      supabase.rpc("get_inventory_aggregates" as any),
    ]);

    setProducts((prodData as any[]).filter((p) => p.status === "Active") as ProductRow[]);

    // If RPC doesn't exist yet, fall back to client-side aggregation
    if (lineRes.error || !lineRes.data) {
      const fallback = await fetchAllRows("invoice_line_items", "product_master_id, quantity, total");
      const map = new Map<string, { qty: number; spend: number }>();
      for (const row of fallback as any[]) {
        if (!row.product_master_id) continue;
        const existing = map.get(row.product_master_id) || { qty: 0, spend: 0 };
        existing.qty += Number(row.quantity) || 0;
        existing.spend += Number(row.total) || 0;
        map.set(row.product_master_id, existing);
      }
      setLineAgg(Array.from(map.entries()).map(([id, v]) => ({ product_master_id: id, total_qty: v.qty, total_spend: v.spend })));
    } else {
      setLineAgg((lineRes.data as any[]).map((r: any) => ({ product_master_id: r.product_master_id, total_qty: Number(r.total_qty), total_spend: Number(r.total_spend) })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const aggMap = useMemo(() => {
    const m = new Map<string, { qty: number; spend: number }>();
    for (const a of lineAgg) m.set(a.product_master_id, { qty: a.total_qty, spend: a.total_spend });
    return m;
  }, [lineAgg]);

  const rows: InventoryRow[] = useMemo(() => {
    return products.map((p) => {
      const agg = aggMap.get(p.id);
      const qty = agg?.qty ?? 0;
      const spend = agg?.spend ?? 0;
      const avgCost = qty > 0 ? spend / qty : 0;
      return {
        ...p,
        qty_on_hand: qty,
        avg_cost: avgCost,
        cost_value: avgCost * qty,
        supplier_value: p.unit_cost * qty,
      };
    });
  }, [products, aggMap]);

  const categories = useMemo(
    () =>
      [...new Set(products.map((p) => p.level1_category?.trim()).filter((category): category is string => Boolean(category)))].sort(),
    [products]
  );

  const filtered = useMemo(() => {
    let list = rows;
    if (categoryFilter !== "all") list = list.filter((r) => r.level1_category === categoryFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.internal_product_name.toLowerCase().includes(q) || r.internal_sku.toLowerCase().includes(q));
    }
    if (sortColumns.length > 0) {
      list.sort((a, b) => {
        for (const { key, dir } of sortColumns) {
          const av = a[key], bv = b[key];
          const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""));
          if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
        }
        return 0;
      });
    }
    return list;
  }, [rows, categoryFilter, search, sortColumns]);

  const totals = useMemo(() => ({
    costValue: filtered.reduce((s, r) => s + r.cost_value, 0),
    supplierValue: filtered.reduce((s, r) => s + r.supplier_value, 0),
    skus: filtered.length,
  }), [filtered]);

  const handleSort = (key: SortKey) => {
    setSortColumns(prev => {
      const idx = prev.findIndex(s => s.key === key);
      if (idx === -1) return [...prev, { key, dir: "asc" as const }];
      if (prev[idx].dir === "asc") return prev.map((s, i) => i === idx ? { ...s, dir: "desc" as const } : s);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => {
    const entry = sortColumns.find(s => s.key === col);
    return (
      <Button variant="ghost" size="sm" className="h-auto p-0 font-medium text-xs hover:bg-transparent" onClick={() => handleSort(col)}>
        {label}
        {!entry ? <ArrowUpDown className="ml-1 h-3 w-3 opacity-30" /> : (
          <span className="ml-1 inline-flex items-center gap-0.5">
            {entry.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {sortColumns.length > 1 && <span className="text-[9px] font-bold">{sortColumns.indexOf(entry) + 1}</span>}
          </span>
        )}
      </Button>
    );
  };

  if (loading) return <div className="py-12 text-center text-muted-foreground">Loading inventory…</div>;

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-primary/10 p-2"><Package className="h-5 w-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Active SKUs</p><p className="text-xl font-bold tabular-nums">{totals.skus}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-primary/10 p-2"><DollarSign className="h-5 w-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Total Cost Value</p><p className="text-xl font-bold tabular-nums">${fmt(totals.costValue)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-primary/10 p-2"><TrendingUp className="h-5 w-5 text-primary" /></div>
            <div><p className="text-xs text-muted-foreground">Total Supplier & Vendor Value</p><p className="text-xl font-bold tabular-nums">${fmt(totals.supplierValue)}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => downloadCSV(filtered.map(r => ({
          internal_sku: r.internal_sku, internal_product_name: r.internal_product_name,
          level1_category: r.level1_category, qty_on_hand: r.qty_on_hand.toFixed(2),
          unit: r.unit, avg_cost: r.avg_cost.toFixed(2), cost_value: r.cost_value.toFixed(2),
          unit_cost: r.unit_cost.toFixed(2), supplier_value: r.supplier_value.toFixed(2),
        })), [
          { key: "internal_sku", label: "SKU" }, { key: "internal_product_name", label: "Product Name" },
          { key: "level1_category", label: "Category" }, { key: "qty_on_hand", label: "Qty On Hand" },
          { key: "unit", label: "Unit" }, { key: "avg_cost", label: "Avg Cost" },
         { key: "cost_value", label: "Cost Value" }, { key: "unit_cost", label: "Supplier & Vendor Price" },
         { key: "supplier_value", label: "Supplier & Vendor Value" },
        ], "inventory")} className="h-9">
          <Download className="h-4 w-4 mr-1" />Download
        </Button>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary/5">
                <TableHead className="text-xs"><SortHeader label="SKU" col="internal_sku" /></TableHead>
                <TableHead className="text-xs"><SortHeader label="Product Name" col="internal_product_name" /></TableHead>
                <TableHead className="text-xs"><SortHeader label="Category" col="level1_category" /></TableHead>
                <TableHead className="text-xs text-right"><SortHeader label="Qty On Hand" col="qty_on_hand" /></TableHead>
                <TableHead className="text-xs">Unit</TableHead>
                <TableHead className="text-xs text-right"><SortHeader label="Avg Cost" col="avg_cost" /></TableHead>
                <TableHead className="text-xs text-right"><SortHeader label="Cost Value" col="cost_value" /></TableHead>
               <TableHead className="text-xs text-right"><SortHeader label="Supplier & Vendor Price" col="unit_cost" /></TableHead>
               <TableHead className="text-xs text-right"><SortHeader label="Supplier & Vendor Value" col="supplier_value" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No inventory items found.</TableCell></TableRow>
              ) : filtered.map((r, i) => (
                <TableRow key={r.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                  <TableCell className="text-xs font-mono tabular-nums">{r.internal_sku}</TableCell>
                  <TableCell className="text-xs font-medium">{r.internal_product_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.level1_category || "—"}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums font-medium">{r.qty_on_hand > 0 ? fmt(r.qty_on_hand) : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.unit}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">{r.qty_on_hand > 0 ? `$${fmt(r.avg_cost)}` : "—"}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums font-medium">{r.cost_value > 0 ? `$${fmt(r.cost_value)}` : "—"}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">${fmt(r.unit_cost)}</TableCell>
                  <TableCell className="text-xs text-right tabular-nums font-medium">{r.supplier_value > 0 ? `$${fmt(r.supplier_value)}` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            {filtered.length > 0 && (
              <TableFooter>
                <TableRow className="font-semibold">
                  <TableCell colSpan={6} className="text-xs">Totals</TableCell>
                  <TableCell className="text-xs text-right tabular-nums">${fmt(totals.costValue)}</TableCell>
                  <TableCell />
                  <TableCell className="text-xs text-right tabular-nums">${fmt(totals.supplierValue)}</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </Card>
    </div>
  );
}
