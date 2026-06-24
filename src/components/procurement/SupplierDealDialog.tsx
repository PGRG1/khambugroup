import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/utils/salesUtils";

export interface SupplierDealEditable {
  id?: string;
  supplier_id: string;
  buy_qty: number;
  free_qty: number;
  notes?: string | null;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  purchaseUnitCost: number;
  purchaseUnit: string;
  stockUom: string;
  suppliers: { id: string; name: string }[];
  existingDeals: { supplier_id: string; id: string }[];
  initial?: SupplierDealEditable | null;
  onSaved: () => void;
}

export default function SupplierDealDialog({
  open, onOpenChange, productId, purchaseUnitCost, purchaseUnit, stockUom,
  suppliers, existingDeals, initial, onSaved,
}: Props) {
  const { tenantId } = useActiveTenant();
  const { toast } = useToast();
  const [supplierId, setSupplierId] = useState("");
  const [buyQty, setBuyQty] = useState("");
  const [freeQty, setFreeQty] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initial) {
      setSupplierId(initial.supplier_id);
      setBuyQty(String(initial.buy_qty));
      setFreeQty(String(initial.free_qty));
      setNotes(initial.notes ?? "");
      setIsActive(initial.is_active);
    } else {
      setSupplierId("");
      setBuyQty("");
      setFreeQty("");
      setNotes("");
      setIsActive(true);
    }
  }, [open, initial]);

  const buy = parseFloat(buyQty) || 0;
  const free = parseFloat(freeQty) || 0;
  const effective = useMemo(() => {
    if (buy <= 0 || free < 0 || buy + free === 0) return 0;
    return (buy * purchaseUnitCost) / (buy + free);
  }, [buy, free, purchaseUnitCost]);
  const saving$ = free * purchaseUnitCost;

  const sanitizedSuppliers = suppliers.filter((s) => s.id && s.name);

  const handleSave = async () => {
    setError(null);
    if (!supplierId) return setError("Supplier is required");
    if (buy <= 0) return setError("Buy qty must be greater than 0");
    if (free <= 0) return setError("Free qty must be greater than 0");
    if (!tenantId) return setError("Missing tenant");

    const dup = existingDeals.find(
      (d) => d.supplier_id === supplierId && d.id !== (initial?.id ?? ""),
    );
    if (dup) return setError("A deal with this supplier already exists");

    setSaving(true);
    try {
      if (initial?.id) {
        const { error: e } = await supabase
          .from("item_supplier_deals" as any)
          .update({
            supplier_id: supplierId,
            buy_qty: buy,
            free_qty: free,
            notes: notes || null,
            is_active: isActive,
          })
          .eq("id", initial.id)
          .eq("tenant_id", tenantId);
        if (e) throw e;
      } else {
        // Hard-delete any prior inactive row for the same (product, supplier, deal_type) to free unique slot
        await supabase
          .from("item_supplier_deals" as any)
          .delete()
          .eq("tenant_id", tenantId)
          .eq("product_id", productId)
          .eq("supplier_id", supplierId)
          .eq("deal_type", "buy_x_get_y_free")
          .eq("is_active", false);

        const { error: e } = await supabase.from("item_supplier_deals" as any).insert({
          tenant_id: tenantId,
          product_id: productId,
          supplier_id: supplierId,
          deal_type: "buy_x_get_y_free",
          buy_qty: buy,
          free_qty: free,
          notes: notes || null,
          is_active: isActive,
        });
        if (e) throw e;
      }
      toast({ title: "Deal saved" });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("duplicate") || msg.includes("unique")) {
        setError("A deal with this supplier already exists");
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit deal" : "Add deal"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Supplier *</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>
                {sanitizedSuppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Deal type</Label>
            <div className="h-9 px-3 text-sm border rounded-md bg-muted/40 flex items-center text-muted-foreground">
              Buy X get Y free
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Buy (units) *</Label>
              <Input type="number" step="0.01" min="0" value={buyQty}
                onChange={(e) => setBuyQty(e.target.value)} className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Get free (units) *</Label>
              <Input type="number" step="0.01" min="0" value={freeQty}
                onChange={(e) => setFreeQty(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. quarterly promo, confirm with rep" className="text-sm h-16" />
          </div>
          <div className="flex items-center justify-between border rounded-md p-2">
            <Label className="text-sm">Active</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
            <div>
              Effective price:{" "}
              <span className="font-mono font-semibold">{formatCurrency(effective)}</span>{" "}
              per {stockUom || purchaseUnit || "unit"}
            </div>
            <div>
              Saving per deal:{" "}
              <span className="font-mono font-semibold">{formatCurrency(saving$)}</span>
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>Save deal</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
