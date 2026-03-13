import React, { useState, useMemo } from "react";
import { useProductMaster, ProductMasterItem } from "@/hooks/useProductMaster";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Plus, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, X } from "lucide-react";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";

const EMPTY_FORM = {
  internal_sku: "", external_sku: "", internal_product_name: "", supplier_product_name: "",
  level1_category: "", level2_category: "", level3_category: "",
  unit: "", unit_cost: "", supplier: "", status: "Active",
};

export default function ProductMasterTab() {
  const { products, loading, createProduct, updateProduct, deleteProduct } = useProductMaster();
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

  const categories = useMemo(() => [...new Set(products.map(p => p.level1_category))].sort(), [products]);
  const subCategories = useMemo(() => {
    const filtered = catFilter !== "all" ? products.filter(p => p.level1_category === catFilter) : products;
    return [...new Set(filtered.map(p => p.level3_category).filter(Boolean))].sort();
  }, [products, catFilter]);
  const suppliers = useMemo(() => [...new Set(products.map(p => p.supplier).filter(Boolean))].sort(), [products]);

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
      if (supplierFilter !== "all" && p.supplier !== supplierFilter) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.internal_sku.toLowerCase().includes(q) ||
          p.external_sku.toLowerCase().includes(q) ||
          p.internal_product_name.toLowerCase().includes(q) ||
          p.supplier_product_name.toLowerCase().includes(q) ||
          p.supplier.toLowerCase().includes(q);
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
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const data = { ...form, unit_cost: parseFloat(form.unit_cost) || 0 };
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

  if (loading) return <div className="py-12 text-center text-muted-foreground">Loading products...</div>;

  const columns = [
    { key: "internal_sku", label: "Internal SKU", w: "w-[100px]" },
    { key: "external_sku", label: "External SKU", w: "w-[100px]" },
    { key: "internal_product_name", label: "Internal Product Name", w: "min-w-[200px]" },
    { key: "supplier_product_name", label: "Supplier Product Name", w: "min-w-[200px] hidden xl:table-cell" },
    { key: "level1_category", label: "L1 Category", w: "w-[100px] hidden lg:table-cell" },
    { key: "level2_category", label: "L2 Category", w: "w-[100px] hidden lg:table-cell" },
    { key: "level3_category", label: "L3 Category", w: "w-[110px] hidden md:table-cell" },
    { key: "unit", label: "Unit", w: "w-[60px]" },
    { key: "unit_cost", label: "Unit Cost", w: "w-[90px]" },
    { key: "supplier", label: "Supplier", w: "w-[140px] hidden md:table-cell" },
    { key: "status", label: "Status", w: "w-[80px]" },
  ];

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
                  <th key={col.key} className={`text-left px-3 py-2.5 font-semibold cursor-pointer select-none ${col.w}`} onClick={() => toggleSort(col.key)}>
                    <span className="flex items-center gap-1">{col.label}<SortIcon col={col.key} /></span>
                  </th>
                ))}
                <th className="px-3 py-2.5 w-[70px]"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={columns.length + 1} className="text-center py-12 text-muted-foreground">No products found</td></tr>
              ) : filtered.map((p, idx) => (
                <tr key={p.id} className={`border-b border-border/40 hover:bg-accent/30 transition-colors ${idx % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                  <td className="px-3 py-2 font-mono font-medium text-primary">{p.internal_sku}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{p.external_sku}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{p.internal_product_name}</td>
                  <td className="px-3 py-2 text-muted-foreground hidden xl:table-cell">{p.supplier_product_name}</td>
                  <td className="px-3 py-2 hidden lg:table-cell">{p.level1_category}</td>
                  <td className="px-3 py-2 hidden lg:table-cell">{p.level2_category}</td>
                  <td className="px-3 py-2 hidden md:table-cell">{p.level3_category}</td>
                  <td className="px-3 py-2 text-center">{p.unit}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(p.unit_cost)}</td>
                  <td className="px-3 py-2 hidden md:table-cell">{p.supplier}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Dialog */}
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

      <DeleteConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} onConfirm={handleDelete} title="Delete Product" description="This will permanently remove this product from the master list." />
    </div>
  );
}
