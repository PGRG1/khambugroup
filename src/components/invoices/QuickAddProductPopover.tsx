import React, { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Loader2, Plus, Search, Sparkles } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { buildProductMasterStockUomUpdate, buildSupplierStockUomSync, buildSupplierUomPayload, requiresStockUomConfirmation, resolveCanonicalStockUom } from "@/utils/quickAddStockUom";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";
import { useIsMobile } from "@/hooks/use-mobile";
import CategoryCascadeSelect from "@/components/procurement/CategoryCascadeSelect";
import UomSelect from "@/components/procurement/UomSelect";
import { FINANCIAL_TREATMENTS } from "@/hooks/useProductMaster";
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

interface SupplierRecord {
  id: string;
  name: string;
  code?: string | null;
  vendor_type?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  payment_terms?: string | null;
  account_number?: string | null;
  notes?: string | null;
  is_active: boolean;
}

interface Props {
  products: QuickAddEntry[];
  supplierName?: string;
  line: { item_code?: string; description?: string; unit?: string; unit_price?: string };
  onCreated: (entry: QuickAddEntry) => void;
  onRefresh?: () => void | Promise<void>;
  buttonLabel?: string;
  /** Preselect the "add supplier to existing product" path (cross-supplier discovery). */
  initialMode?: "existing" | "new";
  /** Product Master id (internal product) to preselect in the existing-product path. */
  initialProductId?: string;
  /** Optional trigger override; falls back to the default Quick add button. */
  triggerLabel?: string;
}

const productSchema = z.object({
  internalSku: z.string().trim().min(1, "Internal SKU is required").max(80),
  internalName: z.string().trim().min(1, "Internal product name is required").max(200),
  supplier: z.string().trim().min(1, "Select or create a supplier"),
  purchaseCost: z.number().finite().min(0, "Purchase cost cannot be negative"),
  stockQty: z.number().finite().positive("Stock quantity must be greater than zero"),
  baseQty: z.number().finite().positive("Recipe/base quantity must be greater than zero"),
  purchaseYield: z.number().finite().min(1, "Purchase yield must be between 1% and 100%").max(100),
  cookingYield: z.number().finite().min(1, "Cooking yield must be between 1% and 100%").max(100),
});

const supplierSchema = z.object({
  name: z.string().trim().min(1, "Supplier name is required").max(160),
  code: z.string().trim().max(40),
  contact_person: z.string().trim().max(120),
  phone: z.string().trim().max(50),
  email: z.string().trim().max(255).email("Enter a valid email address").or(z.literal("")),
  address: z.string().trim().max(300),
  payment_terms: z.string().trim().max(60),
  account_number: z.string().trim().max(100),
  notes: z.string().trim().max(1000),
});

const PAYMENT_TERMS = ["COD", "Net 7", "Net 14", "Net 30", "Net 60", "Due on presentation"];
const NONE = "__none__";

