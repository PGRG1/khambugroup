import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Download, AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { downloadCSV } from "@/utils/csvDownload";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import DepositTransactionSheet from "./DepositTransactionSheet";
import InventoryItemSheet, { type InventoryItemSheetLastCount } from "./InventoryItemSheet";

const formatDateShort = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

interface ProductRow {
  id: string;
  internal_sku: string;
  financial_treatment?: string | null;
  internal_product_name: string;
  level1_category: string;
  unit: string;
  unit_cost: number;
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

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtWhole = (n: number) => `HK$ ${Math.round(n || 0).toLocaleString("en-US")}`;
const fmtPrice = (n: number) => `HK$ ${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function StatTile({ label, value, tone, active, onClick }: {
  label: string; value: string;
  tone?: "primary" | "warn" | "danger" | "neutral";
  active?: boolean; onClick?: () => void;
}) {
  const toneCls =
    tone === "primary" ? "text-primary" :
    tone === "warn" ? "text-warning" :
    tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`text-left rounded-lg border border-border/60 bg-card/50 px-3 py-2 transition-colors ${onClick ? "hover:border-border cursor-pointer" : "cursor-default"} ${active ? "ring-2 ring-primary/60 bg-primary/5" : ""}`}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
      <div className={`text-lg font-semibold tabular-nums mt-0.5 ${toneCls}`}>{value}</div>
    </button>
  );
}

export default function InventoryOnHandTab({ mode = "inventory" }: { mode?: "inventory" | "deposits" } = {}) {
  const navigate = useNavigate();
  const { tenantId } = useActiveTenant();
  const isMobile = useIsMobile();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [lineAgg, setLineAgg] = useState<AggregatedLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [sortColumns, setSortColumns] = useState<Array<{ key: SortKey, dir: "asc" | "desc" }>>([{ key: "internal_sku", dir: "asc" }]);
  const [selectedDeposit, setSelectedDeposit] = useState<InventoryRow | null>(null);
  const [selectedItem, setSelectedItem] = useState<InventoryRow | null>(null);
  const [lastCountMap, setLastCountMap] = useState<Map<string, InventoryItemSheetLastCount>>(new Map());

  const fetchData = useCallback(async () => {
    setLoading(true);
    const prodData = await fetchAllRows(
      "product_master",
      "id, internal_sku, internal_product_name, level1_category, unit, unit_cost, status, min_stock_qty, reorder_qty, financial_treatment",
      { col: "internal_sku", asc: true },
      tenantId,
    );

    const isDeposit = (t?: string | null) => (t || "").startsWith("Asset");
    const filteredProducts = (prodData as any[]).filter((p) => {
      if (p.status !== "Active") return false;
      return mode === "deposits" ? isDeposit(p.financial_treatment) : !isDeposit(p.financial_treatment);
    }) as ProductRow[];
    setProducts(filteredProducts);

    if (mode === "deposits") {
      const lineRes: any = await supabase.rpc("get_inventory_aggregates" as any, { p_tenant_id: tenantId } as any);
      if (lineRes.error || !lineRes.data) {
        const [grnHeaders, grnItems] = await Promise.all([
          fetchAllRows("goods_received_notes", "id, status", undefined, tenantId),
          fetchAllRows("grn_items", "product_master_id, accepted_qty, quantity_received, unit_cost, grn_id", undefined, tenantId),
        ]);
        const eligibleGrnIds = new Set(
          (grnHeaders as any[])
            .filter((g) => g.status === "confirmed" || g.status === "disputed")
            .map((g) => g.id),
        );
        const map = new Map<string, { qty: number; spend: number }>();
        for (const row of grnItems as any[]) {
          if (!row.product_master_id) continue;
          if (!eligibleGrnIds.has(row.grn_id)) continue;
          const qty = row.accepted_qty != null ? Number(row.accepted_qty) : Number(row.quantity_received) || 0;
          const cost = Number(row.unit_cost) || 0;
          const existing = map.get(row.product_master_id) || { qty: 0, spend: 0 };
          existing.qty += qty;
          existing.spend += qty * cost;
          map.set(row.product_master_id, existing);
        }
        setLineAgg(Array.from(map.entries()).map(([id, v]) => ({ product_master_id: id, total_qty: v.qty, total_spend: v.spend })));
      } else {
        setLineAgg((lineRes.data as any[]).map((r: any) => ({ product_master_id: r.product_master_id, total_qty: Number(r.total_qty), total_spend: Number(r.total_spend) })));
      }
      setLastCountMap(new Map());
      setLoading(false);
      return;
    }

    const [sessionsRes, grnHeaders, grnItems] = await Promise.all([
      (supabase as any)
        .from("stock_count_sessions")
        .select("id, venue, count_date")
        .eq("tenant_id", tenantId)
        .eq("status", "approved")
        .order("count_date", { ascending: false }),
      fetchAllRows("goods_received_notes", "id, status, received_date", undefined, tenantId),
      fetchAllRows("grn_items", "product_master_id, accepted_qty, quantity_received, unit_cost, grn_id", undefined, tenantId),
    ]);

    const approvedSessions: any[] = sessionsRes?.data ?? [];
    const sessionIds = approvedSessions.map((s: any) => s.id);
    let countItems: any[] = [];
    if (sessionIds.length) {
      const { data } = await (supabase as any)
        .from("stock_count_items")
        .select("session_id, product_master_id, counted_qty, unit_cost")
        .in("session_id", sessionIds);
      countItems = data ?? [];
    }
    const sessionDate = new Map<string, string>(
      approvedSessions.map((s: any) => [s.id, s.count_date as string]),
    );
    const lastCount = new Map<string, InventoryItemSheetLastCount>();
    for (const sess of approvedSessions) {
      const items = countItems.filter((ci: any) => ci.session_id === sess.id);
      for (const ci of items) {
        if (!ci.product_master_id || ci.counted_qty == null) continue;
        if (lastCount.has(ci.product_master_id)) continue;
        lastCount.set(ci.product_master_id, {
          counted_qty: Number(ci.counted_qty),
          count_date: sessionDate.get(sess.id) || sess.count_date,
          session_id: sess.id,
          unit_cost: Number(ci.unit_cost) || 0,
        });
      }
    }
    setLastCountMap(lastCount);

    const eligibleGrnDate = new Map<string, string>();
    for (const g of grnHeaders as any[]) {
      if (g.status !== "confirmed" && g.status !== "disputed") continue;
      eligibleGrnDate.set(g.id, g.received_date);
    }

    const map = new Map<string, { qty: number; spend: number }>();
    for (const p of filteredProducts) {
      const lc = lastCount.get(p.id);
      let qty = lc ? lc.counted_qty : 0;
      let spend = lc ? lc.counted_qty * (lc.unit_cost || p.unit_cost || 0) : 0;
      for (const row of grnItems as any[]) {
        if (row.product_master_id !== p.id) continue;
        const grnDate = eligibleGrnDate.get(row.grn_id);
        if (!grnDate) continue;
        if (lc && !(grnDate > lc.count_date)) continue;
        const q = row.accepted_qty != null ? Number(row.accepted_qty) : Number(row.quantity_received) || 0;
        const c = Number(row.unit_cost) || 0;
        qty += q;
        spend += q * c;
      }
      if (qty !== 0 || spend !== 0 || lc) {
        map.set(p.id, { qty, spend });
      }
    }
    setLineAgg(Array.from(map.entries()).map(([id, v]) => ({ product_master_id: id, total_qty: v.qty, total_spend: v.spend })));
    setLoading(false);
  }, [tenantId, mode]);

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

  const isLowStock = (r: InventoryRow) => r.min_stock_qty != null && r.qty_on_hand > 0 && r.qty_on_hand < (r.min_stock_qty as number);
  const isOutOfStock = (r: InventoryRow) => r.qty_on_hand <= 0;

  const filtered = useMemo(() => {
    let list = rows;
    if (categoryFilter !== "all") list = list.filter((r) => r.level1_category === categoryFilter);
    if (stockFilter === "low") list = list.filter(isLowStock);
    if (stockFilter === "out") list = list.filter(isOutOfStock);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.internal_product_name.toLowerCase().includes(q) || r.internal_sku.toLowerCase().includes(q));
    }
    if (sortColumns.length > 0) {
      list = [...list].sort((a, b) => {
        for (const { key, dir } of sortColumns) {
          const av = a[key], bv = b[key];
          const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""));
          if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
        }
        return 0;
      });
    }
    return list;
  }, [rows, categoryFilter, stockFilter, search, sortColumns]);

  const totals = useMemo(() => ({
    costValue: filtered.reduce((s, r) => s + r.cost_value, 0),
    supplierValue: filtered.reduce((s, r) => s + r.supplier_value, 0),
    skus: filtered.length,
  }), [filtered]);

  const stockStats = useMemo(() => {
    const lowCount = rows.filter(isLowStock).length;
    const outCount = rows.filter(isOutOfStock).length;
    const totalCostValue = rows.reduce((s, r) => s + r.cost_value, 0);
    const suppliersWithDeposits = new Set(rows.filter(r => r.qty_on_hand > 0).map(r => r.id)).size;
    return { lowCount, outCount, totalCostValue, activeCount: rows.filter(r => r.qty_on_hand > 0).length, suppliersWithDeposits };
  }, [rows]);

  const handleSort = (key: SortKey) => {
    setSortColumns(prev => {
      const idx = prev.findIndex(s => s.key === key);
      if (idx === -1) return [...prev, { key, dir: "asc" as const }];
      if (prev[idx].dir === "asc") return prev.map((s, i) => i === idx ? { ...s, dir: "desc" as const } : s);
      return prev.filter((_, i) => i !== idx);
    });
  };

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

  const reorderRows = rows.filter((r) => r.min_stock_qty != null && r.qty_on_hand < (r.min_stock_qty as number));

  const scopeLabel = useMemo(() => {
    const parts: string[] = [];
    parts.push(categoryFilter === "all" ? "All categories" : categoryFilter);
    if (stockFilter === "low") parts.push("Low stock only");
    else if (stockFilter === "out") parts.push("Out of stock only");
    return parts.join(" · ");
  }, [categoryFilter, stockFilter]);

  const toggleStock = (v: "low" | "out") => setStockFilter(prev => prev === v ? "all" : v);

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[64px] rounded-lg border border-border/60 bg-card/40 animate-pulse" />)
        ) : mode === "deposits" ? (
          <>
            <StatTile label="Total Deposits Held" value={fmtWhole(stockStats.totalCostValue)} tone="primary" />
            <StatTile label="Active Deposits" value={stockStats.activeCount.toLocaleString()} />
            <StatTile label="Deposit Items" value={rows.length.toLocaleString()} />
            <StatTile label="Total Supplier Value" value={fmtWhole(rows.reduce((s, r) => s + r.supplier_value, 0))} />
          </>
        ) : (
          <>
            <StatTile label="Total SKUs" value={rows.length.toLocaleString()} />
            <StatTile label="Total Stock Value" value={fmtWhole(stockStats.totalCostValue)} tone="primary" />
            <StatTile label="Low Stock" value={stockStats.lowCount.toLocaleString()} tone={stockStats.lowCount ? "warn" : "neutral"} active={stockFilter === "low"} onClick={() => toggleStock("low")} />
            <StatTile label="Out of Stock" value={stockStats.outCount.toLocaleString()} tone={stockStats.outCount ? "danger" : "neutral"} active={stockFilter === "out"} onClick={() => toggleStock("out")} />
          </>
        )}
      </div>

      {/* Reorder Alerts (inventory only) */}
      {mode === "inventory" && (
        <Collapsible open={alertsOpen} onOpenChange={setAlertsOpen}>
          <div className="rounded-xl border border-border/60 bg-card/50 overflow-hidden">
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition">
                <div className="flex items-center gap-2">
                  {reorderRows.length > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-warning" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  )}
                  <span className="text-sm font-semibold">
                    {reorderRows.length > 0 ? `Reorder Alerts (${reorderRows.length})` : "All stock levels OK"}
                  </span>
                </div>
                {reorderRows.length > 0 && <ChevronDown className={`h-4 w-4 transition ${alertsOpen ? "rotate-180" : ""}`} />}
              </button>
            </CollapsibleTrigger>
            {reorderRows.length > 0 && (
              <CollapsibleContent>
                <div className="border-t border-border/60">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-warning/5">
                        <TableHead className="text-xs">SKU</TableHead>
                        <TableHead className="text-xs">Item Name</TableHead>
                        <TableHead className="text-xs">Category</TableHead>
                        <TableHead className="text-xs text-right">On Hand</TableHead>
                        <TableHead className="text-xs text-right">Min Stock</TableHead>
                        <TableHead className="text-xs text-right">Reorder Qty</TableHead>
                        <TableHead className="text-xs" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reorderRows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs font-mono">{r.internal_sku}</TableCell>
                          <TableCell className="text-xs font-medium">{r.internal_product_name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.level1_category || "—"}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums text-warning font-medium">{fmt(r.qty_on_hand)}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">{fmt(r.min_stock_qty as number)}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">{r.reorder_qty != null ? fmt(r.reorder_qty as number) : "—"}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" onClick={() => navigate("/procurement/purchase-orders")}>Create PO</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CollapsibleContent>
            )}
          </div>
        </Collapsible>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-48 h-9"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => downloadCSV(filtered.map(r => {
          const lc = lastCountMap.get(r.id);
          return {
            internal_sku: r.internal_sku, internal_product_name: r.internal_product_name,
            level1_category: r.level1_category, qty_on_hand: r.qty_on_hand.toFixed(2),
            unit: r.unit,
            basis: lc ? "Stock take" : "GRN total",
            last_count: lc ? formatDateShort(lc.count_date) : "",
            avg_cost: r.avg_cost.toFixed(2), cost_value: r.cost_value.toFixed(2),
            unit_cost: r.unit_cost.toFixed(2), supplier_value: r.supplier_value.toFixed(2),
          };
        }), [
          { key: "internal_sku", label: "SKU" }, { key: "internal_product_name", label: "Product Name" },
          { key: "level1_category", label: "Category" }, { key: "qty_on_hand", label: "Qty On Hand" },
          { key: "unit", label: "Unit" },
          { key: "basis", label: "Basis" }, { key: "last_count", label: "Last Count" },
          { key: "avg_cost", label: "Avg Cost" },
          { key: "cost_value", label: "Cost Value" }, { key: "unit_cost", label: "Supplier & Vendor Price" },
          { key: "supplier_value", label: "Supplier & Vendor Value" },
        ], "inventory")} className="h-9">
          <Download className="h-4 w-4 mr-1" />Download
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {scopeLabel} · <span className="tabular-nums">{filtered.length.toLocaleString()}</span> of <span className="tabular-nums">{rows.length.toLocaleString()}</span> items
      </p>

      {/* Body */}
      {loading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 10 }).map((_, i) => <div key={i} className="h-11 rounded-md border border-border/60 bg-card/40 animate-pulse" />)}
        </div>
      ) : isMobile ? (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm rounded-xl border border-border/60 bg-card/40">No inventory items found.</div>
          ) : filtered.map((r) => {
            const low = isLowStock(r);
            const out = isOutOfStock(r);
            return (
              <button
                key={r.id}
                onClick={() => mode === "deposits" ? setSelectedDeposit(r) : setSelectedItem(r)}
                className={`w-full text-left rounded-lg border p-3 transition-colors min-h-[64px] ${out ? "border-destructive/30 bg-destructive/[0.04]" : low ? "border-warning/30 bg-warning/[0.04]" : "border-border/60 bg-card/50"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{r.internal_product_name}</div>
                    <div className="text-[11px] text-muted-foreground truncate"><span className="font-mono">{r.internal_sku}</span> · {r.level1_category || "—"}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-semibold tabular-nums text-sm ${out ? "text-destructive" : low ? "text-warning" : ""}`}>{fmt(r.qty_on_hand)} <span className="text-muted-foreground font-normal text-[11px]">{r.unit}</span></div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">{fmtWhole(r.cost_value)}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-primary/5">
                  <TableHead className="text-xs"><SortHeader label="SKU" col="internal_sku" /></TableHead>
                  <TableHead className="text-xs"><SortHeader label="Product Name" col="internal_product_name" /></TableHead>
                  <TableHead className="text-xs"><SortHeader label="Category" col="level1_category" /></TableHead>
                  <TableHead className="text-xs text-right"><SortHeader label="Qty On Hand" col="qty_on_hand" /></TableHead>
                  {mode === "inventory" && <TableHead className="text-xs">Basis</TableHead>}
                  {mode === "inventory" && <TableHead className="text-xs whitespace-nowrap">Last count</TableHead>}
                  <TableHead className="text-xs">Unit</TableHead>
                  <TableHead className="text-xs text-right"><SortHeader label="Avg Cost" col="avg_cost" /></TableHead>
                  <TableHead className="text-xs text-right"><SortHeader label="Cost Value" col="cost_value" /></TableHead>
                  <TableHead className="text-xs text-right"><SortHeader label="Supplier & Vendor Price" col="unit_cost" /></TableHead>
                  <TableHead className="text-xs text-right"><SortHeader label="Supplier & Vendor Value" col="supplier_value" /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={mode === "inventory" ? 11 : 9} className="text-center text-muted-foreground py-8">No inventory items found.</TableCell></TableRow>
                ) : filtered.map((r, i) => {
                  const lc = mode === "inventory" ? lastCountMap.get(r.id) : null;
                  const low = isLowStock(r);
                  const out = isOutOfStock(r);
                  const rowTint = out ? "bg-destructive/[0.05]" : low ? "bg-warning/[0.05]" : (i % 2 === 0 ? "bg-background" : "bg-muted/30");
                  return (
                    <TableRow
                      key={r.id}
                      className={`${rowTint} cursor-pointer hover:bg-primary/10`}
                      onClick={() => mode === "deposits" ? setSelectedDeposit(r) : setSelectedItem(r)}
                    >
                      <TableCell className="text-xs font-mono tabular-nums">{r.internal_sku}</TableCell>
                      <TableCell className="text-xs font-medium">{r.internal_product_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.level1_category || "—"}</TableCell>
                      <TableCell className={`text-xs text-right tabular-nums font-medium ${out ? "text-destructive" : low ? "text-warning" : ""}`}>
                        {r.qty_on_hand !== 0 ? fmt(r.qty_on_hand) : "—"}
                      </TableCell>
                      {mode === "inventory" && (
                        <TableCell className="text-xs">
                          {lc ? (
                            <span className="inline-flex items-center rounded-md border border-info/30 bg-info/10 px-2 py-0.5 text-[10px] font-medium text-info">Stock take</span>
                          ) : (
                            <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">GRN total</span>
                          )}
                        </TableCell>
                      )}
                      {mode === "inventory" && (
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{lc ? formatDateShort(lc.count_date) : "—"}</TableCell>
                      )}
                      <TableCell className="text-xs text-muted-foreground">{r.unit}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{r.qty_on_hand !== 0 ? fmtPrice(r.avg_cost) : "—"}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums font-medium">{r.cost_value !== 0 ? fmtWhole(r.cost_value) : "—"}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums">{fmtPrice(r.unit_cost)}</TableCell>
                      <TableCell className="text-xs text-right tabular-nums font-medium">{r.supplier_value !== 0 ? fmtWhole(r.supplier_value) : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              {filtered.length > 0 && (
                <TableFooter>
                  <TableRow className="font-semibold">
                    <TableCell colSpan={mode === "inventory" ? 8 : 6} className="text-xs">Totals</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{fmtWhole(totals.costValue)}</TableCell>
                    <TableCell />
                    <TableCell className="text-xs text-right tabular-nums">{fmtWhole(totals.supplierValue)}</TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </div>
      )}

      {mode === "deposits" && (
        <DepositTransactionSheet
          item={selectedDeposit ? {
            id: selectedDeposit.id,
            internal_sku: selectedDeposit.internal_sku,
            internal_product_name: selectedDeposit.internal_product_name,
            qty_on_hand: selectedDeposit.qty_on_hand,
            cost_value: selectedDeposit.cost_value,
          } : null}
          onClose={() => setSelectedDeposit(null)}
        />
      )}
      {mode === "inventory" && (
        <InventoryItemSheet
          item={selectedItem ? {
            id: selectedItem.id,
            internal_sku: selectedItem.internal_sku,
            internal_product_name: selectedItem.internal_product_name,
            unit: selectedItem.unit,
            qty_on_hand: selectedItem.qty_on_hand,
            avg_cost: selectedItem.avg_cost,
            cost_value: selectedItem.cost_value,
          } : null}
          lastCount={selectedItem ? (lastCountMap.get(selectedItem.id) ?? null) : null}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
}
