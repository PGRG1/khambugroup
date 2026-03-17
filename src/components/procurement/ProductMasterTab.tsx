import React, { useState, useMemo } from "react";
import { useProductMaster, ProductMasterItem, ProductSupplierEntry } from "@/hooks/useProductMaster";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, X, Download, ChevronDown, ChevronRight, Store } from "lucide-react";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";
import { downloadCSV } from "@/utils/csvDownload";

const EMPTY_FORM = {
  internal_sku: "", external_sku: "", internal_product_name: "", supplier_product_name: "",
  level1_category: "", level2_category: "", level3_category: "",
  unit: "", unit_cost: "", supplier: "", status: "Active",
  purchase_unit: "", purchase_unit_cost: "", base_unit_type: "gms", base_unit_qty: "1", cost_per_base_unit: "0",
};

export default function ProductMasterTab() {
  const { products, loading, createProduct, updateProduct, deleteProduct, addSupplier, updateSupplier, deleteSupplier } = useProductMaster();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [subCatFilter, setSubCatFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState("internal_sku");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ product_master_id: "", supplier: "", external_sku: "", supplier_product_name: "", purchase_unit: "", purchase_unit_cost: "" });
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [deleteSupplierOpen, setDeleteSupplierOpen] = useState(false);
  const [deletingSupplierEntryId, setDeletingSupplierEntryId] = useState<string | null>(null);

  const categories = useMemo(() => [...new Set(products.map(p => p.level1_category))].sort(), [products]);
  const subCategories = useMemo(() => {
    const filtered = catFilter !== "all" ? products.filter(p => p.level1_category === catFilter) : products;
    return [...new Set(filtered.map(p => p.level3_category).filter(Boolean))].sort();
  }, [products, catFilter]);
  const suppliers = useMemo(() => {
    const allSuppliers = new Set<string>();
    products.forEach(p => {
      if (p.supplier) allSuppliers.add(p.supplier);
      p.suppliers?.forEach(s => { if (s.supplier) allSuppliers.add(s.supplier); });
    });
    return [...allSuppliers].sort();
  }, [products]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const filtered = useMemo(() => {
    let result = products.filter(p => {
      if (catFilter !== "all" && p.level1_category !== catFilter) return false;
      if (subCatFilter !== "all" && p.level3_category !== subCatFilter) return false;
      if (supplierFilter !== "all") {
        const hasSupplier = p.supplier === supplierFilter || p.suppliers?.some(s => s.supplier === supplierFilter);
        if (!hasSupplier) return false;
      }
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const supplierNames = (p.suppliers || []).map(s => s.supplier.toLowerCase()).join(" ");
        const supplierProducts = (p.suppliers || []).map(s => s.supplier_product_name.toLowerCase()).join(" ");
        return p.internal_sku.toLowerCase().includes(q) ||
          p.external_sku.toLowerCase().includes(q) ||
          p.internal_product_name.toLowerCase().includes(q) ||
          p.supplier_product_name.toLowerCase().includes(q) ||
          p.supplier.toLowerCase().includes(q) ||
          supplierNames.includes(q) ||
          supplierProducts.includes(q);
      }
      return true;
    });
    result.sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      let cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [products, search, catFilter, subCatFilter, supplierFilter, statusFilter, sortKey, sortDir]);

  const hasFilters = catFilter !== "all" || subCatFilter !== "all" || supplierFilter !== "all" || statusFilter !== "all" || search;
  const clearFilters = () => { setCatFilter("all"); setSubCatFilter("all"); setSupplierFilter("all"); setStatusFilter("all"); setSearch(""); };

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (p: ProductMasterItem) => {
    setEditingId(p.id);
    setForm({
      internal_sku: p.internal_sku, external_sku: p.external_sku,
      internal_product_name: p.internal_product_name, supplier_product_name: p.supplier_product_name,
      level1_category: p.level1_category, level2_category: p.level2_category, level3_category: p.level3_category,
      unit: p.unit, unit_cost: String(p.unit_cost), supplier: p.supplier, status: p.status,
      purchase_unit: p.purchase_unit, purchase_unit_cost: String(p.purchase_unit_cost),
      base_unit_type: p.base_unit_type, base_unit_qty: String(p.base_unit_qty),
      cost_per_base_unit: String(p.cost_per_base_unit),
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const purchaseUnitCost = parseFloat(form.purchase_unit_cost) || 0;
    const baseUnitQty = parseFloat(form.base_unit_qty) || 1;
    const costPerBaseUnit = baseUnitQty > 0 ? purchaseUnitCost / baseUnitQty : 0;
    const data = {
      ...form,
      unit_cost: parseFloat(form.unit_cost) || 0,
      purchase_unit_cost: purchaseUnitCost,
      base_unit_qty: baseUnitQty,
      cost_per_base_unit: costPerBaseUnit,
    };
    if (editingId) {
      const ok = await updateProduct(editingId, data);
      if (ok) setDialogOpen(false);
    } else {
      const ok = await createProduct(data as any);
      if (ok) setDialogOpen(false);
    }
  };

  const handleDelete = async () => {
    if (deletingId) { await deleteProduct(deletingId); setDeleteOpen(false); setDeletingId(null); }
  };

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt4 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

  // Live preview of cost per base unit in dialog
  const liveCostPerBase = (() => {
    const puc = parseFloat(form.purchase_unit_cost) || 0;
    const buq = parseFloat(form.base_unit_qty) || 1;
    return buq > 0 ? puc / buq : 0;
  })();

  if (loading) return <div className="py-12 text-center text-muted-foreground">Loading products...</div>;

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openAddSupplier = (productId: string) => {
    setEditingSupplierId(null);
    setSupplierForm({ product_master_id: productId, supplier: "", external_sku: "", supplier_product_name: "", purchase_unit: "", purchase_unit_cost: "" });
    setSupplierDialogOpen(true);
  };

  const openEditSupplier = (s: ProductSupplierEntry) => {
    setEditingSupplierId(s.id);
    setSupplierForm({
      product_master_id: s.product_master_id,
      supplier: s.supplier,
      external_sku: s.external_sku,
      supplier_product_name: s.supplier_product_name,
      purchase_unit: s.purchase_unit,
      purchase_unit_cost: String(s.purchase_unit_cost),
    });
    setSupplierDialogOpen(true);
  };

  const handleSaveSupplier = async () => {
    const data = { ...supplierForm, purchase_unit_cost: parseFloat(supplierForm.purchase_unit_cost) || 0 };
    if (editingSupplierId) {
      const ok = await updateSupplier(editingSupplierId, data);
      if (ok) setSupplierDialogOpen(false);
    } else {
      const ok = await addSupplier(data as any);
      if (ok) setSupplierDialogOpen(false);
    }
  };

  const handleDeleteSupplierEntry = async () => {
    if (deletingSupplierEntryId) {
      await deleteSupplier(deletingSupplierEntryId);
      setDeleteSupplierOpen(false);
      setDeletingSupplierEntryId(null);
    }
  };

  const columns = [
    { key: "_expand", label: "", w: "w-[30px]" },
    { key: "internal_sku", label: "Internal SKU", w: "w-[100px]" },
    { key: "internal_product_name", label: "Internal Product Name", w: "min-w-[200px]" },
    { key: "level1_category", label: "L1 Category", w: "w-[100px] hidden lg:table-cell" },
    { key: "level2_category", label: "L2 Category", w: "w-[100px] hidden lg:table-cell" },
    { key: "level3_category", label: "L3 Category", w: "w-[110px] hidden md:table-cell" },
    { key: "base_unit_type", label: "Base Unit", w: "w-[70px] hidden md:table-cell" },
    { key: "base_unit_qty", label: "Base Qty", w: "w-[70px] hidden md:table-cell" },
    { key: "cost_per_base_unit", label: "Cost/Base", w: "w-[80px]" },
    { key: "_suppliers", label: "Suppliers", w: "w-[80px]" },
    { key: "status", label: "Status", w: "w-[70px]" },
  ];

  const csvColumns = [
    { key: "internal_sku", label: "Internal SKU" },
    { key: "internal_product_name", label: "Internal Product Name" },
    { key: "supplier", label: "Supplier" },
    { key: "external_sku", label: "External SKU" },
    { key: "supplier_product_name", label: "Supplier Product Name" },
    { key: "level1_category", label: "L1 Category" },
    { key: "level2_category", label: "L2 Category" },
    { key: "level3_category", label: "L3 Category" },
    { key: "purchase_unit", label: "Purchase Unit" },
    { key: "purchase_unit_cost", label: "Purchase Unit Cost" },
    { key: "base_unit_type", label: "Base Unit Type" },
    { key: "base_unit_qty", label: "Base Qty" },
    { key: "cost_per_base_unit", label: "Cost/Base" },
    { key: "status", label: "Status" },
  ];

  const csvData = filtered.flatMap(p => {
    const sups = p.suppliers && p.suppliers.length > 0 ? p.suppliers : [{ supplier: p.supplier, external_sku: p.external_sku, supplier_product_name: p.supplier_product_name, purchase_unit: p.purchase_unit, purchase_unit_cost: p.purchase_unit_cost }];
    return sups.map(s => ({
      internal_sku: p.internal_sku, internal_product_name: p.internal_product_name,
      supplier: s.supplier, external_sku: s.external_sku, supplier_product_name: s.supplier_product_name,
      level1_category: p.level1_category, level2_category: p.level2_category, level3_category: p.level3_category,
      purchase_unit: s.purchase_unit, purchase_unit_cost: s.purchase_unit_cost.toFixed(2),
      base_unit_type: p.base_unit_type, base_unit_qty: p.base_unit_qty,
      cost_per_base_unit: p.cost_per_base_unit.toFixed(4), status: p.status,
    }));
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search SKU, product name, supplier..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 text-sm" />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue placeholder="L1 Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All L1</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={subCatFilter} onValueChange={setSubCatFilter}>
          <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue placeholder="L3 Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All L3</SelectItem>
            {subCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-[160px] h-9 text-xs"><SelectValue placeholder="Supplier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            {suppliers.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
        <Button size="sm" variant="outline" onClick={() => downloadCSV(csvData, csvColumns, "product_master")} className="h-9"><Download className="h-4 w-4 mr-1" />Download</Button>
        <Button size="sm" onClick={openCreate} className="ml-auto h-9"><Plus className="h-4 w-4 mr-1" />Add Product</Button>
      </div>

      {/* Count */}
      <p className="text-xs text-muted-foreground">Showing {filtered.length} of {products.length} products</p>

      {/* Table */}
      <div className="card-glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] leading-tight">
            <thead>
              <tr className="bg-primary text-primary-foreground">
                {columns.map(col => (
                  <th key={col.key} className={`text-left px-3 py-2.5 font-semibold ${col.key !== "_expand" && col.key !== "_suppliers" ? "cursor-pointer select-none" : ""} ${col.w}`}
                    onClick={() => col.key !== "_expand" && col.key !== "_suppliers" && toggleSort(col.key)}>
                    <span className="flex items-center gap-1">
                      {col.label}
                      {col.key !== "_expand" && col.key !== "_suppliers" && <SortIcon col={col.key} />}
                    </span>
                  </th>
                ))}
                <th className="px-3 py-2.5 w-[70px]"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={columns.length + 1} className="text-center py-12 text-muted-foreground">No products found</td></tr>
              ) : filtered.map((p, idx) => {
                const isExpanded = expandedIds.has(p.id);
                const supplierCount = p.suppliers?.length || 0;
                return (
                  <React.Fragment key={p.id}>
                    <tr className={`border-b border-border/40 hover:bg-accent/30 transition-colors ${idx % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                      <td className="px-3 py-2">
                        {supplierCount > 0 && (
                          <button onClick={() => toggleExpand(p.id)} className="p-0.5 rounded hover:bg-accent/50 text-muted-foreground">
                            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono font-medium text-primary">{p.internal_sku}</td>
                      <td className="px-3 py-2 font-medium text-foreground">{p.internal_product_name}</td>
                      <td className="px-3 py-2 hidden lg:table-cell">{p.level1_category}</td>
                      <td className="px-3 py-2 hidden lg:table-cell">{p.level2_category}</td>
                      <td className="px-3 py-2 hidden md:table-cell">{p.level3_category}</td>
                      <td className="px-3 py-2 hidden md:table-cell">{p.base_unit_type}</td>
                      <td className="px-3 py-2 text-right tabular-nums hidden md:table-cell">{p.base_unit_qty}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt4(p.cost_per_base_unit)}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                          <Store className="h-2.5 w-2.5" />{supplierCount}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={p.status === "Active" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                          {p.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(p)} className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => { setDeletingId(p.id); setDeleteOpen(true); }} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                    {/* Expanded supplier rows */}
                    {isExpanded && (
                      <>
                        {(p.suppliers || []).map(s => (
                          <tr key={s.id} className="bg-accent/10 border-b border-border/20">
                            <td className="px-3 py-1.5"></td>
                            <td className="px-3 py-1.5 font-mono text-muted-foreground text-[11px]">{s.external_sku}</td>
                            <td className="px-3 py-1.5 text-muted-foreground text-[11px]">{s.supplier_product_name}</td>
                            <td className="px-3 py-1.5 hidden lg:table-cell"></td>
                            <td className="px-3 py-1.5 hidden lg:table-cell"></td>
                            <td className="px-3 py-1.5 hidden md:table-cell"></td>
                            <td className="px-3 py-1.5 hidden md:table-cell text-[11px]">{s.purchase_unit}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums hidden md:table-cell text-[11px]">${fmt(s.purchase_unit_cost)}</td>
                            <td className="px-3 py-1.5"></td>
                            <td className="px-3 py-1.5 text-[11px] text-muted-foreground truncate max-w-[120px]" title={s.supplier}>{s.supplier}</td>
                            <td className="px-3 py-1.5"></td>
                            <td className="px-3 py-1.5">
                              <div className="flex gap-1">
                                <button onClick={() => openEditSupplier(s)} className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground"><Pencil className="h-3 w-3" /></button>
                                <button onClick={() => { setDeletingSupplierEntryId(s.id); setDeleteSupplierOpen(true); }} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-accent/5 border-b border-border/20">
                          <td colSpan={columns.length + 1} className="px-3 py-1">
                            <button onClick={() => openAddSupplier(p.id)} className="text-[11px] text-primary hover:underline flex items-center gap-1">
                              <Plus className="h-3 w-3" /> Add supplier
                            </button>
                          </td>
                        </tr>
                      </>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Product Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Internal SKU *</Label><Input value={form.internal_sku} onChange={e => setForm({ ...form, internal_sku: e.target.value })} className="h-9 text-sm" /></div>
            <div><Label className="text-xs">External SKU</Label><Input value={form.external_sku} onChange={e => setForm({ ...form, external_sku: e.target.value })} className="h-9 text-sm" /></div>
            <div className="col-span-2"><Label className="text-xs">Internal Product Name *</Label><Input value={form.internal_product_name} onChange={e => setForm({ ...form, internal_product_name: e.target.value })} className="h-9 text-sm" /></div>
            <div className="col-span-2"><Label className="text-xs">Supplier Product Name</Label><Input value={form.supplier_product_name} onChange={e => setForm({ ...form, supplier_product_name: e.target.value })} className="h-9 text-sm" /></div>
            <div><Label className="text-xs">L1 Category</Label><Input value={form.level1_category} onChange={e => setForm({ ...form, level1_category: e.target.value })} className="h-9 text-sm" /></div>
            <div><Label className="text-xs">L2 Category</Label><Input value={form.level2_category} onChange={e => setForm({ ...form, level2_category: e.target.value })} className="h-9 text-sm" /></div>
            <div><Label className="text-xs">L3 Category</Label><Input value={form.level3_category} onChange={e => setForm({ ...form, level3_category: e.target.value })} className="h-9 text-sm" /></div>
            <div><Label className="text-xs">Unit</Label><Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="h-9 text-sm" /></div>
            <div><Label className="text-xs">Unit Cost</Label><Input type="number" step="0.01" value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: e.target.value })} className="h-9 text-sm" /></div>
            <div><Label className="text-xs">Supplier</Label><Input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} className="h-9 text-sm" /></div>

            {/* Base unit costing fields */}
            <div className="col-span-2 border-t pt-3 mt-1">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Base Unit Costing (for recipe use)</p>
            </div>
            <div><Label className="text-xs">Purchase Unit</Label><Input value={form.purchase_unit} onChange={e => setForm({ ...form, purchase_unit: e.target.value })} placeholder="e.g. case, bottle, pack" className="h-9 text-sm" /></div>
            <div><Label className="text-xs">Purchase Unit Cost</Label><Input type="number" step="0.01" value={form.purchase_unit_cost} onChange={e => setForm({ ...form, purchase_unit_cost: e.target.value })} className="h-9 text-sm" /></div>
            <div>
              <Label className="text-xs">Base Unit Type</Label>
              <Select value={form.base_unit_type} onValueChange={v => setForm({ ...form, base_unit_type: v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gms">gms</SelectItem>
                  <SelectItem value="mls">mls</SelectItem>
                  <SelectItem value="ea/pcs">ea/pcs</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Base Unit Quantity</Label><Input type="number" step="0.01" value={form.base_unit_qty} onChange={e => setForm({ ...form, base_unit_qty: e.target.value })} placeholder="e.g. 1000 for 1kg" className="h-9 text-sm" /></div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">
                Cost per Base Unit: <span className="font-mono font-semibold">${fmt4(liveCostPerBase)}</span>
                <span className="ml-2 text-muted-foreground/70">(Purchase Unit Cost ÷ Base Unit Qty)</span>
              </p>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.internal_sku.trim() || !form.internal_product_name.trim()}>
              {editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Supplier Dialog */}
      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSupplierId ? "Edit Supplier Entry" : "Add Supplier"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label className="text-xs">Supplier Name *</Label><Input value={supplierForm.supplier} onChange={e => setSupplierForm({ ...supplierForm, supplier: e.target.value })} className="h-9 text-sm" /></div>
            <div><Label className="text-xs">External SKU</Label><Input value={supplierForm.external_sku} onChange={e => setSupplierForm({ ...supplierForm, external_sku: e.target.value })} className="h-9 text-sm" /></div>
            <div><Label className="text-xs">Purchase Unit Cost</Label><Input type="number" step="0.01" value={supplierForm.purchase_unit_cost} onChange={e => setSupplierForm({ ...supplierForm, purchase_unit_cost: e.target.value })} className="h-9 text-sm" /></div>
            <div className="col-span-2"><Label className="text-xs">Supplier Product Name</Label><Input value={supplierForm.supplier_product_name} onChange={e => setSupplierForm({ ...supplierForm, supplier_product_name: e.target.value })} className="h-9 text-sm" /></div>
            <div><Label className="text-xs">Purchase Unit</Label><Input value={supplierForm.purchase_unit} onChange={e => setSupplierForm({ ...supplierForm, purchase_unit: e.target.value })} className="h-9 text-sm" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupplierDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveSupplier} disabled={!supplierForm.supplier.trim()}>
              {editingSupplierId ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} onConfirm={handleDelete} title="Delete Product" description="This will permanently remove this product and all its supplier entries from the master list." />
      <DeleteConfirmDialog open={deleteSupplierOpen} onOpenChange={setDeleteSupplierOpen} onConfirm={handleDeleteSupplierEntry} title="Delete Supplier Entry" description="This will remove this supplier's pricing for this product." />
    </div>
  );
}