const nextQuickSku = (products: QuickAddEntry[]) => {
  let max = 0;
  for (const p of products) {
    const match = /^QA-(\d+)$/i.exec((p.internal_sku || "").trim());
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  return `QA-${String(max + 1).padStart(4, "0")}`;
};

const emptySupplier = {
  name: "", code: "", contact_person: "", phone: "", email: "", address: "",
  payment_terms: "COD", account_number: "", notes: "",
};

export default function QuickAddProductPopover({
  products,
  supplierName,
  line,
  onCreated,
  onRefresh,
  buttonLabel = "Quick add",
  initialMode,
  initialProductId,
  triggerLabel,
}: Props) {
  const { tenantId } = useActiveTenant();
  const { items: coaAccounts } = useChartOfAccounts();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [pickedId, setPickedId] = useState("");
  const [pickerQuery, setPickerQuery] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [supplierForm, setSupplierForm] = useState(emptySupplier);
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [supplierCodeEdited, setSupplierCodeEdited] = useState(false);
  const [internalSku, setInternalSku] = useState("");
  const [internalName, setInternalName] = useState("");
  const [externalSku, setExternalSku] = useState("");
  const [externalName, setExternalName] = useState("");
  const [purchaseUnit, setPurchaseUnit] = useState("");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [stockUom, setStockUom] = useState("");
  const [stockQty, setStockQty] = useState("1");
  const [baseUnit, setBaseUnit] = useState("g");
  const [baseQty, setBaseQty] = useState("1");
  /** Stock UOM already recorded on the selected internal product (existing-product path). */
  const [pickedStockUom, setPickedStockUom] = useState("");
  const [level1, setLevel1] = useState("");
  const [level2, setLevel2] = useState("");
  const [level3, setLevel3] = useState("");
  const [accountingCategory, setAccountingCategory] = useState("purchases");
  const [financialTreatment, setFinancialTreatment] = useState("");
  const [coaId, setCoaId] = useState("");
  const [createsStock, setCreatesStock] = useState(true);
  const [purchaseYield, setPurchaseYield] = useState("100");
  const [cookingYield, setCookingYield] = useState("100");
  const [minStockQty, setMinStockQty] = useState("");
  const [reorderQty, setReorderQty] = useState("");
  const [status, setStatus] = useState("Active");
  const [notes, setNotes] = useState("");
  const [errorText, setErrorText] = useState("");

  const uniqueProducts = useMemo(() => {
    const seen = new Map<string, QuickAddEntry>();
    products.forEach((product) => { if (!seen.has(product.id)) seen.set(product.id, product); });
    return Array.from(seen.values());
  }, [products]);

  const bestCandidate = useMemo(() => {
    const candidates = scoreCandidates(
      { itemCode: line.item_code, description: line.description }, products as any, supplierName, 1,
    );
    const top = candidates[0];
    return top && top.rawNameScore >= FUZZY.SUGGEST && top.blockingReasons.length === 0
      ? top.entry as QuickAddEntry : undefined;
  }, [products, line.item_code, line.description, supplierName]);

  const picked = uniqueProducts.find((product) => product.id === pickedId);
  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);
  const selectedSupplierName = selectedSupplier?.name || supplierForm.name || supplierName || "";
  const filteredPicker = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return uniqueProducts.filter((product) => !q || `${product.internal_sku} ${product.internal_product_name}`.toLowerCase().includes(q)).slice(0, 50);
  }, [uniqueProducts, pickerQuery]);
  const skuConflict = mode === "new" && internalSku.trim()
    ? uniqueProducts.find((product) => product.internal_sku.trim().toLowerCase() === internalSku.trim().toLowerCase())
    : undefined;
  const duplicateEntry = mode === "existing" && picked
    ? products.find((product) => product.id === picked.id &&
      (product.supplier || "").trim().toLowerCase() === selectedSupplierName.trim().toLowerCase() &&
      (product.external_sku || "").trim().toLowerCase() === externalSku.trim().toLowerCase())
    : undefined;
  const costPerStock = (parseFloat(stockQty) || 0) > 0 ? (parseFloat(purchaseCost) || 0) / (parseFloat(stockQty) || 1) : 0;
  const costPerBase = (parseFloat(baseQty) || 0) > 0 ? (parseFloat(purchaseCost) || 0) / (parseFloat(baseQty) || 1) : 0;

  const resetForm = () => {
    const candidate = bestCandidate;
    setMode(candidate ? "existing" : "new");
    setPickedId(candidate?.id || "");
    setPickerQuery("");
    setSupplierId("");
    setSupplierForm(emptySupplier);
    setCreatingSupplier(false);
    setSupplierCodeEdited(false);
    setInternalSku(nextQuickSku(products));
    setInternalName(line.description || "");
    setExternalSku(line.item_code || "");
    setExternalName(line.description || "");
    setPurchaseUnit(line.unit || "");
    setPurchaseCost(line.unit_price || "");
    setStockUom("");
    setStockQty("1");
    setBaseUnit("g");
    setBaseQty("1");
    setPickedStockUom("");
    setLevel1(""); setLevel2(""); setLevel3("");
    setAccountingCategory("purchases"); setFinancialTreatment("");
    setCoaId(""); setCreatesStock(true);
    setPurchaseYield("100"); setCookingYield("100");
    setMinStockQty(""); setReorderQty(""); setStatus("Active"); setNotes(""); setErrorText("");
  };

  /**
   * Stock UOM is the canonical internal inventory UOM and belongs to the product, not the
   * supplier. When adding a supplier to an existing product we prefill it, but it stays
   * editable (changing it is confirmed and then synchronised across all supplier rows).
   */
  React.useEffect(() => {
    if (!open || mode !== "existing" || !pickedId || !tenantId) { setPickedStockUom(""); return; }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("product_master" as any)
        .select("stock_uom, unit")
        .eq("id", pickedId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (cancelled) return;
      const existing = resolveCanonicalStockUom(data as any);
      setPickedStockUom(existing);
      if (existing) setStockUom(existing);
    })();
    return () => { cancelled = true; };
  }, [open, mode, pickedId, tenantId]);


  const loadSuppliers = async () => {
    if (!tenantId) return;
    const { data, error } = await supabase.from("suppliers").select("*").eq("tenant_id", tenantId).eq("is_active", true).order("name");
    if (error) { toast.error(error.message); return; }
    const rows = (data || []) as SupplierRecord[];
    setSuppliers(rows);
    const current = rows.find((supplier) => supplier.name.trim().toLowerCase() === (supplierName || "").trim().toLowerCase());
    if (current) setSupplierId(current.id);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      resetForm();
      if (initialMode) setMode(initialMode);
      if (initialProductId) setPickedId(initialProductId);
      void loadSuppliers();
    }
  };

  const updateSupplierForm = (key: keyof typeof emptySupplier, value: string) => {
    setSupplierForm((previous) => ({ ...previous, [key]: value }));
  };

  const createSupplier = async () => {
    const parsed = supplierSchema.safeParse(supplierForm);
    if (!parsed.success) { setErrorText(parsed.error.issues[0]?.message || "Check supplier details."); return null; }
    if (!tenantId) return null;
    const duplicate = suppliers.find((supplier) => supplier.name.trim().toLowerCase() === supplierForm.name.trim().toLowerCase());
    if (duplicate) { setSupplierId(duplicate.id); setCreatingSupplier(false); setErrorText(""); toast.success("Existing supplier selected."); return duplicate; }
    const payload = {
      ...supplierForm, name: supplierForm.name.trim(), code: supplierForm.code.trim() || null,
      vendor_type: "procurement", contact_person: supplierForm.contact_person.trim() || null,
      phone: supplierForm.phone.trim() || null, email: supplierForm.email.trim() || null,
      address: supplierForm.address.trim() || null, payment_terms: supplierForm.payment_terms || null,
      account_number: supplierForm.account_number.trim(), notes: supplierForm.notes.trim() || null,
      is_active: true, tenant_id: tenantId, invoice_rounding_mode: "sum_then_round", categories: [], delivery_days: [], moq: 0,
    };
    setSaving(true);
    const { data, error } = await supabase.from("suppliers").insert(payload as any).select("*").single();
    setSaving(false);
    if (error) { setErrorText(error.message); return null; }
    const created = data as SupplierRecord;
    setSuppliers((previous) => [...previous, created].sort((a, b) => a.name.localeCompare(b.name)));
    setSupplierId(created.id); setCreatingSupplier(false); setErrorText("");
    toast.success(`${created.name} added.`);
    return created;
  };

  const validate = () => {
    const parsed = productSchema.safeParse({
      internalSku, internalName, supplier: selectedSupplierName,
      purchaseCost: parseFloat(purchaseCost) || 0, stockQty: parseFloat(stockQty) || 0,
      baseQty: parseFloat(baseQty) || 0, purchaseYield: parseFloat(purchaseYield), cookingYield: parseFloat(cookingYield),
    });
    if (!parsed.success) { setErrorText(parsed.error.issues[0]?.message || "Check the product details."); return false; }
    if (mode === "existing" && !picked) { setErrorText("Select the existing internal product first."); return false; }
    if (mode === "new" && skuConflict) { setErrorText(`Internal SKU is already used by ${skuConflict.internal_product_name}. Use the existing product path instead.`); return false; }
    if (!purchaseUnit.trim() || !stockUom.trim()) { setErrorText("Purchase UOM and stock UOM are required."); return false; }
    return true;
  };

  const save = async (confirmedUomChange = false) => {
    if (!tenantId || saving || !validate()) return;
    if (mode === "existing" && !confirmedUomChange && requiresStockUomConfirmation(pickedStockUom, stockUom)) {
      setConfirmUomOpen(true);
      return;
    }
    setSaving(true); setErrorText("");
    try {
      const supplier = selectedSupplierName.trim();
      const supplierPayload = {
        supplier, external_sku: externalSku.trim(), supplier_product_name: externalName.trim(),
        purchase_unit_cost: parseFloat(purchaseCost) || 0,
        ...buildSupplierUomPayload({ purchaseUnit, stockUom, stockQty }),
        base_unit_type: baseUnit.trim() || "g", base_unit_qty: parseFloat(baseQty) || 1,
        accounting_category: accountingCategory.trim(), status,
      };
      let productId = picked?.id || "";
      let internalSkuValue = internalSku.trim();
      let internalNameValue = internalName.trim();
      if (mode === "new") {
        const purchase = parseFloat(purchaseCost) || 0;
        const qty = parseFloat(stockQty) || 1;
        const recipeQty = parseFloat(baseQty) || 1;
        const { data, error } = await supabase.from("product_master" as any).insert({
          tenant_id: tenantId, internal_sku: internalSkuValue, external_sku: externalSku.trim(),
          internal_product_name: internalNameValue, supplier_product_name: externalName.trim(),
          level1_category: level1 || "Other", level2_category: level2, level3_category: level3,
          accounting_category: accountingCategory.trim(), financial_treatment: financialTreatment,
          default_coa_account_id: coaId || null, unit: stockUom.trim(),
          unit_cost: purchase, status, notes: notes.trim() || null,
          purchase_unit: purchaseUnit.trim(), purchase_unit_cost: purchase,
          stock_uom: stockUom.trim(), stock_qty: qty, cost_per_stock_unit: costPerStock,
          base_unit_type: baseUnit.trim() || "g", base_unit_qty: recipeQty, cost_per_base_unit: costPerBase,
          min_stock_qty: minStockQty.trim() ? parseFloat(minStockQty) : null,
          reorder_qty: reorderQty.trim() ? parseFloat(reorderQty) : null,
          creates_stock_movement: createsStock, purchase_yield: parseFloat(purchaseYield), cooking_yield: parseFloat(cookingYield),
        } as any).select("id").single();
        if (error) throw error;
        productId = (data as any).id;
      } else if (!picked) {
        throw new Error("Select an existing product first.");
      } else if (!pickedStockUom || requiresStockUomConfirmation(pickedStockUom, stockUom)) {
        // Canonical internal Stock UOM is set for the first time, or changed after confirmation.
        const { error } = await supabase
          .from("product_master" as any)
          .update(buildProductMasterStockUomUpdate(stockUom) as any)
          .eq("id", productId)
          .eq("tenant_id", tenantId);
        if (error) throw error;
        if (pickedStockUom) {
          // Keep every supplier row on the canonical UOM; purchase_unit / stock_qty untouched.
          const { error: syncError } = await supabase
            .from("product_suppliers" as any)
            .update(buildSupplierStockUomSync(stockUom) as any)
            .eq("product_master_id", productId)
            .eq("tenant_id", tenantId);
          if (syncError) throw syncError;
        }
        setPickedStockUom(stockUom.trim());
      }


      let entry: any = duplicateEntry;
      if (entry) {
        const { data, error } = await supabase.from("product_suppliers" as any).update(supplierPayload as any).eq("id", entry.supplier_entry_id).eq("tenant_id", tenantId).select("*").single();
        if (error) throw error;
        entry = data;
      } else {
        const { data, error } = await supabase.from("product_suppliers" as any).insert({ ...supplierPayload, product_master_id: productId, tenant_id: tenantId } as any).select("*").single();
        if (error) throw error;
        entry = data;
      }
      const result: QuickAddEntry = {
        id: productId, supplier_entry_id: entry.id, internal_sku: mode === "new" ? internalSkuValue : picked?.internal_sku || "",
        external_sku: entry.external_sku || "", internal_product_name: mode === "new" ? internalNameValue : picked?.internal_product_name || "",
        supplier_product_name: entry.supplier_product_name || "", purchase_unit_cost: entry.purchase_unit_cost ?? 0,
        supplier: entry.supplier || supplier, purchase_unit: entry.purchase_unit || "", stock_uom: entry.stock_uom || "", stock_qty: entry.stock_qty ?? 1,
      };
      onCreated(result);
      await onRefresh?.();
      toast.success(mode === "new" ? `${internalNameValue} created and linked.` : `Supplier entry linked to ${result.internal_product_name}.`);
      setOpen(false);
    } catch (error: any) {
      setErrorText(error?.message || "Could not save product setup.");
    } finally { setSaving(false); }
  };

  const field = (label: string, value: string, onChange: (value: string) => void, options: React.ComponentProps<typeof Input> = {}) => (
    <div className="space-y-1.5"><Label className="text-xs">{label}</Label><Input {...options} value={value} onChange={(event) => onChange(event.target.value)} className={cn("h-9 text-sm", options.className)} /></div>
  );

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button size="sm" variant="ghost" className="h-6 gap-1 px-2 text-[11px]"><Plus className="h-3 w-3" />{triggerLabel ?? buttonLabel}</Button>
      </SheetTrigger>
      <SheetContent side={isMobile ? "bottom" : "right"} className={cn("flex flex-col gap-0 p-0", isMobile ? "h-[94vh] w-full rounded-t-2xl" : "w-full sm:max-w-[720px]")}>
        <SheetHeader className="shrink-0 border-b px-5 py-4 pr-12 text-left">
          <SheetTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-4 w-4 text-primary" />Complete product setup</SheetTitle>
          <SheetDescription>Finish the master data setup and link this scanned invoice line without leaving the scanner.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-4 rounded-md border border-border/60 bg-muted/20 p-3 text-xs">
            <div className="font-medium">Scanned line</div><div className="mt-1 text-muted-foreground">{line.description || "Unnamed item"}</div>
            <div className="mt-1 font-mono text-[11px] text-muted-foreground">{line.item_code || "No external SKU"} · {line.unit || "No UOM"} · HK$ {line.unit_price || "0.00"}</div>
          </div>
          <div className="mb-4 grid grid-cols-1 gap-1 rounded-md border border-border/60 bg-muted/20 p-1 sm:grid-cols-2">
            <Button type="button" variant={mode === "existing" ? "secondary" : "ghost"} className="h-9 justify-start text-xs" onClick={() => setMode("existing")}><Check className={cn("mr-2 h-3.5 w-3.5", mode === "existing" ? "opacity-100" : "opacity-0")} />Add supplier to existing product</Button>
            <Button type="button" variant={mode === "new" ? "secondary" : "ghost"} className="h-9 justify-start text-xs" onClick={() => setMode("new")}><Check className={cn("mr-2 h-3.5 w-3.5", mode === "new" ? "opacity-100" : "opacity-0")} />Create brand-new product</Button>
          </div>

          {mode === "existing" ? (
            <Accordion type="multiple" defaultValue={["product", "supplier"]} className="space-y-2">
              <AccordionItem value="product" className="rounded-lg border px-3"><AccordionTrigger className="py-3 text-sm font-medium">Internal product</AccordionTrigger><AccordionContent className="space-y-3 pb-3">
                {picked && <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2"><div className="font-medium text-sm">{picked.internal_product_name}</div><div className="font-mono text-[11px] text-muted-foreground">{picked.internal_sku}</div></div>}
                <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 pl-8 text-sm" placeholder="Search internal products…" value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} /></div>
                <div className="max-h-44 overflow-y-auto rounded-md border border-border/60">{filteredPicker.map((product) => <Button key={product.id} type="button" variant="ghost" className={cn("h-auto w-full justify-start rounded-none px-3 py-2 text-left", product.id === pickedId && "bg-muted")} onClick={() => setPickedId(product.id)}><span><span className="block text-sm">{product.internal_product_name}</span><span className="font-mono text-[11px] text-muted-foreground">{product.internal_sku}</span></span></Button>)}{filteredPicker.length === 0 && <div className="px-3 py-5 text-center text-xs text-muted-foreground">No products found.</div>}</div>
              </AccordionContent></AccordionItem>
              <AccordionItem value="supplier" className="rounded-lg border px-3"><AccordionTrigger className="py-3 text-sm font-medium">Supplier entry</AccordionTrigger><AccordionContent className="space-y-3 pb-3">{field("Supplier product name", externalName, setExternalName, { placeholder: "Supplier's name for this item" })}{field("External SKU", externalSku, setExternalSku, { className: "font-mono" })}<SupplierFields {...{ suppliers, supplierId, setSupplierId, selectedSupplierName, creatingSupplier, setCreatingSupplier, supplierForm, updateSupplierForm, supplierCodeEdited, setSupplierCodeEdited, createSupplier, saving }} /> <SupplierEntryFields {...{ purchaseUnit, setPurchaseUnit, purchaseCost, setPurchaseCost, stockUom, setStockUom, stockQty, setStockQty, baseUnit, setBaseUnit, baseQty, setBaseQty, costPerStock, costPerBase }} /></AccordionContent></AccordionItem>
            </Accordion>
          ) : (
            <Accordion type="multiple" defaultValue={["identity", "classification", "financial", "supplier", "stock", "notes"]} className="space-y-2">
              <AccordionItem value="identity" className="rounded-lg border px-3"><AccordionTrigger className="py-3 text-sm font-medium">Identity</AccordionTrigger><AccordionContent className="grid grid-cols-1 gap-3 pb-3 sm:grid-cols-2">{field("Internal SKU *", internalSku, setInternalSku, { className: cn("font-mono", skuConflict && "border-destructive") })}<div className="sm:col-span-2">{field("Internal product name *", internalName, setInternalName)} </div>{field("Supplier product name", externalName, setExternalName)}{field("External SKU", externalSku, setExternalSku, { className: "font-mono" })}{skuConflict && <Alert className="sm:col-span-2 border-destructive/40 bg-destructive/10 py-2"><AlertTriangle className="h-4 w-4" /><AlertDescription className="text-xs">SKU already belongs to {skuConflict.internal_product_name}. Switch to the existing-product path.</AlertDescription></Alert>}</AccordionContent></AccordionItem>
              <AccordionItem value="classification" className="rounded-lg border px-3"><AccordionTrigger className="py-3 text-sm font-medium">Classification</AccordionTrigger><AccordionContent className="space-y-3 pb-3"><Label className="text-xs">Categories (L1 → L2 → L3)</Label><CategoryCascadeSelect level1={level1} level2={level2} level3={level3} onChange={(next) => { setLevel1(next.level1); setLevel2(next.level2); setLevel3(next.level3); }} /></AccordionContent></AccordionItem>
              <AccordionItem value="financial" className="rounded-lg border px-3"><AccordionTrigger className="py-3 text-sm font-medium">Financial mapping</AccordionTrigger><AccordionContent className="space-y-3 pb-3"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label className="text-xs">Financial treatment</Label><Select value={financialTreatment || NONE} onValueChange={(value) => { const treatment = value === NONE ? "" : value; setFinancialTreatment(treatment); setCreatesStock(treatment === "COGS"); setCoaId(""); }}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select treatment" /></SelectTrigger><SelectContent><SelectItem value={NONE}>— None —</SelectItem>{FINANCIAL_TREATMENTS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label className="text-xs">Default COA account</Label><Select value={coaId || NONE} onValueChange={(value) => setCoaId(value === NONE ? "" : value)}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Inherit from mapping" /></SelectTrigger><SelectContent><SelectItem value={NONE}>— Inherit from mapping —</SelectItem>{coaAccounts.filter((account) => account.is_active).filter((account) => !financialTreatment || (financialTreatment === "COGS" ? account.account_type === "cogs" : financialTreatment === "OpEx" ? account.account_type === "opex" : financialTreatment.startsWith("Asset") ? account.account_type === "asset" : true)).map((account) => <SelectItem key={account.id} value={account.id}><span className="font-mono text-xs">{account.code}</span> {account.name}</SelectItem>)}</SelectContent></Select></div></div><div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"><div><Label className="text-xs">Creates stock movement</Label><p className="mt-0.5 text-[10px] text-muted-foreground">Receiving this item updates inventory when enabled.</p></div><Switch checked={createsStock} onCheckedChange={setCreatesStock} /></div></AccordionContent></AccordionItem>
              <AccordionItem value="supplier" className="rounded-lg border px-3"><AccordionTrigger className="py-3 text-sm font-medium">Supplier configuration</AccordionTrigger><AccordionContent className="space-y-3 pb-3"><SupplierFields {...{ suppliers, supplierId, setSupplierId, selectedSupplierName, creatingSupplier, setCreatingSupplier, supplierForm, updateSupplierForm, supplierCodeEdited, setSupplierCodeEdited, createSupplier, saving }} /> <SupplierEntryFields {...{ purchaseUnit, setPurchaseUnit, purchaseCost, setPurchaseCost, stockUom, setStockUom, stockQty, setStockQty, baseUnit, setBaseUnit, baseQty, setBaseQty, costPerStock, costPerBase }} /><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{field("Purchase yield (%)", purchaseYield, setPurchaseYield, { type: "number", min: 1, max: 100, step: "0.01" })}{field("Cooking yield (%)", cookingYield, setCookingYield, { type: "number", min: 1, max: 100, step: "0.01" })}</div></AccordionContent></AccordionItem>
              <AccordionItem value="stock" className="rounded-lg border px-3"><AccordionTrigger className="py-3 text-sm font-medium">Stock controls</AccordionTrigger><AccordionContent className="grid grid-cols-1 gap-3 pb-3 sm:grid-cols-2">{field("Minimum stock quantity", minStockQty, setMinStockQty, { type: "number", min: 0, step: "0.01" })}{field("Reorder quantity", reorderQty, setReorderQty, { type: "number", min: 0, step: "0.01" })}</AccordionContent></AccordionItem>
              <AccordionItem value="notes" className="rounded-lg border px-3"><AccordionTrigger className="py-3 text-sm font-medium">Notes & status</AccordionTrigger><AccordionContent className="space-y-3 pb-3"><div className="space-y-1.5"><Label className="text-xs">Notes</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes…" className="min-h-20 text-sm" /></div><div className="space-y-1.5"><Label className="text-xs">Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Active">Active</SelectItem><SelectItem value="Draft">Draft</SelectItem><SelectItem value="Inactive">Inactive</SelectItem></SelectContent></Select></div></AccordionContent></AccordionItem>
            </Accordion>
          )}
          {duplicateEntry && <Alert className="mt-3 border-primary/30 bg-primary/5 py-2"><Check className="h-4 w-4" /><AlertDescription className="text-xs">This supplier entry already exists. Saving will update its configuration and link it to the scanned line.</AlertDescription></Alert>}
          {errorText && <Alert className="mt-3 border-destructive/40 bg-destructive/10 py-2"><AlertTriangle className="h-4 w-4" /><AlertDescription className="text-xs">{errorText}</AlertDescription></Alert>}
        </div>
        <SheetFooter className="shrink-0 border-t bg-background px-5 py-3"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="button" onClick={save} disabled={saving || !tenantId}>{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</> : "Save & link line"}</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

interface SupplierFieldsProps {
  suppliers: SupplierRecord[]; supplierId: string; setSupplierId: (id: string) => void; selectedSupplierName: string;
  creatingSupplier: boolean; setCreatingSupplier: (value: boolean) => void; supplierForm: typeof emptySupplier;
  updateSupplierForm: (key: keyof typeof emptySupplier, value: string) => void; supplierCodeEdited: boolean; setSupplierCodeEdited: (value: boolean) => void;
  createSupplier: () => Promise<SupplierRecord | null>; saving: boolean;
}

function SupplierFields({ suppliers, supplierId, setSupplierId, selectedSupplierName, creatingSupplier, setCreatingSupplier, supplierForm, updateSupplierForm, supplierCodeEdited, setSupplierCodeEdited, createSupplier, saving }: SupplierFieldsProps) {
  const suggestedCode = supplierForm.name.trim().split(/\s+/).filter(Boolean).map((word) => word[0]).join("").toUpperCase().slice(0, 8);
  return <div className="space-y-3 rounded-md border border-border/60 bg-muted/10 p-3">
    <div className="flex items-center justify-between gap-2"><Label className="text-xs">Supplier *</Label><Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setCreatingSupplier(!creatingSupplier)}>{creatingSupplier ? "Choose existing" : "Create new supplier"}</Button></div>
    {!creatingSupplier ? <Select value={supplierId || NONE} onValueChange={(value) => setSupplierId(value === NONE ? "" : value)}><SelectTrigger className="h-9 text-sm"><SelectValue placeholder={selectedSupplierName || "Select supplier"} /></SelectTrigger><SelectContent><SelectItem value={NONE}>— Select supplier —</SelectItem>{suppliers.filter((supplier) => supplier.name.trim()).map((supplier) => <SelectItem key={supplier.id} value={supplier.id}>{supplier.name}{supplier.code ? ` · ${supplier.code}` : ""}</SelectItem>)}</SelectContent></Select> : <div className="space-y-3">{supplierInput("Name *", supplierForm.name, (value) => updateSupplierForm("name", value))}<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{supplierInput("Code", supplierForm.code || (!supplierCodeEdited ? suggestedCode : ""), (value) => { setSupplierCodeEdited(true); updateSupplierForm("code", value.toUpperCase()); }, { className: "font-mono" })}{supplierInput("Contact person", supplierForm.contact_person, (value) => updateSupplierForm("contact_person", value))}{supplierInput("Phone", supplierForm.phone, (value) => updateSupplierForm("phone", value))}{supplierInput("Email", supplierForm.email, (value) => updateSupplierForm("email", value), { type: "email" })}</div>{supplierInput("Address", supplierForm.address, (value) => updateSupplierForm("address", value))}<div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label className="text-xs">Payment terms</Label><Select value={supplierForm.payment_terms || "COD"} onValueChange={(value) => updateSupplierForm("payment_terms", value)}><SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_TERMS.map((term) => <SelectItem key={term} value={term}>{term}</SelectItem>)}</SelectContent></Select></div>{supplierInput("Account number", supplierForm.account_number, (value) => updateSupplierForm("account_number", value), { className: "font-mono" })}</div>{supplierInput("Notes", supplierForm.notes, (value) => updateSupplierForm("notes", value))}<Button type="button" size="sm" onClick={() => void createSupplier()} disabled={saving || !supplierForm.name.trim()}><Plus className="mr-1.5 h-3.5 w-3.5" />Save supplier & continue</Button></div>}
  </div>;
}

