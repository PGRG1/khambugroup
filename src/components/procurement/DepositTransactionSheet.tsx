import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

interface DepositItem {
  id: string;
  internal_sku: string;
  internal_product_name: string;
  qty_on_hand: number;
  cost_value: number;
}

interface TxRow {
  id: string;
  invoice_id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  supplier_name: string | null;
  venue: string | null;
  quantity: number;
  unit_price: number;
  movement: number;
  running: number;
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DepositTransactionSheet({
  item,
  onClose,
}: {
  item: DepositItem | null;
  onClose: () => void;
}) {
  const { tenantId } = useActiveTenant();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<TxRow[]>([]);

  useEffect(() => {
    if (!item || !tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: lines } = await (supabase as any)
        .from("invoice_line_items")
        .select(
          "id, quantity, unit_price, invoice_id, invoices!inner(invoice_number, invoice_date, supplier_id, venue, tenant_id)"
        )
        .eq("product_master_id", item.id)
        .eq("invoices.tenant_id", tenantId);

      const supplierIds = Array.from(
        new Set((lines || []).map((l: any) => l.invoices?.supplier_id).filter(Boolean))
      );
      let supplierMap = new Map<string, string>();
      if (supplierIds.length) {
        const { data: sups } = await (supabase as any)
          .from("suppliers")
          .select("id, name")
          .in("id", supplierIds);
        supplierMap = new Map((sups || []).map((s: any) => [s.id, s.name]));
      }

      const enriched = (lines || []).map((l: any) => {
        const qty = Number(l.quantity) || 0;
        const price = Number(l.unit_price) || 0;
        return {
          id: l.id,
          invoice_id: l.invoice_id,
          invoice_number: l.invoices?.invoice_number ?? null,
          invoice_date: l.invoices?.invoice_date ?? null,
          supplier_name: supplierMap.get(l.invoices?.supplier_id) ?? null,
          venue: l.invoices?.venue ?? null,
          quantity: qty,
          unit_price: price,
          movement: qty * price,
          running: 0,
        };
      });

      // Oldest → newest for running balance
      enriched.sort(
        (a: TxRow, b: TxRow) =>
          (a.invoice_date || "").localeCompare(b.invoice_date || "")
      );
      let running = 0;
      for (const r of enriched) {
        running += r.movement;
        r.running = running;
      }
      // Display newest first
      enriched.reverse();

      if (!cancelled) {
        setRows(enriched);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item, tenantId]);

  const totalPaid = rows.reduce((s, r) => s + (r.movement > 0 ? r.movement : 0), 0);
  const totalReturned = rows.reduce((s, r) => s + (r.movement < 0 ? -r.movement : 0), 0);
  const net = totalPaid - totalReturned;

  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-none p-0 flex flex-col"
        style={{ width: "680px" }}
      >
        {item && (
          <>
            <SheetHeader className="p-6 border-b space-y-1">
              <SheetTitle className="text-lg">
                {item.internal_product_name}{" "}
                <span className="text-muted-foreground font-mono text-sm">
                  — {item.internal_sku}
                </span>
              </SheetTitle>
              <div className="text-sm text-muted-foreground">
                {fmt(item.qty_on_hand)} units outstanding
              </div>
              <div className="text-base font-semibold tabular-nums">
                ${fmt(item.cost_value)}
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="p-6 space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-8 bg-muted/40 animate-pulse rounded" />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  No transactions found for this item.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary/5">
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs">Invoice #</TableHead>
                      <TableHead className="text-xs">Supplier</TableHead>
                      <TableHead className="text-xs">Venue</TableHead>
                      <TableHead className="text-xs text-right">Qty</TableHead>
                      <TableHead className="text-xs text-right">Unit Price</TableHead>
                      <TableHead className="text-xs text-right">Movement</TableHead>
                      <TableHead className="text-xs text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={r.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {r.invoice_date ? formatDate(r.invoice_date) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          <button
                            className="text-primary hover:underline font-mono"
                            onClick={() =>
                              navigate(`/procurement/invoices?invoice=${r.invoice_id}`)
                            }
                          >
                            {r.invoice_number || "—"}
                          </button>
                        </TableCell>
                        <TableCell className="text-xs">{r.supplier_name || "—"}</TableCell>
                        <TableCell className="text-xs">{r.venue || "—"}</TableCell>
                        <TableCell
                          className={`text-xs text-right tabular-nums ${
                            r.quantity >= 0 ? "text-emerald-400" : "text-amber-400"
                          }`}
                        >
                          {fmt(r.quantity)}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          ${fmt(r.unit_price)}
                        </TableCell>
                        <TableCell
                          className={`text-xs text-right tabular-nums font-medium ${
                            r.movement >= 0 ? "text-emerald-400" : "text-amber-400"
                          }`}
                        >
                          {r.movement >= 0 ? "+" : "−"}${fmt(Math.abs(r.movement))}
                        </TableCell>
                        <TableCell className="text-xs text-right tabular-nums">
                          ${fmt(r.running)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="border-t p-6 space-y-2 bg-muted/20">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total deposits paid:</span>
                <span className="tabular-nums font-medium">${fmt(totalPaid)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total returned:</span>
                <span className="tabular-nums font-medium">${fmt(totalReturned)}</span>
              </div>
              <div className="flex justify-between text-base pt-2 border-t">
                <span className="font-semibold">Net outstanding:</span>
                <span
                  className={`tabular-nums font-bold ${
                    net > 0 ? "text-amber-400" : "text-emerald-400"
                  }`}
                >
                  ${fmt(net)}
                </span>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
