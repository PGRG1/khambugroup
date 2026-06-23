import React, { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";

const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface InventoryItemSheetItem {
  id: string;
  internal_sku: string;
  internal_product_name: string;
  unit: string;
  qty_on_hand: number;
  avg_cost: number;
  cost_value: number;
}

export interface InventoryItemSheetLastCount {
  count_date: string;
  counted_qty: number;
  unit_cost: number;
  session_id: string;
}

interface GrnRow {
  id: string;
  grn_id: string;
  grn_number: string | null;
  received_date: string | null;
  supplier_name: string | null;
  venue: string | null;
  accepted_qty: number;
  unit_cost: number;
  running: number;
}

export default function InventoryItemSheet({
  item,
  lastCount,
  onClose,
}: {
  item: InventoryItemSheetItem | null;
  lastCount: InventoryItemSheetLastCount | null;
  onClose: () => void;
}) {
  const { tenantId } = useActiveTenant();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<GrnRow[]>([]);

  useEffect(() => {
    if (!item || !tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: items } = await (supabase as any)
        .from("grn_items")
        .select("id, grn_id, accepted_qty, unit_cost")
        .eq("product_master_id", item.id)
        .eq("tenant_id", tenantId);

      const grnIds = Array.from(new Set((items || []).map((g: any) => g.grn_id).filter(Boolean)));
      let headerMap = new Map<string, any>();
      if (grnIds.length) {
        const { data: headers } = await (supabase as any)
          .from("goods_received_notes")
          .select("id, grn_number, received_date, venue, supplier_id, status")
          .in("id", grnIds)
          .in("status", ["confirmed", "disputed"]);
        headerMap = new Map((headers || []).map((h: any) => [h.id, h]));
      }
      const supplierIds = Array.from(
        new Set(Array.from(headerMap.values()).map((h: any) => h.supplier_id).filter(Boolean))
      );
      let supplierMap = new Map<string, string>();
      if (supplierIds.length) {
        const { data: sups } = await (supabase as any)
          .from("suppliers")
          .select("id, name")
          .in("id", supplierIds);
        supplierMap = new Map((sups || []).map((s: any) => [s.id, s.name]));
      }

      let enriched: GrnRow[] = (items || [])
        .map((gi: any) => {
          const h = headerMap.get(gi.grn_id);
          if (!h) return null;
          return {
            id: gi.id,
            grn_id: gi.grn_id,
            grn_number: h.grn_number ?? null,
            received_date: h.received_date ?? null,
            supplier_name: supplierMap.get(h.supplier_id) ?? null,
            venue: h.venue ?? null,
            accepted_qty: Number(gi.accepted_qty) || 0,
            unit_cost: Number(gi.unit_cost) || 0,
            running: 0,
          } as GrnRow;
        })
        .filter(Boolean) as GrnRow[];

      if (lastCount?.count_date) {
        enriched = enriched.filter((r) => (r.received_date || "") > lastCount.count_date);
      }

      // Oldest → newest for running balance
      enriched.sort((a, b) =>
        (a.received_date || "").localeCompare(b.received_date || "")
      );
      let running = lastCount ? lastCount.counted_qty : 0;
      for (const r of enriched) {
        running += r.accepted_qty;
        r.running = running;
      }
      enriched.reverse();

      if (!cancelled) {
        setRows(enriched);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item, tenantId, lastCount]);

  const grnQtySince = rows.reduce((s, r) => s + r.accepted_qty, 0);
  const baselineQty = lastCount?.counted_qty ?? 0;
  const estimatedOnHand = baselineQty + grnQtySince;

  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-none p-0 flex flex-col"
        style={{ width: "700px" }}
      >
        {item && (
          <>
            <SheetHeader className="p-6 border-b space-y-2">
              <SheetTitle className="text-lg">
                {item.internal_product_name}{" "}
                <span className="text-muted-foreground font-mono text-sm">
                  — {item.internal_sku}
                </span>
              </SheetTitle>
              <div className="text-sm text-muted-foreground">
                {fmt(item.qty_on_hand)} {item.unit} estimated on hand
              </div>
              <div className="flex gap-4 text-xs">
                <span className="text-muted-foreground">
                  Avg cost: <span className="tabular-nums text-foreground font-medium">${fmt(item.avg_cost)}</span>
                </span>
                <span className="text-muted-foreground">
                  Total value: <span className="tabular-nums text-foreground font-medium">${fmt(item.cost_value)}</span>
                </span>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-auto">
              {/* Section 1 — last count */}
              <div className="p-6 border-b">
                {lastCount ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-1.5">
                    <div className="text-xs uppercase tracking-wide text-amber-500/90 font-semibold">
                      Last stock count
                    </div>
                    <div className="text-sm font-medium">{formatDate(lastCount.count_date)}</div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Counted qty:</span>
                      <span className="tabular-nums font-medium">{fmt(lastCount.counted_qty)} {item.unit}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Count value:</span>
                      <span className="tabular-nums font-medium">
                        ${fmt(lastCount.counted_qty * (lastCount.unit_cost || 0))}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground pt-1">Status: Approved</div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-muted bg-muted/30 p-4 text-sm text-muted-foreground">
                    No stock count recorded yet. Quantity is based on total GRN receipts.
                  </div>
                )}
              </div>

              {/* Section 2 — GRN movements */}
              {loading ? (
                <div className="p-6 space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-8 bg-muted/40 animate-pulse rounded" />
                  ))}
                </div>
              ) : rows.length === 0 && !lastCount ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  No GRN receipts recorded for this item.
                </div>
              ) : rows.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  No GRN receipts since the last stock count.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary/5">
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">GRN #</TableHead>
                      <TableHead className="text-xs">Supplier</TableHead>
                      <TableHead className="text-xs">Venue</TableHead>
                      <TableHead className="text-xs text-right">Qty received</TableHead>
                      <TableHead className="text-xs text-right">Unit cost</TableHead>
                      <TableHead className="text-xs text-right">Running</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={r.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {r.received_date ? formatDate(r.received_date) : "—"}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{r.grn_number || "—"}</TableCell>
                        <TableCell className="text-xs">{r.supplier_name || "—"}</TableCell>
                        <TableCell className="text-xs">{r.venue || "—"}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums text-emerald-400 font-medium">
                          +{fmt(r.accepted_qty)}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">${fmt(r.unit_cost)}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums font-medium">{fmt(r.running)}</TableCell>
                      </TableRow>
                    ))}
                    {lastCount && (
                      <TableRow className="bg-amber-500/5 border-t-2 border-amber-500/30">
                        <TableCell className="text-xs whitespace-nowrap font-medium">
                          {formatDate(lastCount.count_date)}
                        </TableCell>
                        <TableCell className="text-xs italic text-muted-foreground" colSpan={3}>
                          Stock count baseline
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums font-medium">
                          {fmt(lastCount.counted_qty)}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums text-muted-foreground">—</TableCell>
                        <TableCell className="text-xs text-right tabular-nums font-medium">
                          {fmt(lastCount.counted_qty)}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="border-t p-6 space-y-2 bg-muted/20">
              {lastCount ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Stock count baseline:</span>
                    <span className="tabular-nums font-medium">{fmt(baselineQty)} {item.unit}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">GRN receipts since count:</span>
                    <span className="tabular-nums font-medium">+{fmt(grnQtySince)} {item.unit}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">No stock count baseline</span>
                    <span />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total GRN received:</span>
                    <span className="tabular-nums font-medium">{fmt(grnQtySince)} {item.unit}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-base pt-2 border-t">
                <span className="font-semibold">Estimated on hand:</span>
                <span className="tabular-nums font-bold">{fmt(estimatedOnHand)} {item.unit}</span>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
