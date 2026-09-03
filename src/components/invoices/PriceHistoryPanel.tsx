import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { PRICE_VARIANCE_EPSILON, pctVaries } from "@/utils/priceVariance";
import { buildSupplierInsights, normalizeSupplierName, type SupplierInsightEntry, type SupplierPurchase, type SupplierInsightsResult } from "@/utils/priceInsights";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface PriceHistoryRow {
  lineId: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  qty: number;
  unitCost: number;
  isCurrent?: boolean;
}

interface PriceHistoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string | null | undefined;
  /** Product master id is the only bridge used across supplier entries. */
  productMasterId: string | null | undefined;
  supplierId: string | null | undefined;
  supplierName: string;
  venue: string;
  itemName: string;
  masterPrice: number | null | undefined;
  currentInvoiceNumber: string;
  currentInvoiceDate: string;
  currentQty: number;
  currentUnitCost: number;
  currentPurchaseUnit: string;
  currentStockQty: number;
  currentStockUom: string;
  onUpdateMaster: () => void;
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

const HISTORY_LIMIT = 6;

export interface SupplierInsightAvailability {
  historyCount: number;
  otherSupplierCount: number;
  cheaperCount: number;
}

interface CurrentInsightLine {
  unitPrice: number;
  stockQty: number;
  purchaseUnit: string;
  stockUom: string;
}

/** One batched query sizes every linked row trigger in the scanner. */
export function useSupplierInsightAvailability(
  tenantId: string | null | undefined,
  supplierName: string | null | undefined,
  productMasterIds: string[],
  currentLines: Record<string, CurrentInsightLine> = {},
) {
  const [availability, setAvailability] = useState<Record<string, SupplierInsightAvailability>>({});
  const key = useMemo(() => [...new Set(productMasterIds.filter(Boolean))].sort().join(","), [productMasterIds]);
  const currentKey = useMemo(() => JSON.stringify(currentLines), [currentLines]);

  useEffect(() => {
    let cancelled = false;
    const ids = key ? key.split(",") : [];
    if (!tenantId || !ids.length || !supplierName) {
      setAvailability({});
      return;
    }
    (async () => {
      const [entriesRes, linesRes, suppliersRes] = await Promise.all([
        (supabase.from("product_suppliers" as any) as any).select("id, product_master_id, supplier, purchase_unit, purchase_unit_cost, stock_uom, stock_qty").eq("tenant_id", tenantId).in("product_master_id", ids),
        (supabase.from("invoice_line_items" as any) as any).select("product_master_id, accepted_price, unit_price, accepted_qty, quantity, is_free_unit_line, invoices!inner(supplier_id, invoice_date, invoice_number)").eq("tenant_id", tenantId).in("product_master_id", ids),
        (supabase.from("suppliers" as any) as any).select("id, name").eq("tenant_id", tenantId),
      ]);
      if (cancelled) return;
      const supplierNames = new Map<string, string>((suppliersRes.data || []).map((s: any) => [s.id, s.name]));
      const entries = (entriesRes.data || []).map((entry: any): SupplierInsightEntry => ({ id: entry.id, productMasterId: entry.product_master_id, supplierName: entry.supplier || "", purchaseUnit: entry.purchase_unit || "—", purchasePrice: Number(entry.purchase_unit_cost), stockUom: entry.stock_uom || "", stockQty: Number(entry.stock_qty) }));
      const purchasesByProduct = new Map<string, SupplierPurchase[]>();
      for (const line of (linesRes.data || []) as any[]) {
        const purchases = purchasesByProduct.get(line.product_master_id) || [];
        purchases.push({ supplierName: supplierNames.get(line.invoices?.supplier_id) || "", price: Number(line.accepted_price ?? line.unit_price), date: line.invoices?.invoice_date || "", invoiceNumber: line.invoices?.invoice_number || "", isFree: !!line.is_free_unit_line, quantity: Number(line.accepted_qty ?? line.quantity) });
        purchasesByProduct.set(line.product_master_id, purchases);
      }
      const currentSupplierId = [...supplierNames.entries()].find(([, name]) => normalizeSupplierName(name) === normalizeSupplierName(supplierName))?.[0];
      const next: Record<string, SupplierInsightAvailability> = {};
      for (const id of ids) {
        const productEntries = entries.filter((entry) => entry.productMasterId === id);
        const productLines = (linesRes.data || []).filter((line: any) => line.product_master_id === id);
        const otherSupplierCount = productEntries.filter((entry) => normalizeSupplierName(entry.supplierName) !== normalizeSupplierName(supplierName)).length;
        const historyCount = productLines.filter((line: any) => currentSupplierId && line.invoices?.supplier_id === currentSupplierId).length;
        const line = currentLines[id];
        const result = line ? buildSupplierInsights({ entries: productEntries, purchases: purchasesByProduct.get(id) || [], currentSupplierName: supplierName, currentPurchasePrice: line.unitPrice, currentStockQty: line.stockQty, currentPurchaseUnit: line.purchaseUnit, canonicalStockUom: line.stockUom }) : null;
        next[id] = { historyCount, otherSupplierCount, cheaperCount: result?.cheaperCount || 0 };
      }
      setAvailability(next);
    })();
    return () => { cancelled = true; };
  }, [tenantId, supplierName, key, currentKey]);

  return availability;
}

