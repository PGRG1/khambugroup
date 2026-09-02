import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";
import { useToast } from "@/hooks/use-toast";
import { useProductMaster, FINANCIAL_TREATMENTS, type ProductMasterItem, type ProductSupplierEntry } from "@/hooks/useProductMaster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import CategoryCascadeSelect from "@/components/procurement/CategoryCascadeSelect";
import UomSelect from "@/components/procurement/UomSelect";
import {
  buildProductMasterEditorPayload,
  productMasterEditorForm,
  validateProductMasterEditor,
  type ProductMasterEditorForm,
} from "@/utils/productMasterEditor";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string | null;
  supplierEntryId?: string | null;
  supplierName?: string;
  onSaved?: (result: { product: ProductMasterItem; supplier: ProductSupplierEntry | null }) => void | Promise<void>;
}

const emptyForm: ProductMasterEditorForm = {
  internal_sku: "", internal_product_name: "", level1_category: "", level2_category: "", level3_category: "",
  accounting_category: "", financial_treatment: "", default_coa_account_id: "", status: "Active", notes: "",
  stock_uom: "", base_unit_type: "", base_unit_qty: "1", min_stock_qty: "", reorder_qty: "", creates_stock_movement: true,
  purchase_yield: "100", cooking_yield: "100", supplier_product_name: "", external_sku: "", purchase_unit: "",
  purchase_unit_cost: "0", stock_qty: "1", supplier_accounting_category: "", supplier_status: "Active",
};

const field = (label: string, value: string, onChange: (value: string) => void, props: React.ComponentProps<typeof Input> = {}) => (
  <div className="space-y-1.5">
    <Label className="text-xs">{label}</Label>
    <Input {...props} value={value} onChange={(event) => onChange(event.target.value)} className={`h-9 text-sm ${props.className || ""}`} />
  </div>
);

