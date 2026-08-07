import React, { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { toast } from "sonner";
import { FUZZY, scoreCandidates } from "@/utils/productFuzzyMatch";
import { cn } from "@/lib/utils";
import type { QuickAddEntry } from "./QuickAddProductPopover";

interface BulkLine {
  index: number;
  item_code?: string;
  description?: string;
  unit?: string;
  unit_price?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lines: BulkLine[];
  products: QuickAddEntry[];
  supplierName?: string;
  onCreated: (lineIndex: number, entry: QuickAddEntry) => void;
  onRefresh?: () => void | Promise<void>;
}

interface RowPlan {
  mode: "existing" | "new";
  candidate?: QuickAddEntry;
  internalSku: string;
}

const nextQuickSkuBase = (products: QuickAddEntry[]) => {
  let max = 0;
  for (const p of products) {
    const m = /^QA-(\d+)$/i.exec((p.internal_sku || "").trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
};

export default function QuickAddBulkDialog({
  open,
  onOpenChange,
  lines,
  products,
  supplierName,
  onCreated,
  onRefresh,
}: Props) {
  const { tenantId } = useActiveTenant();
  const [saving, setSaving] = useState(false);

  const initialPlans = useMemo(() => {
    const base = nextQuickSkuBase(products);
    let n = 0;
    const map: Record<number, RowPlan> = {};
    for (const l of lines) {
      const top = scoreCandidates(
        { itemCode: l.item_code, description: l.description },
        products as any,
        supplierName,
        1,
      )[0];
      const cand = top && top.rawNameScore >= FUZZY.SUGGEST && top.blockingReasons.length === 0
        ? top.entry as QuickAddEntry
        : undefined;
      n += 1;
      map[l.index] = {
        mode: cand ? "existing" : "new",
        candidate: cand,
        internalSku: `QA-${String(base + n).padStart(4, "0")}`,
      };
    }
    return map;
  }, [lines, products, supplierName]);

  const [plans, setPlans] = useState<Record<number, RowPlan>>(initialPlans);
  React.useEffect(() => { if (open) setPlans(initialPlans); }, [open, initialPlans]);

  const setPlan = (idx: number, patch: Partial<RowPlan>) =>
    setPlans((p) => ({ ...p, [idx]: { ...p[idx], ...patch } }));

  /** internal_sku (lowercased) -> product name, for conflict flagging. */
  const skuOwners = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) {
      const k = (p.internal_sku || "").trim().toLowerCase();
      if (k && !m.has(k)) m.set(k, p.internal_product_name || "another product");
    }
    return m;
  }, [products]);

  const conflicts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of lines) {
      const plan = plans[l.index];
      if (!plan || plan.mode !== "new") continue;
      const k = plan.internalSku.trim().toLowerCase();
      if (k) counts.set(k, (counts.get(k) || 0) + 1);
    }
    const out: Record<number, string> = {};
    for (const l of lines) {
      const plan = plans[l.index];
      if (!plan || plan.mode !== "new") continue;
      const k = plan.internalSku.trim().toLowerCase();
      if (!k) { out[l.index] = "Internal SKU is required."; continue; }
      const owner = skuOwners.get(k);
      if (owner) out[l.index] = `SKU already in use by ${owner}.`;
      else if ((counts.get(k) || 0) > 1) out[l.index] = "SKU duplicated on another line.";
    }
    return out;
  }, [lines, plans, skuOwners]);

  const hasConflicts = Object.keys(conflicts).length > 0;


  const insertSupplierEntry = async (productMasterId: string, l: BulkLine): Promise<QuickAddEntry | null> => {
    const { data, error } = await supabase
      .from("product_suppliers" as any)
      .insert({
        product_master_id: productMasterId,
        tenant_id: tenantId,
        supplier: supplierName || "",
        external_sku: (l.item_code || "").trim(),
        supplier_product_name: (l.description || "").trim(),
        purchase_unit: (l.unit || "").trim() || null,
        purchase_unit_cost: parseFloat(l.unit_price || "") || 0,
        status: "Active",
      } as any)
      .select("*")
      .single();
    if (error) { toast.error(error.message); return null; }
    const s: any = data;
    return {
      id: productMasterId,
      supplier_entry_id: s.id,
      internal_sku: "",
      external_sku: s.external_sku || "",
      internal_product_name: "",
      supplier_product_name: s.supplier_product_name || "",
      purchase_unit_cost: s.purchase_unit_cost ?? 0,
      supplier: s.supplier || "",
      purchase_unit: s.purchase_unit || "",
      stock_uom: s.stock_uom || "",
      stock_qty: s.stock_qty ?? 1,
    };
  };

  const confirmAll = async () => {
    if (!tenantId) return;
    setSaving(true);
    let done = 0;
    try {
      for (const l of lines) {
        const plan = plans[l.index];
        if (!plan) continue;

        if (plan.mode === "existing" && plan.candidate) {
          const sku = (l.item_code || "").trim().toLowerCase();
          const dup = products.find(
            (p) =>
              p.id === plan.candidate!.id &&
              (p.supplier || "").trim().toLowerCase() === (supplierName || "").trim().toLowerCase() &&
              (p.external_sku || "").trim().toLowerCase() === sku,
          );
          if (dup) { onCreated(l.index, dup); done++; continue; }
          const created = await insertSupplierEntry(plan.candidate.id, l);
          if (!created) continue;
          onCreated(l.index, {
            ...created,
            internal_sku: plan.candidate.internal_sku,
            internal_product_name: plan.candidate.internal_product_name,
          });
          done++;
          continue;
        }

        const sku = plan.internalSku.trim();
        const name = (l.description || "").trim();
        if (!sku || !name) continue;

        const { data: existing } = await supabase
          .from("product_master" as any)
          .select("id, internal_product_name")
          .eq("tenant_id", tenantId)
          .eq("internal_sku", sku)
          .limit(1);

        let productId: string;
        let pmName = name;
        if (existing && (existing as any[]).length > 0) {
          productId = (existing as any[])[0].id;
          pmName = (existing as any[])[0].internal_product_name || name;
        } else {
          const { data, error } = await supabase
            .from("product_master" as any)
            .insert({
              tenant_id: tenantId,
              internal_sku: sku,
              internal_product_name: name,
              status: "Draft",
              unit: (l.unit || "").trim() || null,
              unit_cost: parseFloat(l.unit_price || "") || 0,
            } as any)
            .select("id")
            .single();
          if (error) { toast.error(error.message); continue; }
          productId = (data as any).id;
        }

        const created = await insertSupplierEntry(productId, l);
        if (!created) continue;
        onCreated(l.index, { ...created, internal_sku: sku, internal_product_name: pmName });
        done++;
      }

      await onRefresh?.();
      toast.success(`${done} of ${lines.length} lines added & linked.`);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Quick add {lines.length} unmatched line{lines.length === 1 ? "" : "s"}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto rounded-md border border-border divide-y divide-border/50">
          {lines.map((l) => {
            const plan = plans[l.index];
            if (!plan) return null;
            return (
              <div key={l.index} className="p-2 space-y-1.5">
                <div className="text-xs font-medium">{l.description || "(no description)"}</div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  {l.item_code || "no SKU"} · {l.unit || "—"} · {l.unit_price || "0"}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-md bg-muted/40 p-0.5 border border-border/50">
                    <button
                      disabled={!plan.candidate}
                      onClick={() => setPlan(l.index, { mode: "existing" })}
                      className={cn(
                        "px-2 py-1 text-[11px] rounded font-medium",
                        plan.mode === "existing" ? "bg-background ring-1 ring-border" : "text-muted-foreground",
                        !plan.candidate && "opacity-40",
                      )}
                    >
                      Link to existing
                    </button>
                    <button
                      onClick={() => setPlan(l.index, { mode: "new" })}
                      className={cn(
                        "px-2 py-1 text-[11px] rounded font-medium",
                        plan.mode === "new" ? "bg-background ring-1 ring-border" : "text-muted-foreground",
                      )}
                    >
                      Create new
                    </button>
                  </div>

                  {plan.mode === "existing" ? (
                    <span className="text-[11px]">
                      {plan.candidate
                        ? `${plan.candidate.internal_product_name} (${plan.candidate.internal_sku})`
                        : "No candidate"}
                    </span>
                  ) : (
                    <Input
                      className={cn(
                        "h-7 w-32 text-[11px] font-mono",
                        conflicts[l.index] && "border-destructive focus-visible:ring-destructive",
                      )}
                      value={plan.internalSku}
                      onChange={(e) => setPlan(l.index, { internalSku: e.target.value.toUpperCase() })}
                    />
                  )}
                </div>
                {plan.mode === "new" && conflicts[l.index] && (
                  <div className="text-[11px] text-destructive">{conflicts[l.index]}</div>
                )}

              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={confirmAll} disabled={saving || !tenantId}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add & link all"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
