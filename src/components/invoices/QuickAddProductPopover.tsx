import React, { useMemo, useState } from "react";
import { Plus, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { toast } from "sonner";
import { FUZZY, scoreCandidates } from "@/utils/productFuzzyMatch";
import { cn } from "@/lib/utils";

export interface QuickAddEntry {
  id: string;
  supplier_entry_id?: string;
  internal_sku: string;
  external_sku: string;
  internal_product_name: string;
  supplier_product_name: string;
  purchase_unit_cost?: number;
  supplier?: string;
  purchase_unit?: string;
  stock_uom?: string;
  stock_qty?: number;
}

interface Props {
  /** Full flattened Product Master (one row per supplier entry). */
  products: QuickAddEntry[];
  supplierName?: string;
  line: {
    item_code?: string;
    description?: string;
    unit?: string;
    unit_price?: string;
  };
  /** Called with the newly created (or reused) supplier-scoped entry. */
  onCreated: (entry: QuickAddEntry) => void;
  /** Ask the parent to refetch the Product Master. */
  onRefresh?: () => void | Promise<void>;
  buttonLabel?: string;
}

const nextQuickSku = (products: QuickAddEntry[]) => {
  let max = 0;
  for (const p of products) {
    const m = /^QA-(\d+)$/i.exec((p.internal_sku || "").trim());
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `QA-${String(max + 1).padStart(4, "0")}`;
};

export default function QuickAddProductPopover({
  products,
  supplierName,
  line,
  onCreated,
  onRefresh,
  buttonLabel = "Quick add",
}: Props) {
  const { tenantId } = useActiveTenant();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Unique products (by product_master_id) for the "existing product" picker.
  const uniqueProducts = useMemo(() => {
    const seen = new Map<string, QuickAddEntry>();
    for (const p of products) if (!seen.has(p.id)) seen.set(p.id, p);
    return Array.from(seen.values());
  }, [products]);

  const bestCandidate = useMemo(() => {
    const cands = scoreCandidates(
      { itemCode: line.item_code, description: line.description },
      products as any,
      supplierName,
      1,
    );
    const top = cands[0];
    return top && top.rawNameScore >= FUZZY.SUGGEST && top.blockingReasons.length === 0
      ? top.entry as QuickAddEntry
      : undefined;
  }, [products, line.item_code, line.description, supplierName]);

  const [mode, setMode] = useState<"existing" | "new">(bestCandidate ? "existing" : "new");
  const [pickedId, setPickedId] = useState<string>(bestCandidate?.id || "");
  const [pickerQuery, setPickerQuery] = useState("");
  const [internalName, setInternalName] = useState(line.description || "");
  const [internalSku, setInternalSku] = useState("");
  const [skuOverridden, setSkuOverridden] = useState(false);
  const [externalSku, setExternalSku] = useState(line.item_code || "");
  const [externalName, setExternalName] = useState(line.description || "");
  const [purchaseUnit, setPurchaseUnit] = useState(line.unit || "");
  const [unitCost, setUnitCost] = useState(line.unit_price || "");

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o) {
      setMode(bestCandidate ? "existing" : "new");
      setPickedId(bestCandidate?.id || "");
      setPickerQuery("");
      setInternalName(line.description || "");
      setInternalSku(nextQuickSku(products));
      setSkuOverridden(false);
      setExternalSku(line.item_code || "");
      setExternalName(line.description || "");
      setPurchaseUnit(line.unit || "");
      setUnitCost(line.unit_price || "");
    }
  };

  const picked = uniqueProducts.find((p) => p.id === pickedId);

  /** Existing product that already owns the typed internal SKU. */
  const skuConflict = useMemo(() => {
    const sku = internalSku.trim().toLowerCase();
    if (mode !== "new" || !sku) return undefined;
    return uniqueProducts.find((p) => (p.internal_sku || "").trim().toLowerCase() === sku);
  }, [mode, internalSku, uniqueProducts]);

  const filteredPicker = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const base = q
      ? uniqueProducts.filter(
          (p) =>
            (p.internal_product_name || "").toLowerCase().includes(q) ||
            (p.internal_sku || "").toLowerCase().includes(q),
        )
      : uniqueProducts;
    return base.slice(0, 40);
  }, [uniqueProducts, pickerQuery]);


  /** Existing supplier entry for the picked product + this supplier + this external SKU. */
  const duplicateEntry = useMemo(() => {
    if (mode !== "existing" || !picked) return undefined;
    const sku = (externalSku || "").trim().toLowerCase();
    return products.find(
      (p) =>
        p.id === picked.id &&
        (p.supplier || "").trim().toLowerCase() === (supplierName || "").trim().toLowerCase() &&
        (p.external_sku || "").trim().toLowerCase() === sku,
    );
  }, [mode, picked, products, externalSku, supplierName]);

  const insertSupplierEntry = async (productMasterId: string): Promise<QuickAddEntry | null> => {
    const { data, error } = await supabase
      .from("product_suppliers" as any)
      .insert({
        product_master_id: productMasterId,
        tenant_id: tenantId,
        supplier: supplierName || "",
        external_sku: externalSku.trim(),
        supplier_product_name: externalName.trim(),
        purchase_unit: purchaseUnit.trim() || null,
        purchase_unit_cost: parseFloat(unitCost) || 0,
        status: "Active",
      } as any)
      .select("*")
      .single();
    if (error) {
      toast.error(error.message);
      return null;
    }
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

  const confirm = async () => {
    if (!tenantId) return;
    setSaving(true);
    try {
      if (mode === "existing") {
        if (!picked) {
          toast.error("Pick the existing product first.");
          return;
        }
        if (duplicateEntry) {
          onCreated(duplicateEntry);
          toast.success("This supplier entry already exists — linked it.");
          setOpen(false);
          return;
        }
        const created = await insertSupplierEntry(picked.id);
        if (!created) return;
        onCreated({
          ...created,
          internal_sku: picked.internal_sku,
          internal_product_name: picked.internal_product_name,
        });
        toast.success(`Added ${supplierName || "supplier"} to ${picked.internal_product_name}`);
      } else {
        const sku = internalSku.trim();
        if (!sku || !internalName.trim()) {
          toast.error("Internal SKU and name are required.");
          return;
        }
        if (skuConflict) {
          toast.error(`Internal SKU ${sku} is already used by ${skuConflict.internal_product_name}.`);
          return;
        }
        // Server-side guard: the SKU may exist outside the loaded product list.
        const { data: existing } = await supabase
          .from("product_master" as any)
          .select("id, internal_sku, internal_product_name")
          .eq("tenant_id", tenantId)
          .eq("internal_sku", sku)
          .limit(1);

        if (existing && (existing as any[]).length > 0) {
          const hit = (existing as any[])[0];
          toast.error(
            `Internal SKU ${sku} is already in use by ${hit.internal_product_name || "another product"} — pick it under "New supplier for existing" or change the SKU.`,
          );
          setMode("existing");
          setPickedId(hit.id);
          setPickerQuery(hit.internal_sku || "");
          return;
        }

        let productId: string;
        let pmName = internalName.trim();
        {

          const { data, error } = await supabase
            .from("product_master" as any)
            .insert({
              tenant_id: tenantId,
              internal_sku: sku,
              internal_product_name: internalName.trim(),
              status: "Draft",
              unit: purchaseUnit.trim() || null,
              unit_cost: parseFloat(unitCost) || 0,
            } as any)
            .select("id")
            .single();
          if (error) {
            toast.error(error.message);
            return;
          }
          productId = (data as any).id;
        }

        const created = await insertSupplierEntry(productId);
        if (!created) return;
        onCreated({ ...created, internal_sku: sku, internal_product_name: pmName });
        toast.success(`Added ${pmName} — finish setup later in Products`);
      }
      await onRefresh?.();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] gap-1">
          <Plus className="h-3 w-3" /> {buttonLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] z-[70] p-3 space-y-3" align="start">
        <div className="inline-flex items-center gap-1 rounded-md bg-muted/40 p-0.5 border border-border/50 w-full">
          {(["existing", "new"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 px-2 py-1 text-[11px] rounded font-medium transition-colors",
                mode === m ? "bg-background text-foreground ring-1 ring-border" : "text-muted-foreground",
              )}
            >
              {m === "existing" ? "New supplier for existing" : "Brand new product"}
            </button>
          ))}
        </div>

        {mode === "existing" ? (
          <div className="space-y-2">
            {picked ? (
              <div className="rounded-md border border-border bg-card/40 px-2 py-1.5 text-xs">
                <div className="font-medium">{picked.internal_product_name}</div>
                <div className="text-muted-foreground font-mono text-[11px]">{picked.internal_sku}</div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Pick the product this line belongs to.</div>
            )}
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="h-8 pl-7 text-xs"
                placeholder="Search products…"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
              />
            </div>
            <div className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border/50">
              {filteredPicker.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPickedId(p.id)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 text-xs hover:bg-muted/50",
                    p.id === pickedId && "bg-muted/60",
                  )}
                >
                  <div className="truncate">{p.internal_product_name}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{p.internal_sku}</div>
                </button>
              ))}
              {filteredPicker.length === 0 && (
                <div className="px-2 py-3 text-xs text-muted-foreground">No products found.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label className="text-[11px]">Internal name</Label>
              <Input className="h-8 text-xs" value={internalName} onChange={(e) => setInternalName(e.target.value)} />
            </div>
            <div>
              <Label className="text-[11px]">Internal SKU</Label>
              <Input className="h-8 text-xs font-mono" value={internalSku} onChange={(e) => setInternalSku(e.target.value)} />
            </div>
            <div>
              <Label className="text-[11px]">Supplier</Label>
              <Input className="h-8 text-xs" value={supplierName || ""} disabled />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <Label className="text-[11px]">External name</Label>
            <Input className="h-8 text-xs" value={externalName} onChange={(e) => setExternalName(e.target.value)} />
          </div>
          <div>
            <Label className="text-[11px]">External SKU</Label>
            <Input className="h-8 text-xs font-mono" value={externalSku} onChange={(e) => setExternalSku(e.target.value)} />
          </div>
          <div>
            <Label className="text-[11px]">Purchase UOM</Label>
            <Input className="h-8 text-xs" value={purchaseUnit} onChange={(e) => setPurchaseUnit(e.target.value)} />
          </div>
          <div>
            <Label className="text-[11px]">Unit cost</Label>
            <Input className="h-8 text-xs td-num" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
          </div>
        </div>

        {duplicateEntry && (
          <div className="text-[11px] text-muted-foreground">
            This supplier entry already exists — confirming will just link it.
          </div>
        )}
        {mode === "new" && (
          <div className="text-[11px] text-muted-foreground">
            Saved as a draft — add category, UOM conversion and GL mapping later in Procurement → Products.
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={confirm} disabled={saving || !tenantId}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add & link"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