export default function MasterItemEditSheet({ open, onOpenChange, productId, supplierEntryId, supplierName, onSaved }: Props) {
  const { tenantId } = useActiveTenant();
  const { items: coaAccounts } = useChartOfAccounts();
  const { fetchProducts } = useProductMaster();
  const { toast } = useToast();
  const [form, setForm] = useState<ProductMasterEditorForm>(emptyForm);
  const [product, setProduct] = useState<ProductMasterItem | null>(null);
  const [supplier, setSupplier] = useState<ProductSupplierEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmUom, setConfirmUom] = useState(false);
  const [pendingForm, setPendingForm] = useState<ProductMasterEditorForm | null>(null);

  const set = (key: keyof ProductMasterEditorForm, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const supplierLabel = supplierName?.trim() || supplier?.supplier || "this supplier";
  const coaOptions = useMemo(() => coaAccounts.filter((account) => account.is_active), [coaAccounts]);

  useEffect(() => {
    if (!open || !productId || !tenantId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const productResult = await supabase.from("product_master" as any).select("*").eq("id", productId).eq("tenant_id", tenantId).single();
      if (productResult.error || !productResult.data) {
        if (!cancelled) toast({ title: "Could not load item", description: productResult.error?.message || "Product was not found.", variant: "destructive" });
        setLoading(false);
        return;
      }
      let supplierQuery = supabase.from("product_suppliers" as any).select("*").eq("product_master_id", productId).eq("tenant_id", tenantId);
      if (supplierEntryId) supplierQuery = supplierQuery.eq("id", supplierEntryId);
      else if (supplierName?.trim()) supplierQuery = supplierQuery.ilike("supplier", supplierName.trim());
      const supplierResult = await supplierQuery.limit(1);
      if (cancelled) return;
      const loadedProduct = productResult.data as unknown as ProductMasterItem;
      const loadedSupplier = (((supplierResult.data || [])[0] as unknown) as ProductSupplierEntry | undefined) || null;
      setProduct(loadedProduct);
      setSupplier(loadedSupplier);
      setForm(productMasterEditorForm(loadedProduct, loadedSupplier));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, productId, supplierEntryId, supplierName, tenantId, toast]);

  const save = async () => {
    if (!product || !tenantId) return;
    const validation = validateProductMasterEditor(form);
    if (validation) { toast({ title: "Check the item details", description: validation, variant: "destructive" }); return; }
    const duplicate = await supabase.from("product_master" as any).select("id").eq("tenant_id", tenantId).ilike("internal_sku", form.internal_sku.trim()).neq("id", product.id).limit(1);
    if (duplicate.error) { toast({ title: "Could not validate SKU", description: duplicate.error.message, variant: "destructive" }); return; }
    if ((duplicate.data || []).length > 0) { toast({ title: "Duplicate internal SKU", description: "That SKU is already used by another item.", variant: "destructive" }); return; }
    if (product.stock_uom?.trim() && product.stock_uom.trim().toLowerCase() !== form.stock_uom.trim().toLowerCase()) {
      setPendingForm(form);
      setConfirmUom(true);
      return;
    }
    await persist(form);
  };

  const persist = async (nextForm: ProductMasterEditorForm) => {
    if (!product || !tenantId) return;
    setSaving(true);
    const payload = buildProductMasterEditorPayload(nextForm);
    const productUpdate = await supabase.from("product_master" as any).update(payload.product as any).eq("id", product.id).eq("tenant_id", tenantId);
    if (productUpdate.error) {
      setSaving(false);
      toast({ title: "Could not save internal item", description: productUpdate.error.message, variant: "destructive" });
      return;
    }
    let savedSupplier = supplier;
    if (supplier) {
      const supplierUpdate = await supabase.from("product_suppliers" as any).update(payload.supplier as any).eq("id", supplier.id).eq("tenant_id", tenantId);
      if (supplierUpdate.error) {
        setSaving(false);
        toast({ title: "Could not save supplier entry", description: supplierUpdate.error.message, variant: "destructive" });
        return;
      }
      savedSupplier = { ...supplier, ...payload.supplier } as ProductSupplierEntry;
    }
    const oldUom = (product.stock_uom || product.unit || "").trim();
    if (oldUom.toLowerCase() !== nextForm.stock_uom.trim().toLowerCase()) {
      const sync = await supabase.from("product_suppliers" as any).update({ stock_uom: nextForm.stock_uom.trim() }).eq("product_master_id", product.id).eq("tenant_id", tenantId);
      if (sync.error) {
        setSaving(false);
        toast({ title: "Could not sync Stock UOM", description: sync.error.message, variant: "destructive" });
        return;
      }
      if (savedSupplier) savedSupplier = { ...savedSupplier, stock_uom: nextForm.stock_uom.trim() };
    }
    const savedProduct = { ...product, ...payload.product } as ProductMasterItem;
    setProduct(savedProduct);
    setSupplier(savedSupplier);
    setForm(nextForm);
    await fetchProducts();
    await onSaved?.({ product: savedProduct, supplier: savedSupplier });
    setSaving(false);
    setConfirmUom(false);
    setPendingForm(null);
    toast({ title: "Items Master updated", description: "Internal and supplier fields were saved." });
    onOpenChange(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full max-w-2xl p-0 flex flex-col">
          <SheetHeader className="border-b border-border px-5 py-4 text-left">
            <SheetTitle>Edit master item</SheetTitle>
            <SheetDescription>Internal item fields apply to every supplier. Supplier entry fields apply only to {supplierLabel}.</SheetDescription>
          </SheetHeader>
          <div className="bani-visible-scrollbar flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {loading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : product ? <>
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Internal item</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {field("Internal SKU *", form.internal_sku, (v) => set("internal_sku", v), { className: "font-mono" })}
                  {field("Internal product name *", form.internal_product_name, (v) => set("internal_product_name", v))}
                </div>
                <CategoryCascadeSelect level1={form.level1_category} level2={form.level2_category} level3={form.level3_category} onChange={(next) => setForm((current) => ({ ...current, level1_category: next.level1, level2_category: next.level2, level3_category: next.level3 }))} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {field("Accounting category", form.accounting_category, (v) => set("accounting_category", v))}
                  <div className="space-y-1.5"><Label className="text-xs">Financial treatment</Label><Select value={form.financial_treatment || "__none__"} onValueChange={(v) => set("financial_treatment", v === "__none__" ? "" : v)}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select treatment" /></SelectTrigger><SelectContent><SelectItem value="__none__">—</SelectItem>{FINANCIAL_TREATMENTS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1.5"><Label className="text-xs">Default COA account</Label><Select value={form.default_coa_account_id || "__none__"} onValueChange={(v) => set("default_coa_account_id", v === "__none__" ? "" : v)}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select account" /></SelectTrigger><SelectContent><SelectItem value="__none__">—</SelectItem>{coaOptions.map((account) => <SelectItem key={account.id} value={account.id}>{account.code} – {account.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1.5"><Label className="text-xs">Status</Label><Select value={form.status || "Active"} onValueChange={(v) => set("status", v)}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>{["Active", "Draft", "Inactive"].map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div>{field("Stock UOM (internal) *", form.stock_uom, (v) => set("stock_uom", v))}<p className="mt-1 text-[10px] text-muted-foreground">Canonical internal unit; changing it updates the mirror on every supplier entry.</p></div>{field("Base / recipe UOM", form.base_unit_type, (v) => set("base_unit_type", v))}{field("Base / recipe quantity *", form.base_unit_qty, (v) => set("base_unit_qty", v), { type: "number", min: 0.0001, step: "0.01" })}</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{field("Min stock quantity", form.min_stock_qty, (v) => set("min_stock_qty", v), { type: "number", step: "0.01" })}{field("Reorder quantity", form.reorder_qty, (v) => set("reorder_qty", v), { type: "number", step: "0.01" })}</div>
                <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2"><div><Label className="text-xs">Creates stock movement</Label><p className="text-[10px] text-muted-foreground">Include purchases in inventory movement.</p></div><Switch checked={form.creates_stock_movement} onCheckedChange={(v) => set("creates_stock_movement", v)} /></div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{field("Purchase yield %", form.purchase_yield, (v) => set("purchase_yield", v), { type: "number", min: 1, max: 100, step: "0.1" })}{field("Cooking yield %", form.cooking_yield, (v) => set("cooking_yield", v), { type: "number", min: 1, max: 100, step: "0.1" })}</div>
                <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} /></div>
              </section>
              <section className="space-y-3 border-t border-border pt-5">
                <h3 className="text-sm font-semibold">This supplier’s entry</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{field("Supplier product / external name", form.supplier_product_name, (v) => set("supplier_product_name", v))}{field("External SKU", form.external_sku, (v) => set("external_sku", v), { className: "font-mono" })}{field("Purchase UOM *", form.purchase_unit, (v) => set("purchase_unit", v))}{field("Purchase cost (HK$) *", form.purchase_unit_cost, (v) => set("purchase_unit_cost", v), { type: "number", min: 0, step: "0.01", className: "font-mono" })}{field("Purchase → stock quantity *", form.stock_qty, (v) => set("stock_qty", v), { type: "number", min: 0.0001, step: "0.01", className: "font-mono" })}{field("Supplier accounting category", form.supplier_accounting_category, (v) => set("supplier_accounting_category", v))}<div className="space-y-1.5"><Label className="text-xs">Supplier status</Label><Select value={form.supplier_status || "Active"} onValueChange={(v) => set("supplier_status", v)}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>{["Active", "Draft", "Inactive"].map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div></div>
                <div className="rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">Cost per stock unit: <span className="font-mono text-foreground">HK$ {Number(form.purchase_unit_cost) / Math.max(Number(form.stock_qty), 0.0001) || 0}</span> · Cost per base unit: <span className="font-mono text-foreground">HK$ {Number(form.purchase_unit_cost) / Math.max(Number(form.base_unit_qty), 0.0001) || 0}</span></div>
                {!supplier && <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-xs text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />No supplier entry was found for {supplierLabel}; only the internal item can be saved.</div>}
              </section>
            </> : <p className="text-sm text-muted-foreground">Select a linked item to edit.</p>}
          </div>
          <SheetFooter className="sticky bottom-0 border-t border-border bg-background px-5 py-3"><Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button><Button onClick={save} disabled={saving || loading || !product}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save changes</Button></SheetFooter>
        </SheetContent>
      </Sheet>
      <AlertDialog open={confirmUom} onOpenChange={(value) => { if (!value) { setConfirmUom(false); setPendingForm(null); } }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Change internal Stock UOM?</AlertDialogTitle><AlertDialogDescription>Change internal Stock UOM from {product?.stock_uom || product?.unit} to {pendingForm?.stock_uom} for this product? This applies to every supplier. Review each existing purchase → stock conversion quantity after saving.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => { setConfirmUom(false); setPendingForm(null); }}>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => pendingForm && persist(pendingForm)}>Confirm change</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </>
  );
}
