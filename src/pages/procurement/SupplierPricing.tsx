import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Search, TrendingUp, TrendingDown, AlertTriangle, History } from "lucide-react";
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { useActiveTenant } from "@/hooks/useActiveTenant";

const fmtMoney = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string | null | undefined) =>
  !iso ? "—" : new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const fmtPct = (n: number | null) =>
  n === null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

const tooltipStyle = {
  backgroundColor: "hsl(33, 25%, 96%)",
  border: "1px solid hsl(30, 15%, 80%)",
  borderRadius: "0.5rem",
  fontSize: "12px",
  color: "hsl(220, 15%, 15%)",
  boxShadow: "0 4px 24px -4px rgba(0,0,0,0.4)",
};
const tooltipItemStyle = { color: "hsl(220, 15%, 15%)" };
const tooltipLabelStyle = { color: "hsl(220, 15%, 15%)", fontWeight: 600, fontSize: 12 };

const AMBER = "#E8820C";
const TEAL = "hsl(175, 55%, 42%)";

interface ItemPriceData {
  /** Unique row key: product_suppliers.id */
  id: string;
  productSupplierId: string;
  productMasterId: string;
  sku: string;
  name: string;
  category: string;
  supplierName: string;
  supplierId: string | null;
  externalSku: string;
  masterPrice: number;
  lastGrnPrice: number | null;
  lastGrnDate: string | null;
  lastGrnSupplier: string | null;
  avgGrnPrice: number | null;
  priceDrift: number | null;
  grnCount: number;
  priceHistory: { date: string; price: number; supplier: string; grnId: string }[];
}

