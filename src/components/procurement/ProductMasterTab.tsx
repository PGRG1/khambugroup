import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useProductMaster, ProductMasterItem, ProductSupplierEntry } from "@/hooks/useProductMaster";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, Plus, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, X, Download, GripHorizontal } from "lucide-react";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";
import { downloadCSV } from "@/utils/csvDownload";
import { toggleSortColumns, sortRows, type SortColumn } from "@/utils/tableSort";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import CategoryCascadeSelect from "@/components/procurement/CategoryCascadeSelect";
import { useVirtualizer } from "@tanstack/react-virtual";

const EMPTY_FORM = {
  internal_sku: "", external_sku: "", internal_product_name: "", supplier_product_name: "",
  level1_category: "", level2_category: "", level3_category: "",
  unit: "", unit_cost: "", supplier: "", status: "Active",
  purchase_unit: "", purchase_unit_cost: "",
  stock_uom: "", stock_qty: "1", cost_per_stock_unit: "0",
  base_unit_type: "g", base_unit_qty: "1", cost_per_base_unit: "0",
  notes: "",
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
  rowKey: string;
}

export default function ProductMasterTab() {
  const { products, loading, fetchProducts, createProduct, updateProduct, deleteProduct, addSupplier, updateSupplier, deleteSupplier, splitProduct, reassignSupplier, deleteProductIfOrphaned } = useProductMaster();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [l2Filter, setL2Filter] = useState("all");
  const [subCatFilter, setSubCatFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortColumns, setSortColumns] = useState<SortColumn[]>([{ key: "internal_sku", dir: "asc" }]);
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
      const sups = p.suppliers && p.suppliers.length > 0 ? p.suppliers : null;
      if (sups) {
        for (const s of sups) {
          rows.push({
            product: p, supplier_entry: s, rowKey: `${p.id}-${s.id}`,
            internal_sku: p.internal_sku, external_sku: s.external_sku,
            internal_product_name: p.internal_product_name, supplier_product_name: s.supplier_product_name,
            level1_category: p.level1_category, level2_category: p.level2_category, level3_category: p.level3_category,
            purchase_unit: s.purchase_unit, purchase_unit_cost: s.purchase_unit_cost,
            stock_uom: s.stock_uom ?? p.stock_uom, stock_qty: s.stock_qty ?? p.stock_qty, cost_per_stock_unit: s.purchase_unit_cost / ((s.stock_qty ?? p.stock_qty) || 1),
            base_unit_type: s.base_unit_type ?? p.base_unit_type, base_unit_qty: s.base_unit_qty ?? p.base_unit_qty, cost_per_base_unit: s.purchase_unit_cost / ((s.base_unit_qty ?? p.base_unit_qty) || 1),
            supplier: s.supplier, status: p.status, unit_cost: p.unit_cost, notes: p.notes || "",
          });
        }
      } else {
        rows.push({
          product: p, supplier_entry: null, rowKey: p.id,
          internal_sku: p.internal_sku, external_sku: p.external_sku,
          internal_product_name: p.internal_product_name, supplier_product_name: p.supplier_product_name,
          level1_category: p.level1_category, level2_category: p.level2_category, level3_category: p.level3_category,
          purchase_unit: p.purchase_unit, purchase_unit_cost: p.purchase_unit_cost,
          stock_uom: p.stock_uom, stock_qty: p.stock_qty, cost_per_stock_unit: p.cost_per_stock_unit,
          base_unit_type: p.base_unit_type, base_unit_qty: p.base_unit_qty, cost_per_base_unit: p.cost_per_base_unit,
          supplier: p.supplier, status: p.status, unit_cost: p.unit_cost, notes: p.notes || "",
        });
      }
    }
    return rows;
  }, [products]);

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
  }, [flatRows, search, catFilter, l2Filter, subCatFilter, supplierFilter, statusFilter, sortColumns]);

  const hasFilters = catFilter !== "all" || l2Filter !== "all" || subCatFilter !== "all" || supplierFilter !== "all" || statusFilter !== "all" || search;
  const clearFilters = () => { setCatFilter("all"); setL2Filter("all"); setSubCatFilter("all"); setSupplierFilter("all"); setStatusFilter("all"); setSearch(""); };

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
      unit: row.product.unit, unit_cost: String(row.unit_cost), supplier: row.supplier, status: row.status,
      purchase_unit: row.purchase_unit, purchase_unit_cost: String(row.purchase_unit_cost),
      stock_uom: row.stock_uom, stock_qty: String(row.stock_qty), cost_per_stock_unit: String(row.cost_per_stock_unit),
      base_unit_type: row.base_unit_type, base_unit_qty: String(row.base_unit_qty),
      cost_per_base_unit: String(row.cost_per_base_unit),
      notes: row.notes,
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
    const purchaseUnitCost = parseFloat(form.purchase_unit_cost) || 0;
    const stockQty = parseFloat(form.stock_qty) || 1;
    const costPerStockUnit = stockQty > 0 ? purchaseUnitCost / stockQty : 0;
    const recipeQty = parseFloat(form.base_unit_qty) || 1;
    const costPerRecipeUnit = recipeQty > 0 ? purchaseUnitCost / recipeQty : 0;

    if (editingProductId) {
      const pmUpdates = {
        internal_sku: form.internal_sku, internal_product_name: form.internal_product_name,
        level1_category: form.level1_category, level2_category: form.level2_category, level3_category: form.level3_category,
        unit: form.unit, unit_cost: parseFloat(form.unit_cost) || 0, status: form.status,
        notes: form.notes,
      };

      const supplierLevelFields = {
        supplier: form.supplier, external_sku: form.external_sku,
        supplier_product_name: form.supplier_product_name,
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

  const columns = [
    { key: "internal_sku", label: "Internal SKU" },
    { key: "external_sku", label: "External SKU" },
    { key: "internal_product_name", label: "Internal Product Name" },
    { key: "supplier_product_name", label: "Supplier Product Name" },
    { key: "level1_category", label: "L1 Category" },
    { key: "level2_category", label: "L2 Category" },
    { key: "level3_category", label: "L3 Category" },
    { key: "purchase_unit", label: "Purch. UOM" },
    { key: "purchase_unit_cost", label: "Purch. Cost", align: "right" as const },
    { key: "stock_uom", label: "Stock UOM" },
    { key: "stock_qty", label: "Stock Qty", align: "right" as const },
    { key: "cost_per_stock_unit", label: "Cost/Stock", align: "right" as const },
    { key: "base_unit_type", label: "Recipe UOM" },
    { key: "base_unit_qty", label: "Recipe Qty", align: "right" as const },
    { key: "cost_per_base_unit", label: "Cost/Recipe", align: "right" as const },
    { key: "supplier", label: "Supplier" },
    { key: "status", label: "Status" },
  ];

  // Grid template: must match across header / rows / footer. Last col = actions (70px).
  const GRID_COLS = "100px 110px minmax(180px,1.4fr) minmax(180px,1.4fr) 110px 110px 110px 100px 100px 100px 90px 100px 100px 100px 110px 130px 90px 70px";

  // Virtualization
  if (loading) {
    // hooks must be unconditional — moved virtualizer below
  }
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 100,
  });

  if (loading) return <div className="py-12 text-center text-muted-foreground">Loading products...</div>;

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search SKU, product name, supplier..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        <Select value={catFilter} onValueChange={(v) => { setCatFilter(v); setL2Filter("all"); setSubCatFilter("all"); }}>
          <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue placeholder="L1 Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All L1</SelectItem>
            {categories.filter(c => c && c.trim() !== "").map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={l2Filter} onValueChange={(v) => { setL2Filter(v); setSubCatFilter("all"); }}>
          <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue placeholder="L2 Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All L2</SelectItem>
            {l2Categories.filter(c => c && c.trim() !== "").map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={subCatFilter} onValueChange={setSubCatFilter}>
          <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue placeholder="L3 Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All L3</SelectItem>
            {subCategories.filter(c => c && c.trim() !== "").map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-[160px] h-9 text-xs"><SelectValue placeholder="Supplier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            {allSuppliers.filter(s => s && s.trim() !== "").map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[100px] h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <button onClick={clearFilters} className="text-xs text-primary hover:underline flex items-center gap-1">
            <X className="h-3 w-3" /> Clear
          </button>
        )}
        <Button size="sm" variant="outline" onClick={() => downloadCSV(filtered.map(r => ({
          internal_sku: r.internal_sku, external_sku: r.external_sku,
          internal_product_name: r.internal_product_name, supplier_product_name: r.supplier_product_name,
          level1_category: r.level1_category, level2_category: r.level2_category, level3_category: r.level3_category,
          purchase_unit: r.purchase_unit, purchase_unit_cost: r.purchase_unit_cost.toFixed(2),
          stock_uom: r.stock_uom, stock_qty: r.stock_qty, cost_per_stock_unit: r.cost_per_stock_unit.toFixed(4),
          base_unit_type: r.base_unit_type, base_unit_qty: r.base_unit_qty,
          cost_per_base_unit: r.cost_per_base_unit.toFixed(4),
          supplier: r.supplier, status: r.status,
        })), columns.map(c => ({ key: c.key, label: c.label })), "product_master")} className="h-9"><Download className="h-4 w-4 mr-1" />Download</Button>
        <Button size="sm" onClick={openCreate} className="ml-auto h-9"><Plus className="h-4 w-4 mr-1" />Add Product</Button>
      </div>

      <p className="text-xs text-muted-foreground">Showing {filtered.length} rows ({products.length} unique products)</p>

      {/* Virtualized table */}
      <div className="card-glass rounded-xl overflow-hidden">
        <div
          ref={scrollRef}
          className="overflow-auto bg-primary"
          style={{ height: "calc(100vh - 340px)", minHeight: 420 }}
        >
          <div style={{ minWidth: "min(1800px, 100%)", width: "100%" }}>
            {/* Header */}
            <div
              className="grid bg-primary text-primary-foreground text-[12px] font-semibold sticky top-0 z-10"
              style={{ gridTemplateColumns: GRID_COLS }}
            >
              {columns.map(col => (
                <div
                  key={col.key}
                  className={`px-3 py-2.5 cursor-pointer select-none whitespace-nowrap overflow-hidden flex items-center ${col.align === "right" ? "justify-end" : ""}`}
                  onClick={(e) => toggleSort(col.key, e.shiftKey)}
                  title="Click to sort. Shift+click to add another column."
                >
                  <span className="flex items-center gap-1">{col.label}<SortIcon col={col.key} /></span>
                </div>
              ))}
              <div></div>
            </div>

            {/* Body */}
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No products found</div>
            ) : (
              <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative", width: "100%" }}>
                  {virtualItems.map(vRow => {
                    const r = filtered[vRow.index];
                    const idx = vRow.index;
                    return (
                      <div
                        key={r.rowKey}
                        className={`grid items-center border-b border-border/40 hover:bg-accent/30 transition-colors text-[12px] ${idx % 2 === 0 ? "bg-card" : "bg-muted"}`}
                        style={{
                          gridTemplateColumns: GRID_COLS,
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          height: vRow.size,
                          transform: `translateY(${vRow.start}px)`,
                        }}
                      >
                        <div className="px-3 font-mono font-medium text-primary truncate">{r.internal_sku}</div>
                        <div className="px-3 font-mono text-muted-foreground truncate">{r.external_sku}</div>
                        <div className="px-3 font-medium text-foreground truncate">{r.internal_product_name}</div>
                        <div className="px-3 text-muted-foreground truncate">{r.supplier_product_name}</div>
                        <div className="px-3 truncate">{r.level1_category}</div>
                        <div className="px-3 truncate">{r.level2_category}</div>
                        <div className="px-3 truncate">{r.level3_category}</div>
                        <div className="px-3 truncate">{r.purchase_unit}</div>
                        <div className="px-3 text-right tabular-nums font-medium">{fmt(r.purchase_unit_cost)}</div>
                        <div className="px-3 truncate">{r.stock_uom}</div>
                        <div className="px-3 text-right tabular-nums">{fmt(r.stock_qty)}</div>
                        <div className="px-3 text-right tabular-nums">{fmt(r.cost_per_stock_unit)}</div>
                        <div className="px-3 truncate">{r.base_unit_type}</div>
                        <div className="px-3 text-right tabular-nums">{fmt(r.base_unit_qty)}</div>
                        <div className="px-3 text-right tabular-nums font-medium">{fmt4(r.cost_per_base_unit)}</div>
                        <div className="px-3 truncate">{r.supplier}</div>
                        <div className="px-3">
                          <Badge variant={r.status === "Active" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                            {r.status}
                          </Badge>
                        </div>
                        <div className="px-2 flex gap-1">
                          <button onClick={() => openEdit(r)} className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => { setDeletingRow(r); setDeleteOpen(true); }} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
            )}
          </div>
        </div>
      </div>

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
                <div><Label className="text-xs">Internal SKU *</Label><Input value={form.internal_sku} onChange={e => setForm({ ...form, internal_sku: e.target.value })} className={`h-9 text-sm ${duplicateSku !== null ? "border-amber-500" : ""}`} /></div>
                <div><Label className="text-xs">External SKU</Label><Input value={form.external_sku} onChange={e => setForm({ ...form, external_sku: e.target.value })} className="h-9 text-sm" /></div>
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
                <div className="col-span-2"><Label className="text-xs">Supplier Product Name</Label><Input value={form.supplier_product_name} onChange={e => setForm({ ...form, supplier_product_name: e.target.value })} className="h-9 text-sm" /></div>
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
                <div><Label className="text-xs">Purchase UOM</Label><Input value={form.purchase_unit} onChange={e => setForm({ ...form, purchase_unit: e.target.value })} placeholder="e.g. Case, Pack, Bag" className="h-9 text-sm" /></div>
                <div><Label className="text-xs">Purchase Cost</Label><Input type="number" step="0.01" value={form.purchase_unit_cost} onChange={e => setForm({ ...form, purchase_unit_cost: e.target.value })} className="h-9 text-sm" /></div>
                <div><Label className="text-xs">Stock UOM</Label><Input value={form.stock_uom} onChange={e => setForm({ ...form, stock_uom: e.target.value })} placeholder="e.g. Case, Bottle, Pack" className="h-9 text-sm" /></div>
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
                <div><Label className="text-xs">Recipe UOM</Label><Input value={form.base_unit_type} onChange={e => setForm({ ...form, base_unit_type: e.target.value })} placeholder="e.g. g, ml, ea" className="h-9 text-sm" /></div>
                <div><Label className="text-xs">Recipe Qty</Label><Input type="number" step="0.01" value={form.base_unit_qty} onChange={e => setForm({ ...form, base_unit_qty: e.target.value })} placeholder="e.g. 1000 for 1kg" className="h-9 text-sm" /></div>
                <div className="col-span-2 bg-muted/30 rounded-lg p-2">
                  <p className="text-xs text-muted-foreground">
                    Standard Cost per Recipe Unit: <span className="font-mono font-semibold text-foreground">${fmt4(liveCostPerRecipe)}</span>
                    <span className="ml-2 text-muted-foreground/70">(Purchase Cost ÷ Recipe Qty)</span>
                  </p>
                </div>

                <div className="col-span-2 border-t pt-3 mt-1">
                  <Label className="text-xs">Notes</Label>
                  <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." className="text-sm h-16" />
                </div>

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
