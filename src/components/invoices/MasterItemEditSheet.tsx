import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
import SupplierDealDialog, { type SupplierDealEditable } from "@/components/procurement/SupplierDealDialog";
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

interface SupplierDealRow extends SupplierDealEditable {
  id: string;
}

const emptyForm: ProductMasterEditorForm = {
  internal_sku: "", internal_product_name: "", unit_cost: "0", level1_category: "", level2_category: "", level3_category: "",
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
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [deals, setDeals] = useState<SupplierDealRow[]>([]);
  const [dealDialogOpen, setDealDialogOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<SupplierDealEditable | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmUom, setConfirmUom] = useState(false);
  const [pendingForm, setPendingForm] = useState<ProductMasterEditorForm | null>(null);

  const set = (key: keyof ProductMasterEditorForm, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const supplierLabel = supplierName?.trim() || supplier?.supplier || "this supplier";
  const coaOptions = useMemo(() => coaAccounts.filter((account) => account.is_active), [coaAccounts]);
  const dealSuppliers = useMemo(() => supplierId ? [{ id: supplierId, name: supplierLabel }] : [], [supplierId, supplierLabel]);

  useEffect(() => {
    if (!open || !productId || !tenantId) return;
    let cancelled = false;
    setLoading(true);
    setSupplierId(null);
    setDeals([]);
    (async () => {
      const productResult = await supabase.from("product_master" as any).select("*").eq("id", productId).eq("tenant_id", tenantId).single();
      if (productResult.error || !productResult.data) {
        if (!cancelled) toast({ title: "Could not load item", description: productResult.error?.message || "Product was not found.", variant: "destructive" });
        setLoading(false);
        return;
      }

      const supplierResult = await supabase
        .from("product_suppliers" as any)
        .select("*")
        .eq("product_master_id", productId)
        .eq("tenant_id", tenantId);
      if (cancelled) return;

      const loadedProduct = productResult.data as unknown as ProductMasterItem;
      const supplierRows = (supplierResult.data || []) as unknown as ProductSupplierEntry[];
      const requestedEntry = supplierEntryId ? supplierRows.find((row) => row.id === supplierEntryId) : null;
      const requestedName = supplierName?.trim().toLocaleLowerCase();
      const loadedSupplier = requestedEntry || (requestedName
        ? supplierRows.find((row) => row.supplier?.trim().toLocaleLowerCase() === requestedName) || null
        : null);
      setProduct(loadedProduct);
      setSupplier(loadedSupplier);
      setForm(productMasterEditorForm(loadedProduct, loadedSupplier));

      if (loadedSupplier?.supplier) {
        const supplierLookup = await supabase
          .from("suppliers" as any)
          .select("id, name")
          .eq("tenant_id", tenantId)
          .eq("name", loadedSupplier.supplier)
          .limit(1);
        if (!cancelled) setSupplierId(((supplierLookup.data || [])[0] as { id?: string } | undefined)?.id || null);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, productId, supplierEntryId, supplierName, tenantId, toast]);

  useEffect(() => {
    if (!open || !productId || !tenantId || !supplierId) {
      setDeals([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("item_supplier_deals" as any)
        .select("id, supplier_id, buy_qty, free_qty, notes, is_active, valid_from, valid_until")
        .eq("tenant_id", tenantId)
        .eq("product_id", productId)
        .eq("supplier_id", supplierId)
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (!cancelled) setDeals(((data || []) as unknown) as SupplierDealRow[]);
    })();
    return () => { cancelled = true; };
  }, [open, productId, supplierId, tenantId, dealDialogOpen]);

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
        await supabase.from("product_master" as any).update(product as any).eq("id", product.id).eq("tenant_id", tenantId);
        setSaving(false);
        toast({ title: "Could not save supplier entry", description: `${supplierUpdate.error.message} No internal changes were kept.`, variant: "destructive" });
        return;
      }
      savedSupplier = { ...supplier, ...payload.supplier } as ProductSupplierEntry;
    }

    const oldUom = (product.stock_uom || product.unit || "").trim();
    if (oldUom.toLowerCase() !== nextForm.stock_uom.trim().toLowerCase()) {
      const sync = await supabase.from("product_suppliers" as any)
        .update({ stock_uom: nextForm.stock_uom.trim() })
        .eq("product_master_id", product.id)
        .eq("tenant_id", tenantId);
      if (sync.error) {
        await supabase.from("product_master" as any).update(product as any).eq("id", product.id).eq("tenant_id", tenantId);
        if (supplier) await supabase.from("product_suppliers" as any).update(supplier as any).eq("id", supplier.id).eq("tenant_id", tenantId);
        setSaving(false);
        toast({ title: "Could not sync Stock UOM", description: `${sync.error.message} No internal changes were kept.`, variant: "destructive" });
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

  const deactivateDeal = async (dealId: string) => {
    if (!tenantId) return;
    const { error } = await supabase.from("item_supplier_deals" as any).update({ is_active: false }).eq("id", dealId).eq("tenant_id", tenantId);
    if (error) {
      toast({ title: "Could not remove deal", description: error.message, variant: "destructive" });
      return;
    }
    setDeals((current) => current.filter((deal) => deal.id !== dealId));
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
                  {field("Internal cost", form.unit_cost, (v) => set("unit_cost", v), { type: "number", min: 0, step: "0.01", className: "font-mono" })}
                </div>
                <CategoryCascadeSelect level1={form.level1_category} level2={form.level2_category} level3={form.level3_category} onChange={(next) => setForm((current) => ({ ...current, level1_category: next.level1, level2_category: next.level2, level3_category: next.level3 }))} />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {field("Accounting category", form.accounting_category, (v) => set("accounting_category", v))}
                  <div className="space-y-1.5"><Label className="text-xs">Financial treatment</Label><Select value={form.financial_treatment || "__none__"} onValueChange={(v) => set("financial_treatment", v === "__none__" ? "" : v)}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select treatment" /></SelectTrigger><SelectContent><SelectItem value="__none__">—</SelectItem>{FINANCIAL_TREATMENTS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1.5"><Label className="text-xs">Default COA account</Label><Select value={form.default_coa_account_id || "__none__"} onValueChange={(v) => set("default_coa_account_id", v === "__none__" ? "" : v)}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select account" /></SelectTrigger><SelectContent><SelectItem value="__none__">—</SelectItem>{coaOptions.map((account) => <SelectItem key={account.id} value={account.id}>{account.code} – {account.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1.5"><Label className="text-xs">Status</Label><Select value={form.status || "Active"} onValueChange={(v) => set("status", v)}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>{["Active", "Draft", "Inactive"].map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div><Label className="text-xs">Stock UOM (internal) *</Label><UomSelect type="stock" value={form.stock_uom} onChange={(v) => set("stock_uom", v)} legacyValues={[product.stock_uom || product.unit || ""]} /><p className="mt-1 text-[10px] text-muted-foreground">Canonical internal unit; changing it updates the mirror on every supplier entry.</p></div><div><Label className="text-xs">Base / recipe UOM</Label><UomSelect type="base" value={form.base_unit_type} onChange={(v) => set("base_unit_type", v)} legacyValues={[product.base_unit_type || ""]} /></div>{field("Base / recipe quantity *", form.base_unit_qty, (v) => set("base_unit_qty", v), { type: "number", min: 0.0001, step: "0.01" })}</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{field("Min stock quantity", form.min_stock_qty, (v) => set("min_stock_qty", v), { type: "number", step: "0.01" })}{field("Reorder quantity", form.reorder_qty, (v) => set("reorder_qty", v), { type: "number", step: "0.01" })}</div>
                <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2"><div><Label className="text-xs">Creates stock movement</Label><p className="text-[10px] text-muted-foreground">Include purchases in inventory movement.</p></div><Switch checked={form.creates_stock_movement} onCheckedChange={(v) => set("creates_stock_movement", v)} /></div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{field("Purchase yield %", form.purchase_yield, (v) => set("purchase_yield", v), { type: "number", min: 1, max: 100, step: "0.1" })}{field("Cooking yield %", form.cooking_yield, (v) => set("cooking_yield", v), { type: "number", min: 1, max: 100, step: "0.1" })}</div>
                <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} /></div>
              </section>
              <section className="space-y-3 border-t border-border pt-5">
                <h3 className="text-sm font-semibold">This supplier’s entry</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{field("Supplier product / external name", form.supplier_product_name, (v) => set("supplier_product_name", v))}{field("External SKU", form.external_sku, (v) => set("external_sku", v), { className: "font-mono" })}<div><Label className="text-xs">Purchase UOM *</Label><UomSelect type="purchase" value={form.purchase_unit} onChange={(v) => set("purchase_unit", v)} legacyValues={[supplier?.purchase_unit || ""]} /></div>{field("Purchase cost (HK$) *", form.purchase_unit_cost, (v) => set("purchase_unit_cost", v), { type: "number", min: 0, step: "0.01", className: "font-mono" })}{field("Purchase → stock quantity *", form.stock_qty, (v) => set("stock_qty", v), { type: "number", min: 0.0001, step: "0.01", className: "font-mono" })}{field("Supplier accounting category", form.supplier_accounting_category, (v) => set("supplier_accounting_category", v))}<div className="space-y-1.5"><Label className="text-xs">Supplier status</Label><Select value={form.supplier_status || "Active"} onValueChange={(v) => set("supplier_status", v)}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>{["Active", "Draft", "Inactive"].map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div></div>
                <div className="rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">Cost per stock unit: <span className="font-mono text-foreground">HK$ {Number(form.purchase_unit_cost) / Math.max(Number(form.stock_qty), 0.0001) || 0}</span> · Cost per base unit: <span className="font-mono text-foreground">HK$ {Number(form.purchase_unit_cost) / Math.max(Number(form.base_unit_qty), 0.0001) || 0}</span></div>
                {!supplier && <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-xs text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />No supplier entry was found for {supplierLabel}; only the internal item can be saved.</div>}
                {supplier && supplierId && <div className="space-y-2 border-t border-border/60 pt-3"><div className="flex items-center justify-between"><div><h4 className="text-xs font-semibold">Supplier deals</h4><p className="text-[10px] text-muted-foreground">Deals are limited to {supplierLabel}.</p></div><Button type="button" size="sm" variant="outline" onClick={() => { setEditingDeal(null); setDealDialogOpen(true); }}><Plus className="mr-1 h-3.5 w-3.5" />Add deal</Button></div>{deals.length === 0 ? <p className="text-[11px] text-muted-foreground">No deals configured.</p> : <div className="space-y-1.5">{deals.map((deal) => <div key={deal.id} className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-xs"><div className="min-w-0 flex-1"><span className="font-medium">Buy {deal.buy_qty}</span> get <span className="font-medium">{deal.free_qty} free</span>{(deal.valid_from || deal.valid_until) && <span className="ml-2 text-muted-foreground">{deal.valid_from || "—"} → {deal.valid_until || "—"}</span>}</div><Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Edit deal" onClick={() => { setEditingDeal(deal); setDealDialogOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Remove deal" onClick={() => deactivateDeal(deal.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</div>}</div>}
              </section>
            </> : <p className="text-sm text-muted-foreground">Select a linked item to edit.</p>}
          </div>
          <SheetFooter className="sticky bottom-0 border-t border-border bg-background px-5 py-3"><Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button><Button onClick={save} disabled={saving || loading || !product}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save changes</Button></SheetFooter>
        </SheetContent>
      </Sheet>
      {productId && supplierId && <SupplierDealDialog open={dealDialogOpen} onOpenChange={setDealDialogOpen} productId={productId} purchaseUnitCost={Number(form.purchase_unit_cost) || 0} purchaseUnit={form.purchase_unit} stockUom={form.stock_uom} suppliers={dealSuppliers} lockedSupplierId={supplierId} existingDeals={deals.map((deal) => ({ id: deal.id, supplier_id: deal.supplier_id }))} initial={editingDeal} onSaved={() => setDealDialogOpen(false)} />}
      <AlertDialog open={confirmUom} onOpenChange={(value) => { if (!value) { setConfirmUom(false); setPendingForm(null); } }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Change internal Stock UOM?</AlertDialogTitle><AlertDialogDescription>Change internal Stock UOM from {product?.stock_uom || product?.unit} to {pendingForm?.stock_uom} for this product? This applies to every supplier. Review each existing purchase → stock conversion quantity after saving.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => { setConfirmUom(false); setPendingForm(null); }}>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => pendingForm && persist(pendingForm)}>Confirm change</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </>
  );
}