/** Backward-compatible count hook for other invoice consumers. */
export function useSupplierPurchaseCounts(
  tenantId: string | null | undefined,
  supplierId: string | null | undefined,
  productMasterIds: string[],
) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const key = useMemo(() => [...new Set(productMasterIds.filter(Boolean))].sort().join(","), [productMasterIds]);
  useEffect(() => {
    let cancelled = false;
    const ids = key ? key.split(",") : [];
    if (!tenantId || !supplierId || !ids.length) { setCounts({}); return; }
    (async () => {
      const { data } = await (supabase.from("invoice_line_items" as any) as any)
        .select("product_master_id, invoices!inner(supplier_id)")
        .eq("tenant_id", tenantId).eq("invoices.supplier_id", supplierId).in("product_master_id", ids);
      if (cancelled) return;
      const next: Record<string, number> = {};
      for (const row of (data || []) as any[]) next[row.product_master_id] = (next[row.product_master_id] || 0) + 1;
      setCounts(next);
    })();
    return () => { cancelled = true; };
  }, [tenantId, supplierId, key]);
  return counts;
}

function useSupplierInsights(
  open: boolean,
  tenantId: string | null | undefined,
  productMasterId: string | null | undefined,
  supplierName: string,
  currentUnitCost: number,
  currentStockQty: number,
  currentPurchaseUnit: string,
  currentStockUom: string,
): { result: SupplierInsightsResult | null; loading: boolean; error: string | null } {
  const [result, setResult] = useState<SupplierInsightsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef<Map<string, SupplierInsightsResult>>(new Map());

  useEffect(() => {
    let cancelled = false;
    if (!open || !tenantId || !productMasterId) return;
    const cacheKey = `${tenantId}|${productMasterId}|${supplierName}`;
    const cached = cache.current.get(cacheKey);
    if (cached) { setResult(cached); return; }
    setLoading(true);
    setError(null);
    (async () => {
      const [entriesRes, linesRes, suppliersRes] = await Promise.all([
        (supabase.from("product_suppliers" as any) as any)
          .select("id, product_master_id, supplier, purchase_unit, purchase_unit_cost, stock_uom, stock_qty")
          .eq("tenant_id", tenantId).eq("product_master_id", productMasterId),
        (supabase.from("invoice_line_items" as any) as any)
          .select("accepted_price, unit_price, accepted_qty, quantity, is_free_unit_line, invoices!inner(supplier_id, invoice_date, invoice_number)")
          .eq("tenant_id", tenantId).eq("product_master_id", productMasterId)
          .order("invoices(invoice_date)", { ascending: false }),
        (supabase.from("suppliers" as any) as any).select("id, name").eq("tenant_id", tenantId),
      ]);
      if (cancelled) return;
      if (entriesRes.error || linesRes.error) {
        setError(entriesRes.error?.message || linesRes.error?.message || "Unable to load supplier prices");
        setLoading(false);
        return;
      }
      const supplierNames = new Map<string, string>((suppliersRes.data || []).map((s: any) => [s.id, s.name]));
      const entries: SupplierInsightEntry[] = (entriesRes.data || []).map((entry: any) => ({
        id: entry.id,
        productMasterId: entry.product_master_id,
        supplierName: entry.supplier || "",
        purchaseUnit: entry.purchase_unit || "—",
        purchasePrice: Number(entry.purchase_unit_cost),
        stockUom: entry.stock_uom || "",
        stockQty: Number(entry.stock_qty),
      }));
      const purchases: SupplierPurchase[] = (linesRes.data || []).map((line: any) => ({
        supplierName: supplierNames.get(line.invoices?.supplier_id) || "",
        price: Number(line.accepted_price ?? line.unit_price),
        date: line.invoices?.invoice_date || "",
        invoiceNumber: line.invoices?.invoice_number || "",
        isFree: !!line.is_free_unit_line,
        quantity: Number(line.accepted_qty ?? line.quantity),
      }));
      const built = buildSupplierInsights({
        entries,
        purchases,
        currentSupplierName: supplierName,
        currentPurchasePrice: currentUnitCost,
        currentStockQty,
        currentPurchaseUnit,
        canonicalStockUom: currentStockUom,
      });
      cache.current.set(cacheKey, built);
      setResult(built);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, tenantId, productMasterId, supplierName, currentUnitCost, currentStockQty, currentPurchaseUnit, currentStockUom]);

  return { result, loading, error };
}

function useSupplierPriceHistory(
  open: boolean,
  tenantId: string | null | undefined,
  supplierId: string | null | undefined,
  productMasterId: string | null | undefined,
) {
  const [rows, setRows] = useState<PriceHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const cache = useRef<Map<string, PriceHistoryRow[]>>(new Map());

  useEffect(() => {
    let cancelled = false;
    if (!open || !tenantId || !supplierId || !productMasterId) return;
    const cacheKey = `${tenantId}|${supplierId}|${productMasterId}`;
    const cached = cache.current.get(cacheKey);
    if (cached) {
      setRows(cached);
      return;
    }
    setLoading(true);
    (async () => {
      const { data, error } = await (supabase.from("invoice_line_items" as any) as any)
        .select(
          "id, quantity, accepted_qty, unit_price, accepted_price, invoices!inner(id, invoice_number, invoice_date, supplier_id)",
        )
        .eq("tenant_id", tenantId)
        .eq("product_master_id", productMasterId)
        .eq("invoices.supplier_id", supplierId)
        // Order the PARENT rows by the embedded invoice date. `foreignTable` only
        // sorts rows *inside* an embed (a no-op for a to-one relation), so the
        // spread-column syntax `invoices(invoice_date)` is required here.
        .order("invoices(invoice_date)", { ascending: false })
        .order("invoices(invoice_number)", { ascending: false })
        .limit(HISTORY_LIMIT);
      if (cancelled) return;
      if (error || !data) {
        setRows([]);
        setLoading(false);
        return;
      }
      const mapped: PriceHistoryRow[] = (data as any[]).map((r) => ({
        lineId: r.id,
        invoiceId: r.invoices?.id || "",
        invoiceNumber: r.invoices?.invoice_number || "—",
        invoiceDate: r.invoices?.invoice_date || "",
        qty: Number(r.accepted_qty ?? r.quantity ?? 0),
        unitCost: Number(r.accepted_price ?? r.unit_price ?? 0),
      }));
      cache.current.set(cacheKey, mapped);
      setRows(mapped);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tenantId, supplierId, productMasterId]);

  return { rows, loading };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const money = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : `HK$ ${v.toFixed(2)}`;

const shortDate = (d: string) => {
  if (!d) return "—";
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
};

/* ------------------------------------------------------------------ */
/* Trend chart                                                         */
/* ------------------------------------------------------------------ */

function TrendChart({ points, masterPrice }: { points: PriceHistoryRow[]; masterPrice: number | null | undefined }) {
  const W = 660;
  const H = 90;
  const padX = 14;
  const padY = 22;
  const values = points.map((p) => p.unitCost);
  if (masterPrice != null && Number.isFinite(masterPrice)) values.push(masterPrice);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // Pad the scale so an identical-price history renders flat rather than exaggerated.
  const span = max - min;
  const pad = span < 0.005 ? Math.max(1, Math.abs(max) * 0.2) : span * 0.25;
  const lo = min - pad;
  const hi = max + pad;
  const y = (v: number) => padY + (1 - (v - lo) / (hi - lo)) * (H - padY * 2);
  const x = (i: number) =>
    points.length === 1 ? W / 2 : padX + (i / (points.length - 1)) * (W - padX * 2);

  const poly = points.map((p, i) => `${x(i)},${y(p.unitCost)}`).join(" ");
  const masterY = masterPrice != null && Number.isFinite(masterPrice) ? y(masterPrice) : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Unit cost trend">
      {masterY !== null && (
        <>
          <line
            x1={padX}
            x2={W - padX}
            y1={masterY}
            y2={masterY}
            stroke="hsl(var(--border))"
            strokeWidth={1}
            strokeDasharray="3 4"
          />
          <text x={padX} y={masterY - 5} fontSize={11} fill="hsl(var(--muted-foreground))">
            master {money(masterPrice)}
          </text>
        </>
      )}
      {points.length > 1 && (
        <polyline points={poly} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} />
      )}
      {points.map((p, i) => (
        <circle
          key={p.lineId}
          cx={x(i)}
          cy={y(p.unitCost)}
          r={p.isCurrent ? 5 : 3.5}
          fill={p.isCurrent ? "hsl(var(--warning))" : "hsl(var(--primary))"}
        />
      ))}
      {points.length > 0 && points[points.length - 1].isCurrent && (
        <text
          x={x(points.length - 1)}
          y={Math.min(H - 2, y(points[points.length - 1].unitCost) + 16)}
          fontSize={11}
          textAnchor="middle"
          fill="hsl(var(--muted-foreground))"
        >
          now
        </text>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Invoice drill-in (secondary state)                                  */
/* ------------------------------------------------------------------ */

interface DrillData {
  invoice: any;
  lines: any[];
  supplierName: string;
}

function InvoiceDrillIn({
  invoiceId,
  productMasterId,
  onBack,
}: {
  invoiceId: string;
  productMasterId: string | null | undefined;
  onBack: () => void;
}) {
  const [data, setData] = useState<DrillData | null>(null);
  const [loading, setLoading] = useState(true);
  const [docOpen, setDocOpen] = useState(false);
  const [docFiles, setDocFiles] = useState<{ url: string; isPdf: boolean }[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: inv } = await (supabase.from("invoices" as any) as any)
        .select("id, invoice_number, invoice_date, venue, status, total_amount, file_url, supplier_id")
        .eq("id", invoiceId)
        .maybeSingle();
      const { data: lines } = await (supabase.from("invoice_line_items" as any) as any)
        .select("id, description, quantity, accepted_qty, unit_price, accepted_price, total, product_master_id")
        .eq("invoice_id", invoiceId);
      let supplierName = "—";
      if (inv?.supplier_id) {
        const { data: sup } = await (supabase.from("suppliers" as any) as any)
          .select("name")
          .eq("id", inv.supplier_id)
          .maybeSingle();
        supplierName = sup?.name || "—";
      }
      if (cancelled) return;
      setData({ invoice: inv, lines: lines || [], supplierName });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  useEffect(() => {
    let cancelled = false;
    const fileUrl: string = data?.invoice?.file_url || "";
    if (!docOpen || !fileUrl) return;
    (async () => {
      const paths = fileUrl.split(",").map((p) => p.trim()).filter(Boolean);
      const results = await Promise.all(
        paths.map(async (path) => {
          const { data: signed } = await supabase.storage.from("invoice-files").createSignedUrl(path, 3600);
          return { url: signed?.signedUrl || "", isPdf: (path.split(".").pop() || "").toLowerCase() === "pdf" };
        }),
      );
      if (!cancelled) setDocFiles(results.filter((f) => f.url));
    })();
    return () => {
      cancelled = true;
    };
  }, [docOpen, data?.invoice?.file_url]);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to price history
      </button>

      {loading || !data?.invoice ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading invoice…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-3 text-[13px]">
            <div>
              <div className="text-xs text-muted-foreground">Supplier</div>
              <div>{data.supplierName}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Invoice</div>
              <div className="font-mono">{data.invoice.invoice_number || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Date</div>
              <div className="font-mono">{shortDate(data.invoice.invoice_date)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Venue</div>
              <div>{data.invoice.venue || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Status</div>
              <div className="capitalize">{data.invoice.status || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Doc total</div>
              <div className="font-mono">{money(Number(data.invoice.total_amount ?? 0))}</div>
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th className="text-left font-normal py-1.5 border-b border-border/60">Item</th>
                  <th className="text-right font-normal py-1.5 border-b border-border/60 w-[52px]">Qty</th>
                  <th className="text-right font-normal py-1.5 border-b border-border/60 w-[66px]">Unit</th>
                  <th className="text-right font-normal py-1.5 border-b border-border/60 w-[80px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l: any) => {
                  const highlight = productMasterId && l.product_master_id === productMasterId;
                  return (
                    <tr
                      key={l.id}
                      className={`border-b border-border/40 last:border-0 ${highlight ? "bg-warning/10" : ""}`}
                    >
                      <td className="py-2 pr-2">{l.description || "—"}</td>
                      <td className="py-2 text-right font-mono">{Number(l.accepted_qty ?? l.quantity ?? 0)}</td>
                      <td className="py-2 text-right font-mono">
                        {money(Number(l.accepted_price ?? l.unit_price ?? 0))}
                      </td>
                      <td className="py-2 text-right font-mono">{money(Number(l.total ?? 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {data.invoice.file_url && (
            <div className="border-t border-border/60 pt-2">
              <button
                type="button"
                onClick={() => setDocOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline"
              >
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${docOpen ? "rotate-90" : ""}`} />
                Source document
              </button>
              {docOpen && (
                <div className="mt-2 space-y-3 max-h-[420px] overflow-y-auto">
                  {docFiles.length === 0 ? (
                    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading document…
                    </div>
                  ) : (
                    docFiles.map((f, i) =>
                      f.isPdf ? (
                        <iframe key={i} src={f.url} title={`Page ${i + 1}`} className="w-full h-[380px] rounded-md border" />
                      ) : (
                        <img key={i} src={f.url} alt={`Invoice page ${i + 1}`} className="w-full rounded-md border" loading="lazy" />
                      ),
                    )
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export default function PriceHistoryPanel(props: PriceHistoryPanelProps) {
  const {
    open,
    onOpenChange,
    tenantId,
    productMasterId,
    supplierId,
    supplierName,
    venue,
    itemName,
    masterPrice,
    currentInvoiceNumber,
    currentInvoiceDate,
    currentQty,
    currentUnitCost,
    currentPurchaseUnit,
    currentStockQty,
    currentStockUom,
    onUpdateMaster,
  } = props;

  const { rows, loading } = useSupplierPriceHistory(open, tenantId, supplierId, productMasterId);
  const supplierInsights = useSupplierInsights(
    open,
    tenantId,
    productMasterId,
    supplierName,
    currentUnitCost,
    currentStockQty,
    currentPurchaseUnit,
    currentStockUom,
  );
  const [drillInvoiceId, setDrillInvoiceId] = useState<string | null>(null);
  const [tab, setTab] = useState<"history" | "suppliers">("history");
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);

  useEffect(() => {
    if (!open) {
      setDrillInvoiceId(null);
      setTab("history");
    }
  }, [open]);

  useEffect(() => {
    if (open && !loading && rows.length === 0 && (supplierInsights.result?.rows.length || 0) > 0) {
      setTab("suppliers");
    }
  }, [open, loading, rows.length, supplierInsights.result?.rows.length]);

  const currentRow: PriceHistoryRow = useMemo(
    () => ({
      lineId: "__current__",
      invoiceId: "",
      invoiceNumber: currentInvoiceNumber || "—",
      invoiceDate: currentInvoiceDate,
      qty: currentQty,
      unitCost: currentUnitCost,
      isCurrent: true,
    }),
    [currentInvoiceNumber, currentInvoiceDate, currentQty, currentUnitCost],
  );

  // Newest first for the table, oldest first for the chart.
  const tableRows = useMemo(() => [currentRow, ...rows], [currentRow, rows]);
  const chartPoints = useMemo(() => [...tableRows].reverse(), [tableRows]);

  const lastPrice = rows[0]?.unitCost;
  const avg6 = rows.length ? rows.reduce((s, r) => s + r.unitCost, 0) / rows.length : null;
  const changeVsLast = lastPrice != null && lastPrice > 0 ? ((currentUnitCost - lastPrice) / lastPrice) * 100 : null;

  const masterNum = masterPrice != null && Number.isFinite(masterPrice) ? Number(masterPrice) : null;
  const variesFromMaster = masterNum != null && Math.abs(currentUnitCost - masterNum) > PRICE_VARIANCE_EPSILON;
  const changeVaries = lastPrice != null && pctVaries(lastPrice, currentUnitCost);

  const openDrill = useCallback((invoiceId: string) => {
    savedScroll.current = scrollRef.current?.scrollTop || 0;
    setDrillInvoiceId(invoiceId);
  }, []);

  const backToHistory = useCallback(() => {
    setDrillInvoiceId(null);
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = savedScroll.current;
    });
  }, []);

  const stat = (label: string, value: string, warn = false) => (
    <div className="flex-1 rounded-lg bg-muted/40 px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-[18px] font-medium font-mono ${warn ? "text-warning" : "text-foreground"}`}>{value}</div>
    </div>
  );

  const insight = supplierInsights.result;
  const currentComparable = insight?.currentNormalizedCost != null;
  const currentSourceRow = {
    supplierName,
    purchasePrice: currentUnitCost,
    purchaseUnit: currentPurchaseUnit || "—",
    normalizedCost: insight?.currentNormalizedCost ?? null,
    stockUom: currentStockUom || "—",
    percentDifference: 0,
    latestPurchaseDate: currentInvoiceDate || null,
    source: "This invoice" as const,
    stale: false,
    comparable: currentComparable,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[600px] p-0 gap-0 [&>button]:hidden sm:w-full">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <DialogTitle className="text-[15px] font-medium truncate">Price insights · {itemName || "Item"}</DialogTitle>
            <DialogDescription className="mt-0.5 text-[13px] text-muted-foreground truncate">
              {supplierName || "—"} · {venue || "—"} · {rows.length} prior purchases
            </DialogDescription>
          </div>
          <button
            type="button"
            aria-label="Close price insights"
            onClick={() => onOpenChange(false)}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex border-y border-border/60 px-5" role="tablist" aria-label="Price insight views">
          <button type="button" role="tab" aria-selected={tab === "history"} onClick={() => setTab("history")} className={`border-b-2 px-1 py-2.5 mr-5 text-xs font-medium ${tab === "history" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>
            Price history
          </button>
          <button type="button" role="tab" aria-selected={tab === "suppliers"} onClick={() => setTab("suppliers")} className={`border-b-2 px-1 py-2.5 text-xs font-medium ${tab === "suppliers" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}>
            Other suppliers{insight && insight.cheaperCount > 0 ? ` · ${insight.cheaperCount} cheaper` : ""}
          </button>
        </div>

        <div ref={scrollRef} className="px-5 pb-4 max-h-[70vh] overflow-y-auto">
          {drillInvoiceId ? (
            <InvoiceDrillIn invoiceId={drillInvoiceId} productMasterId={productMasterId} onBack={backToHistory} />
          ) : tab === "suppliers" ? (
            <div className="pt-4" role="tabpanel" aria-label="Other suppliers">
              {supplierInsights.loading ? (
                <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading supplier prices…</div>
              ) : supplierInsights.error ? (
                <div className="py-8 text-sm text-destructive">{supplierInsights.error}</div>
              ) : !insight || insight.rows.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">No other supplier entries for this product.</div>
              ) : (
                <>
                  <div className="mb-3 text-xs text-muted-foreground">
                    Current invoice: <span className="font-medium text-foreground">{money(currentUnitCost)} / {currentPurchaseUnit || "—"}</span>
                    {insight.currentNormalizedCost == null && <span className="ml-2 text-warning">Not comparable — conversion missing</span>}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-xs">
                      <thead><tr className="border-b border-border/60 text-muted-foreground">
                        <th className="py-2 text-left font-normal">Supplier</th><th className="py-2 text-right font-normal">Purchase</th><th className="py-2 text-right font-normal">Per {currentStockUom || "stock UOM"}</th><th className="py-2 text-right font-normal">vs current</th><th className="py-2 text-right font-normal">Latest</th><th className="py-2 text-left font-normal">Source</th>
                      </tr></thead>
                      <tbody>
                        <tr className="border-b border-border/40 bg-warning/10"><td className="py-2.5 font-medium">{currentSourceRow.supplierName} <span className="text-[10px] text-warning">current</span></td><td className="py-2.5 text-right font-mono">{money(currentSourceRow.purchasePrice)} / {currentSourceRow.purchaseUnit}</td><td className="py-2.5 text-right font-mono">{money(currentSourceRow.normalizedCost)}</td><td className="py-2.5 text-right text-muted-foreground">—</td><td className="py-2.5 text-right font-mono">{shortDate(currentSourceRow.latestPurchaseDate || "")}</td><td className="py-2.5">This invoice</td></tr>
                        {insight.rows.map((row) => (
                          <tr key={row.entryId} className="border-b border-border/40 last:border-0">
                            <td className="py-2.5 font-medium">{row.supplierName}{row.stale && <span className="ml-1 text-warning" title="Latest purchase is over 90 days old">stale</span>}</td>
                            <td className="py-2.5 text-right font-mono">{money(row.purchasePrice)} / {row.purchaseUnit}</td>
                            <td className={`py-2.5 text-right font-mono ${row.normalizedCost != null && row.percentDifference != null && row.percentDifference < 0 && currentComparable ? "text-primary" : ""}`}>{row.normalizedCost == null ? <span className="text-warning whitespace-nowrap">Not comparable</span> : money(row.normalizedCost)}</td>
                            <td className={`py-2.5 text-right font-mono ${row.percentDifference != null && row.percentDifference < 0 ? "text-primary" : "text-muted-foreground"}`}>{row.percentDifference == null ? "—" : `${row.percentDifference > 0 ? "+" : ""}${row.percentDifference.toFixed(1)}%`}</td>
                            <td className="py-2.5 text-right font-mono">{shortDate(row.latestPurchaseDate || "")}</td><td className="py-2.5 text-muted-foreground">{row.source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {insight.rows.some((row) => !row.comparable) && <div className="mt-3 text-xs text-warning">Some suppliers cannot be compared — conversion missing.</div>}
                  <div className="mt-4 border-t border-border/60 pt-3 text-xs text-muted-foreground">Compared only when UOM conversion is available.</div>
                </>
              )}
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading price history…</div>
          ) : (
            <div role="tabpanel" aria-label="Price history">
              <div className="flex gap-2 pt-4">
                {stat("Master price", masterNum != null ? money(masterNum) : "—")}{stat("This invoice", money(currentUnitCost), variesFromMaster)}{stat("6-mo average", avg6 != null ? money(avg6) : "—")}{stat("Change vs last", changeVsLast == null ? "—" : `${changeVsLast > 0 ? "+" : ""}${changeVsLast.toFixed(1)}%`, changeVaries)}
              </div>
              <div className="mt-3"><TrendChart points={chartPoints} masterPrice={masterNum} /></div>
              <table className="w-full mt-2 text-[13px]"><thead><tr className="text-xs text-muted-foreground"><th className="text-left font-normal py-1.5 border-b border-border/60 w-[88px]">Date</th><th className="text-left font-normal py-1.5 border-b border-border/60">Invoice</th><th className="text-right font-normal py-1.5 border-b border-border/60 w-[52px]">Qty</th><th className="text-right font-normal py-1.5 border-b border-border/60 w-[66px]">Unit</th><th className="text-right font-normal py-1.5 border-b border-border/60 w-[62px]">Δ</th></tr></thead><tbody>{tableRows.map((r, i) => { const older = tableRows[i + 1]; const delta = older && older.unitCost > 0 ? ((r.unitCost - older.unitCost) / older.unitCost) * 100 : null; const deltaWarn = delta != null && delta > 0 && older ? pctVaries(older.unitCost, r.unitCost) : false; const showDelta = delta != null && older != null && Math.abs(r.unitCost - older.unitCost) > PRICE_VARIANCE_EPSILON; return <tr key={r.lineId} className={`border-b border-border/40 last:border-0 ${r.isCurrent ? "bg-warning/10" : ""}`}><td className="py-2.5 font-mono text-muted-foreground">{shortDate(r.invoiceDate)}</td><td className="py-2.5">{r.isCurrent ? <span className="text-warning font-mono">{r.invoiceNumber}<span className="text-[11px] font-sans"> · current</span></span> : <button type="button" onClick={() => openDrill(r.invoiceId)} className="inline-flex items-center gap-0.5 text-primary hover:underline font-mono">{r.invoiceNumber}<ChevronRight className="h-[13px] w-[13px]" /></button>}</td><td className="py-2.5 text-right font-mono">{r.qty}</td><td className="py-2.5 text-right font-mono">{money(r.unitCost)}</td><td className={`py-2.5 text-right font-mono ${deltaWarn ? "text-warning" : "text-muted-foreground"}`}>{showDelta ? `${delta! > 0 ? "+" : ""}${delta!.toFixed(1)}%` : "—"}</td></tr>; })}</tbody></table>
              {variesFromMaster && <div className="flex gap-2 border-t border-border/60 mt-3 pt-3"><Button variant="secondary" className="flex-1" onClick={() => onOpenChange(false)}>Keep master at {money(masterNum)}</Button><Button variant="secondary" className="flex-1" onClick={() => { onUpdateMaster(); onOpenChange(false); }}>Update master to {money(currentUnitCost)}</Button></div>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
