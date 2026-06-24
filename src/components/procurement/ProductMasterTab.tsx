import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useProductMaster, ProductMasterItem, ProductSupplierEntry, FINANCIAL_TREATMENTS, plSectionFor } from "@/hooks/useProductMaster";
import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Search, Plus, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, X, Download, GripHorizontal, AlertTriangle, CheckCircle2, Filter, Columns3, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Info } from "lucide-react";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";
import { downloadCSV } from "@/utils/csvDownload";
import { toggleSortColumns, sortRows, type SortColumn } from "@/utils/tableSort";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import CategoryCascadeSelect from "@/components/procurement/CategoryCascadeSelect";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

import UomSelect from "@/components/procurement/UomSelect";

const EMPTY_FORM = {
  internal_sku: "", external_sku: "", internal_product_name: "", supplier_product_name: "",
  level1_category: "", level2_category: "", level3_category: "",
  accounting_category: "",
  financial_treatment: "" as string,
  default_coa_account_id: "" as string,
  unit: "", unit_cost: "", supplier: "", status: "Active",
  purchase_unit: "", purchase_unit_cost: "",
  stock_uom: "", stock_qty: "1", cost_per_stock_unit: "0",
  base_unit_type: "g", base_unit_qty: "1", cost_per_base_unit: "0",
  notes: "",
  min_stock_qty: "", reorder_qty: "",
  creates_stock_movement: true as boolean,
  purchase_yield: "100",
  cooking_yield: "100",
};

interface FlatRow {
  product: ProductMasterItem;
  supplier_entry: ProductSupplierEntry | null;
  internal_sku: string;
  external_sku: string;
  internal_product_name: string;
  supplier_product_name: string;
  level1_category: string;
  level2_category: string;
  level3_category: string;
  accounting_category: string;
  financial_treatment: string;
  default_coa_account_id: string | null;
  default_coa_label: string;
  pl_section: string;
  mapping_status: "Mapped" | "Unmapped";
  purchase_unit: string;
  purchase_unit_cost: number;
  stock_uom: string;
  stock_qty: number;
  cost_per_stock_unit: number;
  base_unit_type: string;
  base_unit_qty: number;
  cost_per_base_unit: number;
  supplier: string;
  status: string;
  unit_cost: number;
  notes: string;
  creates_stock_movement: boolean;
  purchase_yield: number;
  cooking_yield: number;
  rowKey: string;
}

