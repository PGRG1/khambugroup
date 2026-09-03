import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { PRICE_VARIANCE_EPSILON, pctVaries } from "@/utils/priceVariance";
import { buildSupplierInsights, type SupplierInsightEntry, type SupplierPurchase, type SupplierInsightsResult } from "@/utils/priceInsights";
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
}

/** One lightweight query sizes every linked row trigger in the scanner. */
export function useSupplierInsightAvailability(
  tenantId: string | null | undefined,
  supplierName: string | null | undefined,
  productMasterIds: string[],
) {
  const [availability, setAvailability] = useState<Record<string, SupplierInsightAvailability>>({});
  const key = useMemo(() => [...new Set(productMasterIds.filter(Boolean))].sort().join(","), [productMasterIds]);

  useEffect(() => {
    let cancelled = false;
    const ids = key ? key.split(",") : [];
    if (!tenantId || !ids.length || !supplierName) {
      setAvailability({});
      return;
    }
    (async () => {
      const { data } = await (supabase.from("product_suppliers" as any) as any)
        .select("product_master_id, supplier")
        .eq("tenant_id", tenantId)
        .in("product_master_id", ids);
      if (cancelled) return;
      const currentKey = supplierName.trim().replace(/\s+/g, " ").toLocaleLowerCase();
      const next: Record<string, SupplierInsightAvailability> = {};
      ids.forEach((id) => { next[id] = { historyCount: 0, otherSupplierCount: 0 }; });
      for (const row of (data || []) as any[]) {
        const item = next[row.product_master_id] || { historyCount: 0, otherSupplierCount: 0 };
        const supplierKey = String(row.supplier || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
        if (supplierKey === currentKey) item.historyCount += 1;
        else if (supplierKey) item.otherSupplierCount += 1;
        next[row.product_master_id] = item;
      }
      // A product supplier entry means comparison is available; history is
      // resolved lazily when the overlay opens, so keep this trigger cheap.
      setAvailability(next);
    })();
    return () => { cancelled = true; };
  }, [tenantId, supplierName, key]);

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
  v == null || !Number.isFinite(v) ? "—" : `$${v.toFixed(2)}`;

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
    onUpdateMaster,
  } = props;

  const { rows, loading } = useSupplierPriceHistory(open, tenantId, supplierId, productMasterId);
  const [drillInvoiceId, setDrillInvoiceId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);

  useEffect(() => {
    if (!open) setDrillInvoiceId(null);
  }, [open]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[720px] p-0 gap-0 [&>button]:hidden">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <div className="text-[15px] font-medium truncate">{itemName || "Item"}</div>
            <div className="text-[13px] text-muted-foreground truncate">
              {supplierName || "—"} · {venue || "—"} · last {rows.length} purchases
            </div>
          </div>
          <button
            type="button"
            aria-label="Close price history"
            onClick={() => onOpenChange(false)}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div ref={scrollRef} className="px-5 pb-4 max-h-[70vh] overflow-y-auto">
          {drillInvoiceId ? (
            <InvoiceDrillIn invoiceId={drillInvoiceId} productMasterId={productMasterId} onBack={backToHistory} />
          ) : loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading price history…
            </div>
          ) : (
            <>
              {/* Stat strip */}
              <div className="flex gap-2">
                {stat("Master price", masterNum != null ? money(masterNum) : "—")}
                {stat("This invoice", money(currentUnitCost), variesFromMaster)}
                {stat("6-mo average", avg6 != null ? money(avg6) : "—")}
                {stat(
                  "Change vs last",
                  changeVsLast == null ? "—" : `${changeVsLast > 0 ? "+" : ""}${changeVsLast.toFixed(1)}%`,
                  changeVaries,
                )}
              </div>

              {/* Trend */}
              <div className="mt-3">
                <TrendChart points={chartPoints} masterPrice={masterNum} />
              </div>

              {/* History table */}
              <table className="w-full mt-2 text-[13px]">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="text-left font-normal py-1.5 border-b border-border/60 w-[88px]">Date</th>
                    <th className="text-left font-normal py-1.5 border-b border-border/60">Invoice</th>
                    <th className="text-right font-normal py-1.5 border-b border-border/60 w-[52px]">Qty</th>
                    <th className="text-right font-normal py-1.5 border-b border-border/60 w-[66px]">Unit</th>
                    <th className="text-right font-normal py-1.5 border-b border-border/60 w-[62px]">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((r, i) => {
                    const older = tableRows[i + 1];
                    let delta: number | null = null;
                    if (older && older.unitCost > 0) delta = ((r.unitCost - older.unitCost) / older.unitCost) * 100;
                    const deltaWarn =
                      delta != null && delta > 0 && pctVaries(older!.unitCost, r.unitCost);
                    const showDelta = delta != null && Math.abs(r.unitCost - (older?.unitCost ?? 0)) > PRICE_VARIANCE_EPSILON;
                    return (
                      <tr
                        key={r.lineId}
                        className={`border-b border-border/40 last:border-0 ${r.isCurrent ? "bg-warning/10" : ""}`}
                      >
                        <td className="py-2.5 font-mono text-muted-foreground">{shortDate(r.invoiceDate)}</td>
                        <td className="py-2.5">
                          {r.isCurrent ? (
                            <span className="text-warning font-mono">
                              {r.invoiceNumber}
                              <span className="text-[11px] font-sans"> · current</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openDrill(r.invoiceId)}
                              className="inline-flex items-center gap-0.5 text-primary hover:underline font-mono"
                            >
                              {r.invoiceNumber}
                              <ChevronRight className="h-[13px] w-[13px]" />
                            </button>
                          )}
                        </td>
                        <td className="py-2.5 text-right font-mono">{r.qty}</td>
                        <td className="py-2.5 text-right font-mono">{money(r.unitCost)}</td>
                        <td className={`py-2.5 text-right font-mono ${deltaWarn ? "text-warning" : "text-muted-foreground"}`}>
                          {showDelta ? `${delta! > 0 ? "+" : ""}${delta!.toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Action footer */}
              {variesFromMaster && (
                <div className="flex gap-2 border-t border-border/60 mt-3 pt-3">
                  <Button variant="secondary" className="flex-1" onClick={() => onOpenChange(false)}>
                    Keep master at {money(masterNum)}
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => {
                      onUpdateMaster();
                      onOpenChange(false);
                    }}
                  >
                    Update master to {money(currentUnitCost)}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