export default function SupplierPricing() {
  const { tenantId } = useActiveTenant();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ItemPriceData[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [threshold, setThreshold] = useState<number>(5);
  const [search, setSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<ItemPriceData | null>(null);
  const [sheetItem, setSheetItem] = useState<ItemPriceData | null>(null);
  const [onlyWithGrn, setOnlyWithGrn] = useState(false);
  const [onlyWithDrift, setOnlyWithDrift] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function fetchData() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const products = await fetchAllRows(
        "product_master",
        "id, internal_product_name, internal_sku, level1_category, financial_treatment, creates_stock_movement",
        undefined,
        tenantId
      );
      const stockItems = (products || []).filter((p: any) =>
        p.creates_stock_movement !== false &&
        !(p.financial_treatment || "").toLowerCase().startsWith("asset")
      );
      const productMap = new Map<string, any>(stockItems.map((p: any) => [p.id, p]));
      const productIds = stockItems.map((p: any) => p.id);

      const suppliersRaw = await fetchAllRows("suppliers", "id, name", undefined, tenantId);
      const supplierIdToName = new Map<string, string>((suppliersRaw || []).map((s: any) => [s.id, s.name]));
      const supplierNameToId = new Map<string, string>(
        (suppliersRaw || []).map((s: any) => [String(s.name || "").toLowerCase().trim(), s.id])
      );

      const productSuppliers = await fetchAllRows(
        "product_suppliers",
        "id, product_master_id, supplier, purchase_unit_cost, external_sku, supplier_product_name, status",
        undefined,
        tenantId
      );

      // grn_items paginated with explicit FK hint
      const PAGE = 1000;
      let offset = 0;
      const allGrn: any[] = [];
      while (productIds.length > 0) {
        const { data, error } = await supabase
          .from("grn_items")
          .select(`
            id,
            product_master_id,
            unit_cost,
            accepted_qty,
            grn_id,
            goods_received_notes!grn_id ( id, received_date, supplier_id, status, venue )
          `)
          .eq("tenant_id", tenantId)
          .in("product_master_id", productIds)
          .range(offset, offset + PAGE - 1);
        if (error || !data || data.length === 0) break;
        allGrn.push(...data);
        if (data.length < PAGE) break;
        offset += PAGE;
      }
      const confirmed = allGrn.filter((g: any) => g.goods_received_notes?.status === "confirmed");

      // Group GRNs by (product_master_id, supplier_id)
      const grnByPair = new Map<string, any[]>();
      for (const g of confirmed) {
        const supId = g.goods_received_notes?.supplier_id;
        if (!supId) continue;
        const key = `${g.product_master_id}::${supId}`;
        const arr = grnByPair.get(key) || [];
        arr.push(g);
        grnByPair.set(key, arr);
      }

      const computed: ItemPriceData[] = (productSuppliers || [])
        .filter((ps: any) => productMap.has(ps.product_master_id))
        .map((ps: any) => {
          const product = productMap.get(ps.product_master_id);
          const supplierName = String(ps.supplier || "").trim();
          const supplierId = supplierNameToId.get(supplierName.toLowerCase()) || null;
          const pairKey = supplierId ? `${ps.product_master_id}::${supplierId}` : "";
          const pairGrns = (pairKey && grnByPair.get(pairKey)) || [];
          const sorted = pairGrns.slice().sort((a: any, b: any) =>
            new Date(b.goods_received_notes.received_date).getTime() -
            new Date(a.goods_received_notes.received_date).getTime()
          );
          const lastGrn = sorted[0] ?? null;
          const last3 = sorted.slice(0, 3);
          const avgGrnPrice = last3.length > 0
            ? last3.reduce((s: number, g: any) => s + Number(g.unit_cost || 0), 0) / last3.length
            : null;
          const masterPrice = Number(ps.purchase_unit_cost) || 0;
          const lastGrnPrice = lastGrn ? Number(lastGrn.unit_cost) : null;
          const priceDrift = masterPrice > 0 && lastGrnPrice !== null
            ? ((lastGrnPrice - masterPrice) / masterPrice) * 100
            : null;
          const priceHistory = sorted
            .slice()
            .reverse()
            .map((g: any) => ({
              date: g.goods_received_notes.received_date,
              price: Number(g.unit_cost || 0),
              supplier: supplierName || (supplierIdToName.get(g.goods_received_notes.supplier_id) || "Unknown"),
              grnId: g.grn_id,
            }));
          return {
            id: ps.id,
            productSupplierId: ps.id,
            productMasterId: ps.product_master_id,
            sku: product.internal_sku || "",
            name: product.internal_product_name || "(unnamed)",
            category: product.level1_category || "Uncategorised",
            supplierName: supplierName || "—",
            supplierId,
            externalSku: ps.external_sku || "",
            masterPrice,
            lastGrnPrice,
            lastGrnDate: lastGrn?.goods_received_notes?.received_date ?? null,
            lastGrnSupplier: lastGrn ? supplierName : null,
            avgGrnPrice,
            priceDrift,
            grnCount: sorted.length,
            priceHistory,
          };
        });
      setItems(computed);
    } catch (e: any) {
      toast.error(`Failed to load pricing data: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [tenantId]);

  // Filter options
  const categoryOpts = useMemo(() => {
    const s = new Set<string>();
    items.forEach(i => i.category && s.add(i.category));
    return Array.from(s).sort();
  }, [items]);
  const supplierOpts = useMemo(() => {
    const s = new Set<string>();
    items.forEach(i => i.supplierName && i.supplierName !== "—" && s.add(i.supplierName));
    return Array.from(s).sort();
  }, [items]);

  const scoped = useMemo(() => items.filter(i => {
    if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
    if (supplierFilter !== "all" && i.supplierName !== supplierFilter) return false;
    return true;
  }), [items, categoryFilter, supplierFilter]);

  const alertItems = useMemo(() =>
    scoped
      .filter(i => i.priceDrift !== null && Math.abs(i.priceDrift) >= threshold)
      .sort((a, b) => Math.abs(b.priceDrift!) - Math.abs(a.priceDrift!)),
    [scoped, threshold]
  );

  const biggestIncrease = useMemo(() => {
    const pos = alertItems.filter(i => (i.priceDrift ?? 0) > 0);
    return pos[0] || null;
  }, [alertItems]);
  const biggestDecrease = useMemo(() => {
    const neg = alertItems.filter(i => (i.priceDrift ?? 0) < 0)
      .sort((a, b) => a.priceDrift! - b.priceDrift!);
    return neg[0] || null;
  }, [alertItems]);
  const masterGaps = useMemo(() =>
    scoped.filter(i => i.masterPrice === 0 || i.grnCount === 0).length,
    [scoped]
  );

  const searchMatches = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return scoped.filter(i =>
      i.name.toLowerCase().includes(q) ||
      i.sku.toLowerCase().includes(q) ||
      i.supplierName.toLowerCase().includes(q) ||
      i.externalSku.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [scoped, search]);

  const allItemsSorted = useMemo(() => {
    return scoped
      .filter(i => !onlyWithGrn || i.grnCount > 0)
      .filter(i => !onlyWithDrift || (i.priceDrift !== null && Math.abs(i.priceDrift) >= threshold))
      .sort((a, b) => {
        const da = a.priceDrift === null ? -Infinity : Math.abs(a.priceDrift);
        const db = b.priceDrift === null ? -Infinity : Math.abs(b.priceDrift);
        return db - da;
      });
  }, [scoped, onlyWithGrn, onlyWithDrift, threshold]);

  async function handleUpdateMaster(row: ItemPriceData) {
    if (!row.lastGrnPrice || !tenantId) return;
    setUpdatingId(row.id);
    const { error } = await supabase
      .from("product_suppliers")
      .update({ purchase_unit_cost: row.lastGrnPrice })
      .eq("id", row.productSupplierId)
      .eq("tenant_id", tenantId);
    setUpdatingId(null);
    if (error) {
      toast.error(`Failed to update: ${error.message}`);
    } else {
      toast.success(`Master price updated for ${row.name} — ${row.supplierName}`);
      fetchData();
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">Supplier Pricing</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Track actual GRN prices against your Items Master per supplier. Spot price drift before it hits your margins.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[170px] h-9"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categoryOpts.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-[170px] h-9"><SelectValue placeholder="Supplier" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All suppliers</SelectItem>
              {supplierOpts.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(threshold)} onValueChange={v => setThreshold(Number(v))}>
            <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3">±3%</SelectItem>
              <SelectItem value="5">±5%</SelectItem>
              <SelectItem value="10">±10%</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <Card className="card-glass rounded-xl p-10 text-center text-sm text-muted-foreground">Loading pricing data…</Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiBox
              label="Items with price drift"
              value={String(alertItems.length)}
              tint={alertItems.length > 0 ? "amber" : "neutral"}
              sub={`Threshold ±${threshold}%`}
            />
            <KpiBox
              label="Biggest increase"
              value={biggestIncrease ? fmtPct(biggestIncrease.priceDrift) : "—"}
              tint="red"
              sub={biggestIncrease ? `${biggestIncrease.name} — ${biggestIncrease.supplierName}` : "No increases above threshold"}
            />
            <KpiBox
              label="Biggest decrease"
              value={biggestDecrease ? fmtPct(biggestDecrease.priceDrift) : "—"}
              tint="green"
              sub={biggestDecrease ? `${biggestDecrease.name} — ${biggestDecrease.supplierName}` : "No decreases above threshold"}
            />
            <KpiBox
              label="Master price gaps"
              value={String(masterGaps)}
              tint={masterGaps > 0 ? "amber" : "neutral"}
              sub="Items missing master price or GRN history"
            />
          </div>

          {/* Section 2 — Alerts */}
          {alertItems.length > 0 && (
            <Card className="card-glass rounded-xl overflow-hidden">
              <div className="p-5 border-b border-border/50">
                <h2 className="text-sm font-display font-semibold">Price drift alerts</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Item/supplier pairs where actual GRN price differs from Items Master by ≥ {threshold}%
                </p>
              </div>
              {alertItems.some(i => (i.priceDrift ?? 0) > 20) && (
                <div className="px-5 py-3 bg-amber-500/10 border-b border-amber-500/30 flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span>
                    {alertItems.filter(i => (i.priceDrift ?? 0) > 20).length} item/supplier pairs have price increases above 20% — review before next order
                  </span>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-primary text-primary-foreground text-xs">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">SKU</th>
                      <th className="px-3 py-2 text-left font-medium">Item</th>
                      <th className="px-3 py-2 text-left font-medium">Supplier</th>
                      <th className="px-3 py-2 text-left font-medium">Ext. SKU</th>
                      <th className="px-3 py-2 text-left font-medium">Category</th>
                      <th className="px-3 py-2 text-right font-medium">Master price</th>
                      <th className="px-3 py-2 text-right font-medium">Last GRN price</th>
                      <th className="px-3 py-2 text-right font-medium">Drift</th>
                      <th className="px-3 py-2 text-right font-medium">Avg (last 3)</th>
                      <th className="px-3 py-2 text-left font-medium">Last received</th>
                      <th className="px-3 py-2 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alertItems.map(item => {
                      const positive = (item.priceDrift ?? 0) > 0;
                      return (
                        <tr
                          key={item.id}
                          className={`border-b border-border/40 hover:bg-primary/5 transition-colors border-l-[3px] ${positive ? "border-l-red-500/70" : "border-l-green-500/70"}`}
                        >
                          <td className="px-3 py-2 font-mono text-xs">{item.sku}</td>
                          <td className="px-3 py-2 font-semibold">{item.name}</td>
                          <td className="px-3 py-2 text-xs">{item.supplierName}</td>
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.externalSku || "—"}</td>
                          <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{item.category}</Badge></td>
                          <td className="px-3 py-2 text-right text-muted-foreground td-num">{fmtMoney(item.masterPrice || null)}</td>
                          <td className="px-3 py-2 text-right td-num">{fmtMoney(item.lastGrnPrice)}</td>
                          <td className={`px-3 py-2 text-right font-bold td-num ${positive ? "text-red-400" : "text-green-400"}`}>
                            {positive ? "↑" : "↓"} {fmtPct(item.priceDrift)}
                          </td>
                          <td className="px-3 py-2 text-right text-muted-foreground td-num">{fmtMoney(item.avgGrnPrice)}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(item.lastGrnDate)}</td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={updatingId === item.id || !item.lastGrnPrice}
                              onClick={() => handleUpdateMaster(item)}
                            >
                              {updatingId === item.id ? "…" : "Update master"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Section 3 — Price history search */}
          <Card className="card-glass rounded-xl p-5 space-y-4">
            <div>
              <h2 className="text-sm font-display font-semibold">Price history</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Search for any item/supplier pair to see its price trend from GRN receipts
              </p>
            </div>
            <div className="relative">
              <div className="flex gap-3 items-center">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search item, SKU, supplier..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {selectedItem && (
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedItem(null); setSearch(""); }}>
                    Clear
                  </Button>
                )}
              </div>
              {search && searchMatches.length > 0 && !selectedItem && (
                <div className="absolute z-10 mt-1 max-w-sm w-full bg-popover border border-border rounded-md shadow-lg overflow-hidden">
                  {searchMatches.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setSelectedItem(m); setSearch(`${m.name} — ${m.supplierName}`); }}
                      className="w-full text-left px-3 py-2 hover:bg-primary/10 border-b border-border/40 last:border-0"
                    >
                      <div className="text-sm font-medium">{m.name} <span className="text-muted-foreground font-normal">— {m.supplierName}</span></div>
                      <div className="text-xs text-muted-foreground font-mono">{m.sku}{m.externalSku ? ` · ext ${m.externalSku}` : ""} · {m.category}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedItem ? (
              <ItemHistory item={selectedItem} />
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Search for an item/supplier pair above to see its price history</p>
              </div>
            )}
          </Card>

          {/* Section 4 — All items */}
          <Card className="card-glass rounded-xl overflow-hidden">
            <div className="p-5 border-b border-border/50 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-display font-semibold">All item/supplier pairs</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Master price vs last GRN price, per supplier</p>
              </div>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Switch id="grn-only" checked={onlyWithGrn} onCheckedChange={setOnlyWithGrn} />
                  <Label htmlFor="grn-only" className="text-xs">Only with GRN history</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="drift-only" checked={onlyWithDrift} onCheckedChange={setOnlyWithDrift} />
                  <Label htmlFor="drift-only" className="text-xs">Only with price drift</Label>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-primary text-primary-foreground text-xs sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium w-20">SKU</th>
                    <th className="px-3 py-2 text-left font-medium">Item</th>
                    <th className="px-3 py-2 text-left font-medium w-32">Supplier</th>
                    <th className="px-3 py-2 text-left font-medium w-24">Ext. SKU</th>
                    <th className="px-3 py-2 text-left font-medium w-28">Category</th>
                    <th className="px-3 py-2 text-right font-medium w-24">Master</th>
                    <th className="px-3 py-2 text-right font-medium w-24">Last GRN</th>
                    <th className="px-3 py-2 text-right font-medium w-20">Drift</th>
                    <th className="px-3 py-2 text-left font-medium w-28">Last received</th>
                    <th className="px-3 py-2 text-right font-medium w-16">GRNs</th>
                    <th className="px-3 py-2 text-right font-medium w-20">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {allItemsSorted.map(item => {
                    const drift = item.priceDrift;
                    const positive = drift !== null && drift > 0;
                    const negative = drift !== null && drift < 0;
                    const borderClass = positive
                      ? "border-l-red-500/70"
                      : negative ? "border-l-green-500/70" : "border-l-transparent";
                    return (
                      <tr
                        key={item.id}
                        className={`border-b border-border/40 hover:bg-primary/5 transition-colors border-l-[3px] ${borderClass}`}
                      >
                        <td className="px-3 py-2 font-mono text-xs">{item.sku}</td>
                        <td className="px-3 py-2 font-semibold truncate max-w-[200px]" title={item.name}>{item.name}</td>
                        <td className="px-3 py-2 text-xs truncate max-w-[140px]" title={item.supplierName}>{item.supplierName}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.externalSku || "—"}</td>
                        <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{item.category}</Badge></td>
                        <td className="px-3 py-2 text-right td-num text-muted-foreground">
                          {item.masterPrice > 0 ? fmtMoney(item.masterPrice) : <span className="text-muted-foreground/50">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right td-num">{fmtMoney(item.lastGrnPrice)}</td>
                        <td className={`px-3 py-2 text-right td-num font-medium ${positive ? "text-red-400" : negative ? "text-green-400" : "text-muted-foreground"}`}>
                          {fmtPct(drift)}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(item.lastGrnDate)}</td>
                        <td className="px-3 py-2 text-right td-num">{item.grnCount}</td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => setSheetItem(item)}>
                            <History className="h-3.5 w-3.5 mr-1" />History
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {allItemsSorted.length === 0 && (
                    <tr><td colSpan={11} className="text-center py-8 text-muted-foreground text-sm">No items match the current filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!sheetItem} onOpenChange={o => !o && setSheetItem(null)}>
        <SheetContent className="sm:max-w-[600px] overflow-y-auto">
          {sheetItem && (
            <>
              <SheetHeader>
                <SheetTitle>{sheetItem.name} — {sheetItem.supplierName}</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                <ItemHistory item={sheetItem} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function KpiBox({ label, value, sub, tint }: { label: string; value: string; sub?: string; tint: "amber" | "red" | "green" | "neutral" }) {
  const tintClass =
    tint === "amber" ? "border-amber-500/40 bg-amber-500/5" :
    tint === "red" ? "border-red-500/40 bg-red-500/5" :
    tint === "green" ? "border-green-500/40 bg-green-500/5" :
    "border-border/50";
  const valueClass =
    tint === "red" ? "text-red-400" :
    tint === "green" ? "text-green-400" :
    tint === "amber" ? "text-amber-400" :
    "text-foreground";
  return (
    <Card className={`card-glass rounded-xl p-4 border ${tintClass}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-display font-bold mt-1 td-num ${valueClass}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1 truncate" title={sub}>{sub}</div>}
    </Card>
  );
}

function ItemHistory({ item }: { item: ItemPriceData }) {
  const prices = item.priceHistory.map(p => p.price);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;
  const avg = prices.length ? prices.reduce((s, n) => s + n, 0) / prices.length : 0;
  const range = max - min;
  const rangePct = min > 0 ? (range / min) * 100 : 0;
  const positive = (item.priceDrift ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">
            {item.name} — {item.supplierName}
            <span className="text-muted-foreground font-mono text-xs ml-2">{item.sku}{item.externalSku ? ` · ext ${item.externalSku}` : ""}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-xs">{item.category}</Badge>
            <span>Last received: {fmtDate(item.lastGrnDate)}</span>
            <span>·</span>
            <span>GRN receipts: {item.grnCount}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Master price</div>
          <div className="text-base font-semibold td-num">{fmtMoney(item.masterPrice || null)}</div>
          {item.priceDrift !== null && (
            <div className={`text-xs font-medium mt-0.5 ${positive ? "text-red-400" : "text-green-400"}`}>
              {positive ? <TrendingUp className="inline h-3 w-3" /> : <TrendingDown className="inline h-3 w-3" />} {fmtPct(item.priceDrift)}
            </div>
          )}
        </div>
      </div>

      {item.priceHistory.length > 0 ? (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={item.priceHistory} margin={{ top: 16, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={d => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              />
              <YAxis
                tickFormatter={v => `$${Number(v).toFixed(2)}`}
                tick={{ fontSize: 10 }}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={tooltipItemStyle}
                labelStyle={tooltipLabelStyle}
                formatter={(v: any, name: string) => [`$${Number(v).toFixed(2)}`, name]}
                labelFormatter={l => new Date(l).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              />
              {item.masterPrice > 0 && (
                <ReferenceLine
                  y={item.masterPrice}
                  stroke={AMBER}
                  strokeDasharray="4 3"
                  strokeOpacity={0.7}
                  label={{ value: "Master price", position: "insideTopRight", fontSize: 10, fill: AMBER }}
                />
              )}
              <Line
                type="monotone"
                dataKey="price"
                stroke={TEAL}
                strokeWidth={2}
                dot={{ r: 4, fill: TEAL, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
                name="GRN price"
              />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <StatBox label="Min price" value={fmtMoney(min)} />
            <StatBox label="Max price" value={fmtMoney(max)} />
            <StatBox label="Avg price" value={fmtMoney(avg)} />
            <StatBox label="Price range" value={`${fmtMoney(range)} (${rangePct.toFixed(1)}%)`} />
            <StatBox label="Receipts" value={`${item.grnCount} GRNs`} />
          </div>
        </>
      ) : (
        <div className="text-center py-8 text-sm text-muted-foreground">No GRN receipts on record from this supplier.</div>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/50 bg-background/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold td-num mt-0.5">{value}</div>
    </div>
  );
}