export default function ProductMasterTab() {
  const { products, loading, fetchProducts, createProduct, updateProduct, deleteProduct, addSupplier, updateSupplier, deleteSupplier, splitProduct, reassignSupplier, deleteProductIfOrphaned } = useProductMaster();
  const { tenantId } = useActiveTenant();
  const { toast } = useToast();
  const [seedingRefunds, setSeedingRefunds] = useState(false);
  const [refundSeedDismissed, setRefundSeedDismissed] = useState(
    () => (typeof window !== "undefined" ? localStorage.getItem("refund_seed_dismissed") === "true" : true)
  );
  const { items: coaAccounts } = useChartOfAccounts();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [l2Filter, setL2Filter] = useState("all");
  const [subCatFilter, setSubCatFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  
  const [treatmentFilter, setTreatmentFilter] = useState("all");
  const [mappingFilter, setMappingFilter] = useState("all");
  const [showLegacyCols, setShowLegacyCols] = useState(false);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>([
    { key: "mapping_status", dir: "asc" },
    { key: "internal_product_name", dir: "asc" },
  ]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editingSupplierEntryId, setEditingSupplierEntryId] = useState<string | null>(null);
  const [originalSku, setOriginalSku] = useState<string>("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingRow, setDeletingRow] = useState<FlatRow | null>(null);
  const [dbSuppliers, setDbSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [duplicateSku, setDuplicateSku] = useState<string | null>(null);
  const [confirmDuplicateOpen, setConfirmDuplicateOpen] = useState(false);

  useEffect(() => {
    supabase.from("suppliers").select("id, name").eq("is_active", true).order("name").then(({ data }) => {
      setDbSuppliers((data || []) as { id: string; name: string }[]);
    });
  }, []);

  const coaById = useMemo(() => {
    const m = new Map<string, { code: string; name: string; account_type: string }>();
    coaAccounts.forEach(a => m.set(a.id, { code: a.code, name: a.name, account_type: a.account_type }));
    return m;
  }, [coaAccounts]);

  const coaLabel = (id: string | null | undefined) => {
    if (!id) return "";
    const a = coaById.get(id);
    return a ? `${a.code} – ${a.name}` : "";
  };

  const categories = useMemo(() => [...new Set(products.map(p => p.level1_category))].filter(Boolean).sort(), [products]);
  const l2Categories = useMemo(() => {
    const filtered = catFilter !== "all" ? products.filter(p => p.level1_category === catFilter) : products;
    return [...new Set(filtered.map(p => p.level2_category).filter(Boolean))].sort();
  }, [products, catFilter]);
  const subCategories = useMemo(() => {
    let filtered = products;
    if (catFilter !== "all") filtered = filtered.filter(p => p.level1_category === catFilter);
    if (l2Filter !== "all") filtered = filtered.filter(p => p.level2_category === l2Filter);
    return [...new Set(filtered.map(p => p.level3_category).filter(Boolean))].sort();
  }, [products, catFilter, l2Filter]);
  const allSuppliers = useMemo(() => {
    const s = new Set<string>();
    products.forEach(p => {
      if (p.supplier) s.add(p.supplier);
      p.suppliers?.forEach(ps => { if (ps.supplier) s.add(ps.supplier); });
    });
    return [...s].sort();
  }, [products]);

  const flatRows = useMemo((): FlatRow[] => {
    const rows: FlatRow[] = [];
    for (const p of products) {
      const treatment = p.financial_treatment || "";
      const coaId = p.default_coa_account_id || null;
      const mapping_status: "Mapped" | "Unmapped" = (treatment && coaId) ? "Mapped" : "Unmapped";
      const baseFinancial = {
        financial_treatment: treatment,
        default_coa_account_id: coaId,
        default_coa_label: coaLabel(coaId),
        pl_section: plSectionFor(treatment),
        mapping_status,
      };
      const sups = p.suppliers && p.suppliers.length > 0 ? p.suppliers : null;
      if (sups) {
        for (const s of sups) {
          rows.push({
            product: p, supplier_entry: s, rowKey: `${p.id}-${s.id}`,
            internal_sku: p.internal_sku, external_sku: s.external_sku,
            internal_product_name: p.internal_product_name, supplier_product_name: s.supplier_product_name,
            level1_category: p.level1_category, level2_category: p.level2_category, level3_category: p.level3_category,
            accounting_category: ((s as any).accounting_category as string) || ((p as any).accounting_category as string) || "",
            ...baseFinancial,
            purchase_unit: s.purchase_unit, purchase_unit_cost: s.purchase_unit_cost,
            stock_uom: s.stock_uom ?? p.stock_uom, stock_qty: s.stock_qty ?? p.stock_qty, cost_per_stock_unit: s.purchase_unit_cost / ((s.stock_qty ?? p.stock_qty) || 1),
            base_unit_type: s.base_unit_type ?? p.base_unit_type, base_unit_qty: s.base_unit_qty ?? p.base_unit_qty, cost_per_base_unit: s.purchase_unit_cost / ((s.base_unit_qty ?? p.base_unit_qty) || 1),
            supplier: s.supplier, status: p.status, unit_cost: p.unit_cost, notes: p.notes || "",
            creates_stock_movement: p.creates_stock_movement ?? true,
            purchase_yield: p.purchase_yield ?? 100,
            cooking_yield: p.cooking_yield ?? 100,
          });
        }
      } else {
        rows.push({
          product: p, supplier_entry: null, rowKey: p.id,
          internal_sku: p.internal_sku, external_sku: p.external_sku,
          internal_product_name: p.internal_product_name, supplier_product_name: p.supplier_product_name,
          level1_category: p.level1_category, level2_category: p.level2_category, level3_category: p.level3_category,
          accounting_category: ((p as any).accounting_category as string) || "",
          ...baseFinancial,
          purchase_unit: p.purchase_unit, purchase_unit_cost: p.purchase_unit_cost,
          stock_uom: p.stock_uom, stock_qty: p.stock_qty, cost_per_stock_unit: p.cost_per_stock_unit,
          base_unit_type: p.base_unit_type, base_unit_qty: p.base_unit_qty, cost_per_base_unit: p.cost_per_base_unit,
          supplier: p.supplier, status: p.status, unit_cost: p.unit_cost, notes: p.notes || "",
          creates_stock_movement: p.creates_stock_movement ?? true,
          purchase_yield: p.purchase_yield ?? 100,
          cooking_yield: p.cooking_yield ?? 100,
        });
      }
    }
    return rows;
  }, [products, coaById]);

  const toggleSort = (key: string, additive: boolean) => {
    setSortColumns(prev => toggleSortColumns(prev, key, additive));
  };

  const SortIcon = ({ col }: { col: string }) => {
    const entry = sortColumns.find(s => s.key === col);
    if (!entry) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return (
      <span className="inline-flex items-center gap-0.5">
        {entry.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        {sortColumns.length > 1 && <span className="text-[9px] font-bold">{sortColumns.indexOf(entry) + 1}</span>}
      </span>
    );
  };

  const filtered = useMemo(() => {
    let result = flatRows.filter(r => {
      if (catFilter !== "all" && r.level1_category !== catFilter) return false;
      if (l2Filter !== "all" && r.level2_category !== l2Filter) return false;
      if (subCatFilter !== "all" && r.level3_category !== subCatFilter) return false;
      if (supplierFilter !== "all" && r.supplier !== supplierFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      
      if (treatmentFilter !== "all") {
        if (treatmentFilter === "__unmapped__") {
          if (r.financial_treatment) return false;
        } else if (r.financial_treatment !== treatmentFilter) return false;
      }
      if (mappingFilter !== "all" && r.mapping_status !== mappingFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return r.internal_sku.toLowerCase().includes(q) ||
          r.external_sku.toLowerCase().includes(q) ||
          r.internal_product_name.toLowerCase().includes(q) ||
          r.supplier_product_name.toLowerCase().includes(q) ||
          r.supplier.toLowerCase().includes(q);
      }
      return true;
    });
    return sortRows(result, sortColumns);
  }, [flatRows, search, catFilter, l2Filter, subCatFilter, supplierFilter, statusFilter, treatmentFilter, mappingFilter, sortColumns]);

  const hasFilters = catFilter !== "all" || l2Filter !== "all" || subCatFilter !== "all" || supplierFilter !== "all" || statusFilter !== "all" || treatmentFilter !== "all" || mappingFilter !== "all" || search;
  const clearFilters = () => { setCatFilter("all"); setL2Filter("all"); setSubCatFilter("all"); setSupplierFilter("all"); setStatusFilter("all"); setTreatmentFilter("all"); setMappingFilter("all"); setSearch(""); };

  // Collect legacy free-text UOMs from existing products so dropdowns still display them.
  const legacyPurchaseUoms = useMemo(() => flatRows.map(r => r.purchase_unit), [flatRows]);
  const legacyStockUoms = useMemo(() => flatRows.map(r => r.stock_uom), [flatRows]);
  const legacyBaseUoms = useMemo(() => flatRows.map(r => r.base_unit_type), [flatRows]);

  // Duplicate SKU detection for create mode
  useEffect(() => {
    const sku = form.internal_sku.trim();
    if (!sku) { setDuplicateSku(null); return; }
    // When editing, only warn if SKU changed to a *different* existing product
    if (editingProductId && sku === originalSku) { setDuplicateSku(null); return; }
    const matched = products.find(p => p.internal_sku === sku && p.id !== editingProductId);
    setDuplicateSku(matched ? matched.internal_product_name : null);
  }, [form.internal_sku, editingProductId, originalSku, products]);

  const openCreate = () => {
    setEditingProductId(null);
    setEditingSupplierEntryId(null);
    setForm(EMPTY_FORM);
    setDragPos(null);
    setDuplicateSku(null);
    setDialogOpen(true);
  };

  const openEdit = (row: FlatRow) => {
    setEditingProductId(row.product.id);
    setEditingSupplierEntryId(row.supplier_entry?.id || null);
    setOriginalSku(row.internal_sku);
    setForm({
      internal_sku: row.internal_sku, external_sku: row.external_sku,
      internal_product_name: row.internal_product_name, supplier_product_name: row.supplier_product_name,
      level1_category: row.level1_category, level2_category: row.level2_category, level3_category: row.level3_category,
      accounting_category: row.accounting_category,
      financial_treatment: row.financial_treatment || "",
      default_coa_account_id: row.default_coa_account_id || "",
      unit: row.product.unit, unit_cost: String(row.unit_cost), supplier: row.supplier, status: row.status,
      purchase_unit: row.purchase_unit, purchase_unit_cost: String(row.purchase_unit_cost),
      stock_uom: row.stock_uom, stock_qty: String(row.stock_qty), cost_per_stock_unit: String(row.cost_per_stock_unit),
      base_unit_type: row.base_unit_type, base_unit_qty: String(row.base_unit_qty),
      cost_per_base_unit: String(row.cost_per_base_unit),
      notes: row.notes,
      min_stock_qty: (row.product as any).min_stock_qty != null ? String((row.product as any).min_stock_qty) : "",
      reorder_qty: (row.product as any).reorder_qty != null ? String((row.product as any).reorder_qty) : "",
      creates_stock_movement: row.creates_stock_movement,
      purchase_yield: String(row.purchase_yield ?? 100),
      cooking_yield: String(row.cooking_yield ?? 100),
    });
    setDragPos(null);
    setDialogOpen(true);
  };

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const modal = modalRef.current;
    if (!modal) return;
    const rect = modal.getBoundingClientRect();
    const orig = dragPos || { x: 0, y: 0 };
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: orig.x, origY: orig.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      let newX = dragRef.current.origX + dx;
      let newY = dragRef.current.origY + dy;
      const maxX = window.innerWidth - rect.width;
      const maxY = window.innerHeight - rect.height;
      const centerX = (window.innerWidth - rect.width) / 2;
      const centerY = (window.innerHeight - rect.height) / 2;
      newX = Math.max(-centerX, Math.min(maxX - centerX, newX));
      newY = Math.max(-centerY, Math.min(maxY - centerY, newY));
      setDragPos({ x: newX, y: newY });
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [dragPos]);

  const attemptSave = () => {
    if (duplicateSku !== null) {
      setConfirmDuplicateOpen(true);
      return;
    }
    handleSave();
  };

  const handleSave = async () => {
    setConfirmDuplicateOpen(false);

    // Yield validation (only relevant when item creates stock movement, but we sanitise regardless)
    const py = parseFloat(form.purchase_yield);
    const cy = parseFloat(form.cooking_yield);
    if (isNaN(py) || py < 1 || py > 100) {
      toast({ title: "Invalid yield", description: "Purchase yield must be between 1% and 100%", variant: "destructive" });
      return;
    }
    if (isNaN(cy) || cy < 1 || cy > 100) {
      toast({ title: "Invalid yield", description: "Cooking yield must be between 1% and 100%", variant: "destructive" });
      return;
    }

    const purchaseUnitCost = parseFloat(form.purchase_unit_cost) || 0;
    const stockQty = parseFloat(form.stock_qty) || 1;
    const costPerStockUnit = stockQty > 0 ? purchaseUnitCost / stockQty : 0;
    const recipeQty = parseFloat(form.base_unit_qty) || 1;
    const costPerRecipeUnit = recipeQty > 0 ? purchaseUnitCost / recipeQty : 0;

    if (editingProductId) {
      const pmUpdates: any = {
        internal_sku: form.internal_sku, internal_product_name: form.internal_product_name,
        level1_category: form.level1_category, level2_category: form.level2_category, level3_category: form.level3_category,
        accounting_category: form.accounting_category,
        financial_treatment: form.financial_treatment,
        default_coa_account_id: form.default_coa_account_id || null,
        unit: form.unit, unit_cost: parseFloat(form.unit_cost) || 0, status: form.status,
        notes: form.notes,
        min_stock_qty: form.min_stock_qty === "" ? null : parseFloat(form.min_stock_qty),
        reorder_qty: form.reorder_qty === "" ? null : parseFloat(form.reorder_qty),
        creates_stock_movement: form.creates_stock_movement,
        purchase_yield: py,
        cooking_yield: cy,
      };


      const supplierLevelFields = {
        supplier: form.supplier, external_sku: form.external_sku,
        supplier_product_name: form.supplier_product_name,
        accounting_category: form.accounting_category,
        purchase_unit: form.purchase_unit, purchase_unit_cost: purchaseUnitCost,
        stock_uom: form.stock_uom, stock_qty: stockQty,
        base_unit_type: form.base_unit_type, base_unit_qty: recipeQty,
        status: form.status,
      };

      // Check if SKU changed and product is shared by multiple supplier entries
      const editedProduct = products.find(p => p.id === editingProductId);
      const isShared = editedProduct && (editedProduct.suppliers?.length ?? 0) > 1;
      const skuChanged = form.internal_sku !== originalSku;

      // Merge-on-SKU-match: if SKU changed to one that already exists on a different product_master
      const existingMatch = skuChanged
        ? products.find(p => p.internal_sku === form.internal_sku && p.id !== editingProductId)
        : null;

      if (existingMatch && editingSupplierEntryId) {
        await reassignSupplier(editingSupplierEntryId, existingMatch.id);
        await updateSupplier(editingSupplierEntryId, supplierLevelFields);
        await deleteProductIfOrphaned(editingProductId);
      } else if (skuChanged && isShared && editingSupplierEntryId) {
        await splitProduct(editingProductId, editingSupplierEntryId, pmUpdates);
      } else {
        // Update product_master
        const { error: pmErr } = await supabase.from("product_master" as any).update(pmUpdates as any).eq("id", editingProductId);
        if (pmErr) { console.error("product_master update error:", pmErr); }
        // Update supplier entry if present
        if (editingSupplierEntryId) {
          const { error: psErr } = await supabase.from("product_suppliers" as any).update(supplierLevelFields as any).eq("id", editingSupplierEntryId);
          if (psErr) { console.error("product_suppliers update error:", psErr); }
        } else {
          // Orphan product (no supplier row yet) — auto-create one if any supplier-level data was entered
          const hasSupplierData =
            !!supplierLevelFields.supplier ||
            !!supplierLevelFields.external_sku ||
            !!supplierLevelFields.supplier_product_name ||
            (supplierLevelFields.purchase_unit_cost ?? 0) > 0;
          if (hasSupplierData) {
            const { error: psErr } = await supabase
              .from("product_suppliers" as any)
              .insert({ ...supplierLevelFields, product_master_id: editingProductId } as any);
            if (psErr) { console.error("product_suppliers insert error:", psErr); }
          }
        }
        // Single fetch after both updates are committed
        await fetchProducts();
      }
      setDialogOpen(false);
    } else {
      const data = {
        ...form,
        unit_cost: parseFloat(form.unit_cost) || 0,
        purchase_unit_cost: purchaseUnitCost,
        stock_qty: stockQty, cost_per_stock_unit: costPerStockUnit,
        base_unit_qty: recipeQty, cost_per_base_unit: costPerRecipeUnit,
        purchase_yield: py,
        cooking_yield: cy,
      };
      const ok = await createProduct(data as any);
      if (ok) setDialogOpen(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingRow) return;
    if (deletingRow.supplier_entry) {
      const supplierCount = deletingRow.product.suppliers?.length || 0;
      if (supplierCount > 1) {
        await deleteSupplier(deletingRow.supplier_entry.id);
      } else {
        await deleteProduct(deletingRow.product.id);
      }
    } else {
      await deleteProduct(deletingRow.product.id);
    }
    setDeleteOpen(false);
    setDeletingRow(null);
  };

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt4 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

  const liveCostPerStock = (() => {
    const puc = parseFloat(form.purchase_unit_cost) || 0;
    const sq = parseFloat(form.stock_qty) || 1;
    return sq > 0 ? puc / sq : 0;
  })();

  const liveCostPerRecipe = (() => {
    const puc = parseFloat(form.purchase_unit_cost) || 0;
    const rq = parseFloat(form.base_unit_qty) || 1;
    return rq > 0 ? puc / rq : 0;
  })();

  const baseColumns = [
    { key: "internal_product_name", label: "Product Name" },
    { key: "supplier", label: "Supplier & Vendor" },
    { key: "level1_category", label: "L1" },
    { key: "level2_category", label: "L2" },
    { key: "level3_category", label: "L3" },
    { key: "financial_treatment", label: "Financial Treatment" },
    { key: "mapping_status", label: "Mapping" },
    { key: "status", label: "Active" },
  ];
  const legacyColumns = [
    { key: "internal_sku", label: "Internal SKU" },
    { key: "external_sku", label: "External SKU" },
    { key: "supplier_product_name", label: "Supplier Product Name" },
    { key: "purchase_unit", label: "Purch. UOM" },
    { key: "purchase_unit_cost", label: "Purch. Cost", align: "right" as const },
    { key: "stock_uom", label: "Stock UOM" },
    { key: "stock_qty", label: "Stock Qty", align: "right" as const },
  ];
  const columns = showLegacyCols ? [...baseColumns, ...legacyColumns] : baseColumns;
  const GRID_COLS = showLegacyCols
    ? "minmax(200px,1.5fr) 130px 100px 100px 100px 180px 110px 80px 100px 110px minmax(160px,1.2fr) 100px 100px 100px 90px 70px"
    : "minmax(220px,1.6fr) 140px 110px 110px 110px 200px 110px 90px 70px";

  if (loading) return <div className="py-12 text-center text-muted-foreground">Loading products...</div>;

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(pageStart, pageStart + pageSize);
  const rangeStart = filtered.length === 0 ? 0 : pageStart + 1;
  const rangeEnd = Math.min(filtered.length, pageStart + pageSize);
  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); return pages; }
    pages.push(1);
    if (currentPage > 3) pages.push("...");
    const s = Math.max(2, currentPage - 1);
    const e = Math.min(totalPages - 1, currentPage + 1);
    for (let i = s; i <= e; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
    return pages;
  };

  const activeFilterCount =
    (catFilter !== "all" ? 1 : 0) +
    (l2Filter !== "all" ? 1 : 0) +
    (subCatFilter !== "all" ? 1 : 0) +
    (supplierFilter !== "all" ? 1 : 0) +
    (treatmentFilter !== "all" ? 1 : 0) +
    (mappingFilter !== "all" ? 1 : 0);

  const SORT_LABELS: Record<string, string> = Object.fromEntries(columns.map(c => [c.key, c.label]));
  const primarySort = sortColumns[0];

  const hasRefundItems = products.some(p => p.internal_sku?.startsWith("REF-"));
  const showRefundSeedBanner = !refundSeedDismissed && !hasRefundItems && !loading;

  const dismissSeedBanner = () => {
    localStorage.setItem("refund_seed_dismissed", "true");
    setRefundSeedDismissed(true);
  };

  const seedRefundItems = async () => {
    if (!tenantId || seedingRefunds) return;
    setSeedingRefunds(true);
    const refundItems = [
      { internal_sku: "REF-0001", internal_product_name: "Price correction" },
      { internal_sku: "REF-0002", internal_product_name: "Short delivery credit" },
      { internal_sku: "REF-0003", internal_product_name: "Quality rejection credit" },
      { internal_sku: "REF-0004", internal_product_name: "Damaged goods credit" },
      { internal_sku: "REF-0005", internal_product_name: "Promotional rebate" },
      { internal_sku: "REF-0006", internal_product_name: "Volume rebate" },
      { internal_sku: "REF-0007", internal_product_name: "General supplier refund" },
    ];
    try {
      const payload = refundItems.map(r => ({
        internal_sku: r.internal_sku,
        external_sku: "",
        internal_product_name: r.internal_product_name,
        supplier_product_name: "",
        level1_category: "Supplier Refunds",
        level2_category: "",
        level3_category: "",
        accounting_category: "purchases",
        financial_treatment: "COGS",
        default_coa_account_id: null,
        unit: "",
        unit_cost: 0,
        purchase_unit: "",
        purchase_unit_cost: 0,
        stock_uom: "",
        stock_qty: 0,
        cost_per_stock_unit: 0,
        base_unit_type: "",
        base_unit_qty: 0,
        cost_per_base_unit: 0,
        notes: "",
        status: "Active",
        creates_stock_movement: false,
        min_stock_qty: null,
        reorder_qty: null,
        tenant_id: tenantId,
      }));
      const { error } = await supabase.from("product_master" as any).insert(payload as any);
      if (error) throw error;
      toast({ title: "Refund items added", description: `Created ${payload.length} standard refund items.` });
      await fetchProducts();
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to seed refund items", variant: "destructive" });
    } finally {
      setSeedingRefunds(false);
    }
  };

  return (
    <div className="space-y-4">
      {showRefundSeedBanner && (
        <Alert className="border-sky-500/40 bg-sky-500/5">
          <Info className="h-4 w-4 text-sky-400" />
          <AlertDescription className="flex items-center justify-between gap-3 w-full">
            <span className="text-sm">
              Add standard supplier refund items? Used for price corrections and credits on invoices.
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" onClick={seedRefundItems} disabled={seedingRefunds || !tenantId}>
                {seedingRefunds ? "Adding..." : "Add refund items"}
              </Button>
              <Button size="sm" variant="ghost" onClick={dismissSeedBanner}>Not now</Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {/* Top toolbar: search + add */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search SKU, product name, supplier & vendor..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm bg-background/40" />
        </div>
        <Button size="sm" variant="outline" onClick={() => downloadCSV(filtered.map(r => ({
          internal_sku: r.internal_sku, external_sku: r.external_sku,
          internal_product_name: r.internal_product_name, supplier_product_name: r.supplier_product_name,
          level1_category: r.level1_category, level2_category: r.level2_category, level3_category: r.level3_category,
          purchase_unit: r.purchase_unit, purchase_unit_cost: r.purchase_unit_cost.toFixed(2),
          stock_uom: r.stock_uom, stock_qty: r.stock_qty, cost_per_stock_unit: r.cost_per_stock_unit.toFixed(4),
          base_unit_type: r.base_unit_type, base_unit_qty: r.base_unit_qty,
          cost_per_base_unit: r.cost_per_base_unit.toFixed(4),
          supplier: r.supplier, status: r.status,
          creates_stock_movement: r.creates_stock_movement ? "Yes" : "No",
        })), [...columns.map(c => ({ key: c.key, label: c.label })), { key: "creates_stock_movement", label: "Creates Stock Movement" }], "product_master")} className="h-9 ml-auto"><Download className="h-4 w-4 mr-1" />Download</Button>
        <Button size="sm" onClick={openCreate} className="h-9"><Plus className="h-4 w-4 mr-1" />Add Item</Button>
      </div>

      {/* Document-Centre-style toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 h-9">
                <Filter className="h-3.5 w-3.5" /> Filters
                {activeFilterCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center text-[10px] font-medium bg-primary/20 text-primary rounded px-1.5 min-w-[16px] h-4">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-4 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">L1 Category</label>
                <Select value={catFilter} onValueChange={(v) => { setCatFilter(v); setL2Filter("all"); setSubCatFilter("all"); }}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="All L1" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All L1</SelectItem>
                    {categories.filter(c => c && c.trim() !== "").map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">L2 Category</label>
                <Select value={l2Filter} onValueChange={(v) => { setL2Filter(v); setSubCatFilter("all"); }}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="All L2" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All L2</SelectItem>
                    {l2Categories.filter(c => c && c.trim() !== "").map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">L3 Category</label>
                <Select value={subCatFilter} onValueChange={setSubCatFilter}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="All L3" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All L3</SelectItem>
                    {subCategories.filter(c => c && c.trim() !== "").map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Supplier & Vendor</label>
                <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="All Suppliers & Vendors" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Suppliers & Vendors</SelectItem>
                    {allSuppliers.filter(s => s && s.trim() !== "").map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Financial Treatment</label>
                <Select value={treatmentFilter} onValueChange={setTreatmentFilter}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="All Treatments" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Treatments</SelectItem>
                    <SelectItem value="__unmapped__">— Unmapped —</SelectItem>
                    {FINANCIAL_TREATMENTS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Mapping Status</label>
                <Select value={mappingFilter} onValueChange={setMappingFilter}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Mapping</SelectItem>
                    <SelectItem value="Mapped">Mapped</SelectItem>
                    <SelectItem value="Unmapped">Unmapped</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end pt-1">
                <Button variant="ghost" size="sm" onClick={clearFilters} disabled={!hasFilters}>Reset</Button>
              </div>
            </PopoverContent>
          </Popover>
          <span className="text-xs text-muted-foreground ml-1">Showing {filtered.length} rows ({products.length} unique items)</span>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 h-9"><Columns3 className="h-3.5 w-3.5" /> Columns</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={showLegacyCols}
                onCheckedChange={(v) => setShowLegacyCols(!!v)}
              >
                Show SKU / UOM details
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 h-9">
                <ArrowUpDown className="h-3.5 w-3.5" /> {primarySort ? SORT_LABELS[primarySort.key] || primarySort.key : "Sort"} ({primarySort?.dir === "asc" ? "↑" : "↓"})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns.map(c => (
                <DropdownMenuItem key={c.key} onClick={() => setSortColumns([{ key: c.key, dir: primarySort?.key === c.key && primarySort.dir === "asc" ? "desc" : "asc" }])}>
                  {primarySort?.key === c.key && <Check className="h-3.5 w-3.5 mr-2" />}
                  <span className={primarySort?.key === c.key ? "" : "ml-[22px]"}>{c.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Table */}
      <Card className="card-glass overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map(col => (
                  <TableHead
                    key={col.key}
                    className={`cursor-pointer select-none whitespace-nowrap ${(col as any).align === "right" ? "text-right" : ""}`}
                    onClick={(e) => toggleSort(col.key, (e as any).shiftKey)}
                    title="Click to sort. Shift+click to add another column."
                  >
                    <span className="inline-flex items-center gap-1">{col.label}<SortIcon col={col.key} /></span>
                  </TableHead>
                ))}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="text-center text-muted-foreground py-12">
                    No products found.
                  </TableCell>
                </TableRow>
              )}
              {pageItems.map((r) => (
                <TableRow key={r.rowKey}>
                  <TableCell className="font-medium max-w-[280px] truncate" title={r.internal_product_name}>{r.internal_product_name}</TableCell>
                  <TableCell className="truncate max-w-[180px]" title={r.supplier}>{r.supplier}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.level1_category}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.level2_category}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.level3_category}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 flex-wrap">
                      {r.financial_treatment ? (
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${r.financial_treatment === "COGS" || r.financial_treatment === "OpEx" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-sky-500/40 bg-sky-500/10 text-sky-300"}`}>
                          {r.financial_treatment}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground italic">—</span>
                      )}
                      {r.financial_treatment === "COGS" && !r.creates_stock_movement && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-muted-foreground/30 bg-muted/30 text-muted-foreground">
                          No stock
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {r.mapping_status === "Mapped" ? (
                      <span className="chip chip-success"><CheckCircle2 className="h-3 w-3" /> Mapped</span>
                    ) : (
                      <span className="chip chip-danger"><AlertTriangle className="h-3 w-3" /> Unmapped</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "Active" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">{r.status}</Badge>
                  </TableCell>
                  {showLegacyCols && (
                    <>
                      <TableCell className="font-mono text-xs text-primary truncate max-w-[140px]">{r.internal_sku}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[140px]">{r.external_sku}</TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[180px]">{r.supplier_product_name}</TableCell>
                      <TableCell className="text-xs">{r.purchase_unit}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{fmt(r.purchase_unit_cost)}</TableCell>
                      <TableCell className="text-xs">{r.stock_uom}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{fmt(r.stock_qty)}</TableCell>
                    </>
                  )}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setDeletingRow(r); setDeleteOpen(true); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination footer */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border/50 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Rows per page:</span>
            <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="w-[80px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="td-num">{rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} of {filtered.length.toLocaleString()}</span>
            <div className="flex items-center gap-1 ml-2">
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              {getPageNumbers().map((p, i) =>
                p === "..." ? (
                  <span key={`e-${i}`} className="px-2 text-muted-foreground">…</span>
                ) : (
                  <Button key={p} variant={p === currentPage ? "default" : "ghost"} size="icon" className="h-8 w-8 td-num" onClick={() => setPage(p as number)}>{p}</Button>
                ),
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}><ChevronRight className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}><ChevronsRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      </Card>


      {/* Draggable Create/Edit Modal */}
      {dialogOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setDialogOpen(false)} />
          <div
            ref={modalRef}
            className="fixed z-50 left-1/2 top-1/2 w-full max-w-lg bg-background border rounded-xl shadow-xl"
            style={{ transform: `translate(calc(-50% + ${dragPos?.x ?? 0}px), calc(-50% + ${dragPos?.y ?? 0}px))` }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 border-b cursor-grab active:cursor-grabbing select-none"
              onMouseDown={onDragStart}
            >
              <div className="flex items-center gap-2">
                <GripHorizontal className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">{editingProductId ? "Edit Product" : "Add Product"}</h2>
              </div>
              <button onClick={() => setDialogOpen(false)} className="p-1 rounded hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-4 py-4 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className={form.creates_stock_movement ? "" : "col-span-2"}><Label className="text-xs">Internal SKU *</Label><Input value={form.internal_sku} onChange={e => setForm({ ...form, internal_sku: e.target.value })} className={`h-9 text-sm ${duplicateSku !== null ? "border-amber-500" : ""}`} /></div>
                {form.creates_stock_movement && (
                  <div><Label className="text-xs">External SKU</Label><Input value={form.external_sku} onChange={e => setForm({ ...form, external_sku: e.target.value })} className="h-9 text-sm" /></div>
                )}
                {duplicateSku !== null && (
                  <div className="col-span-2">
                    <Alert className="border-amber-400 bg-amber-50 py-2">
                      <AlertDescription className="text-xs text-amber-800">
                        ⚠ SKU "{form.internal_sku}" already exists — "{duplicateSku}".{" "}
                        {editingProductId
                          ? "Saving will merge this supplier entry into the existing product."
                          : "Saving will add a new supplier entry (e.g. different weight/pack size) to this product."}
                      </AlertDescription>
                    </Alert>
                  </div>
                )}
                <div className="col-span-2"><Label className="text-xs">Internal Product Name *</Label><Input value={form.internal_product_name} onChange={e => setForm({ ...form, internal_product_name: e.target.value })} className="h-9 text-sm" /></div>
                {form.creates_stock_movement && (
                  <div className="col-span-2"><Label className="text-xs">Supplier Product Name</Label><Input value={form.supplier_product_name} onChange={e => setForm({ ...form, supplier_product_name: e.target.value })} className="h-9 text-sm" /></div>
                )}
                <div className="col-span-2">
                  <Label className="text-xs">Categories (L1 → L2 → L3)</Label>
                  <CategoryCascadeSelect
                    level1={form.level1_category}
                    level2={form.level2_category}
                    level3={form.level3_category}
                    onChange={(v) => setForm({ ...form, level1_category: v.level1, level2_category: v.level2, level3_category: v.level3 })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Financial Treatment</Label>
                  <Select
                    value={form.financial_treatment || "__none__"}
                    onValueChange={v => {
                      const treatment = v === "__none__" ? "" : v;
                      const autoStock = treatment === "COGS";
                      setForm({ ...form, financial_treatment: treatment, default_coa_account_id: "", creates_stock_movement: autoStock });
                    }}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select treatment" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      <SelectItem value="COGS">COGS</SelectItem>
                      <SelectItem value="OpEx">OpEx</SelectItem>
                      <SelectItem value="Asset - Supplier Deposit">Asset – Supplier & Vendor Deposit</SelectItem>
                      <SelectItem value="Asset - Fixed Asset">Asset – Fixed Asset</SelectItem>
                      <SelectItem value="Asset - Prepayment">Asset – Prepayment</SelectItem>
                      <SelectItem value="Asset - Other">Asset – Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground mt-1">Drives default COA account via L1 mapping. Override below if needed.</p>
                </div>
                <div>
                  <Label className="text-xs">COA Account Override (optional)</Label>
                  <Select
                    value={form.default_coa_account_id || "__inherit__"}
                    onValueChange={v => setForm({ ...form, default_coa_account_id: v === "__inherit__" ? "" : v })}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Inherit from mapping" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__inherit__">— Inherit from mapping —</SelectItem>
                      {coaAccounts
                        .filter(a => a.is_active)
                        .filter(a => {
                          const t = form.financial_treatment;
                          if (!t) return true;
                          if (t === "COGS") return a.account_type === "cogs";
                          if (t === "OpEx") return a.account_type === "opex";
                          if (t.startsWith("Asset")) return a.account_type === "asset";
                          return true;
                        })
                        .map(a => (
                          <SelectItem key={a.id} value={a.id} className="text-xs">
                            <span className="font-mono text-muted-foreground mr-2">{a.code}</span>{a.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
                  <div className="flex-1">
                    <Label className="text-xs font-medium">Creates stock movement</Label>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      When off, receiving this item will not update inventory quantities. Use for price corrections, refunds, deposits and non-stock expenses.
                    </p>
                  </div>
                  <Switch
                    checked={form.creates_stock_movement}
                    onCheckedChange={(v) => setForm(f => ({ ...f, creates_stock_movement: v }))}
                  />
                </div>
                {form.creates_stock_movement && (
                  <>
                    <div className="col-span-2">
                      <Label className="text-xs">Supplier</Label>
                      <Select value={form.supplier} onValueChange={v => setForm({ ...form, supplier: v })}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                        <SelectContent>
                          {dbSuppliers.filter(s => s.name && s.name.trim() !== "").map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Purchase & Stock */}
                    <div className="col-span-2 border-t pt-3 mt-1">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Purchase & Stock Units</p>
                    </div>
                    <div>
                      <Label className="text-xs">Purchase UOM</Label>
                      <UomSelect type="purchase" value={form.purchase_unit} onChange={v => setForm({ ...form, purchase_unit: v })} placeholder="e.g. Case, Pack" legacyValues={legacyPurchaseUoms} />
                    </div>
                    <div><Label className="text-xs">Purchase Cost</Label><Input type="number" step="0.01" value={form.purchase_unit_cost} onChange={e => setForm({ ...form, purchase_unit_cost: e.target.value })} className="h-9 text-sm" /></div>
                    <div>
                      <Label className="text-xs">Stock UOM</Label>
                      <UomSelect type="stock" value={form.stock_uom} onChange={v => setForm({ ...form, stock_uom: v })} placeholder="e.g. Bottle, Pack" legacyValues={legacyStockUoms} />
                    </div>
                    <div><Label className="text-xs">Stock Qty</Label><Input type="number" step="0.01" value={form.stock_qty} onChange={e => setForm({ ...form, stock_qty: e.target.value })} className="h-9 text-sm" /></div>
                    <div className="col-span-2 bg-muted/30 rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">
                        Cost per Stock Unit: <span className="font-mono font-semibold text-foreground">${fmt(liveCostPerStock)}</span>
                        <span className="ml-2 text-muted-foreground/70">(Purchase Cost ÷ Stock Qty)</span>
                      </p>
                    </div>

                    {/* Recipe units */}
                    <div className="col-span-2 border-t pt-3 mt-1">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Recipe Units</p>
                    </div>
                    <div>
                      <Label className="text-xs">Recipe UOM</Label>
                      <UomSelect type="base" value={form.base_unit_type} onChange={v => setForm({ ...form, base_unit_type: v })} placeholder="e.g. g, ml, ea" legacyValues={legacyBaseUoms} />
                    </div>
                    <div><Label className="text-xs">Recipe Qty</Label><Input type="number" step="0.01" value={form.base_unit_qty} onChange={e => setForm({ ...form, base_unit_qty: e.target.value })} placeholder="e.g. 1000 for 1kg" className="h-9 text-sm" /></div>
                    <div className="col-span-2 bg-muted/30 rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">
                        Standard Cost per Recipe Unit: <span className="font-mono font-semibold text-foreground">${fmt4(liveCostPerRecipe)}</span>
                        <span className="ml-2 text-muted-foreground/70">(Purchase Cost ÷ Recipe Qty)</span>
                      </p>
                    </div>
                  </>
                )}

                <div className="col-span-2 border-t pt-3 mt-1">
                  <Label className="text-xs">Notes</Label>
                  <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." className="text-sm h-16" />
                </div>

                <div className="col-span-2 border-t pt-3 mt-1">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Reorder settings</p>
                </div>
                <div><Label className="text-xs">Min stock qty</Label><Input type="number" step="0.01" value={form.min_stock_qty} onChange={e => setForm({ ...form, min_stock_qty: e.target.value })} className="h-9 text-sm" /></div>
                <div><Label className="text-xs">Reorder qty</Label><Input type="number" step="0.01" value={form.reorder_qty} onChange={e => setForm({ ...form, reorder_qty: e.target.value })} className="h-9 text-sm" /></div>

                <div>
                  <Label className="text-xs">Status</Label>
                  <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={attemptSave} disabled={!form.internal_sku.trim() || !form.internal_product_name.trim()}>
                {editingProductId ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </>
      )}

      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        title="Delete Entry"
        description={
          deletingRow?.supplier_entry && (deletingRow.product.suppliers?.length || 0) > 1
            ? "This will remove this supplier's pricing for this product. The product itself will remain."
            : "This will permanently remove this product and all its supplier entries from the master list."
        }
      />

      <AlertDialog open={confirmDuplicateOpen} onOpenChange={setConfirmDuplicateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate SKU Detected</AlertDialogTitle>
            <AlertDialogDescription>
              A product with SKU "{form.internal_sku}" ("{duplicateSku}") already exists.{" "}
              {editingProductId
                ? "This will merge this supplier entry into the existing product. Continue?"
                : "This will add a new supplier entry to the existing product — useful when the same supplier sells different weights or pack sizes under the same internal SKU. Continue?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave}>Yes, Add Supplier Entry</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