function supplierInput(label: string, value: string, onChange: (value: string) => void, options: React.ComponentProps<typeof Input> = {}) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label><Input {...options} value={value} onChange={(event) => onChange(event.target.value)} className={cn("h-9 text-sm", options.className)} /></div>;
}

interface SupplierEntryFieldsProps {
  purchaseUnit: string; setPurchaseUnit: (value: string) => void; purchaseCost: string; setPurchaseCost: (value: string) => void;
  stockUom: string; setStockUom: (value: string) => void; stockQty: string; setStockQty: (value: string) => void;
  baseUnit: string; setBaseUnit: (value: string) => void; baseQty: string; setBaseQty: (value: string) => void;
  costPerStock: number; costPerBase: number;
}

function SupplierEntryFields({ purchaseUnit, setPurchaseUnit, purchaseCost, setPurchaseCost, stockUom, setStockUom, stockQty, setStockQty, baseUnit, setBaseUnit, baseQty, setBaseQty, costPerStock, costPerBase }: SupplierEntryFieldsProps) {
  return <div className="space-y-3"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label className="text-xs">Purchase UOM *</Label><UomSelect type="purchase" value={purchaseUnit} onChange={setPurchaseUnit} placeholder="Select purchase UOM" /></div>{supplierInput("Purchase cost (HK$) *", purchaseCost, setPurchaseCost, { type: "number", min: 0, step: "0.01", className: "font-mono" })}<div className="space-y-1.5"><Label className="text-xs">Stock UOM (internal) *</Label><UomSelect type="stock" value={stockUom} onChange={setStockUom} placeholder="Select stock UOM" className="h-9 text-sm" /><p className="text-[10px] text-muted-foreground">Independent of Purchase UOM. Example: buy by Case, stock by Bottle.</p></div>{supplierInput("Purchase → stock quantity *", stockQty, setStockQty, { type: "number", min: 0.0001, step: "0.01", className: "font-mono" })}</div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label className="text-xs">Recipe / base UOM</Label><UomSelect type="base" value={baseUnit} onChange={setBaseUnit} placeholder="Select base UOM" /></div>{supplierInput("Recipe / base quantity", baseQty, setBaseQty, { type: "number", min: 0.0001, step: "0.01", className: "font-mono" })}</div><div className="grid grid-cols-1 gap-2 rounded-md bg-muted/30 p-2 text-xs sm:grid-cols-2"><div><span className="text-muted-foreground">Cost per stock unit</span><div className="font-mono font-medium">HK$ {costPerStock.toFixed(4)}</div></div><div><span className="text-muted-foreground">Cost per base unit</span><div className="font-mono font-medium">HK$ {costPerBase.toFixed(4)}</div></div></div></div>;
}
