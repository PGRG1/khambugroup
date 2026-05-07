import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Package } from "lucide-react";
import { DataTableShell, usePagination, type FilterField } from "@/components/common/data-table";
import { StandardProduct, PackConversion } from "@/hooks/useStandardProducts";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";

interface Props {
  products: StandardProduct[];
  conversions: PackConversion[];
  onCreateProduct: (p: Omit<StandardProduct, "id" | "created_at" | "updated_at">) => Promise<any>;
  onUpdateProduct: (id: string, updates: Partial<Omit<StandardProduct, "id" | "created_at" | "updated_at">>) => Promise<boolean>;
  onDeleteProduct: (id: string) => Promise<boolean>;
  onCreateConversion: (c: Omit<PackConversion, "id" | "created_at">) => Promise<boolean>;
  onDeleteConversion: (id: string) => Promise<boolean>;
  onOpenDetail: (product: StandardProduct) => void;
}

const CATEGORIES = ["Food", "Drinks", "Other"];
const BASE_UNITS = ["each", "bottle", "ml", "g", "kg", "case", "box", "can", "pack"];

export default function StandardProductsTab({
  products, conversions,
  onCreateProduct, onUpdateProduct, onDeleteProduct,
  onCreateConversion, onDeleteConversion,
  onOpenDetail,
}: Props) {
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<StandardProduct | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", category: "Other", sub_category: "", base_unit: "each", reorder_level: "", is_active: true });
  // Conversion form within modal
  const [convForm, setConvForm] = useState({ from_unit: "", to_unit: "", conversion_factor: "" });

  const productConversions = useMemo(() => {
    if (!editingProduct) return [];
    return conversions.filter((c) => c.standard_product_id === editingProduct.id);
  }, [editingProduct, conversions]);

  const handleSortChange = (key: string, dir: "asc" | "desc") => { setSortKey(key); setSortDir(dir); };

  const filtered = useMemo(() => {
    let result = products;
    if (catFilter !== "all") result = result.filter((p) => p.category === catFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q) || (p.sub_category || "").toLowerCase().includes(q));
    }
    return [...result].sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      let cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [products, catFilter, search, sortKey, sortDir]);

  const openCreate = () => {
    setEditingProduct(null);
    setForm({ name: "", category: "Other", sub_category: "", base_unit: "each", reorder_level: "", is_active: true });
    setConvForm({ from_unit: "", to_unit: "", conversion_factor: "" });
    setModalOpen(true);
  };

  const openEdit = (p: StandardProduct) => {
    setEditingProduct(p);
    setForm({
      name: p.name,
      category: p.category,
      sub_category: p.sub_category || "",
      base_unit: p.base_unit,
      reorder_level: p.reorder_level ? String(p.reorder_level) : "",
      is_active: p.is_active,
    });
    setConvForm({ from_unit: "", to_unit: "", conversion_factor: "" });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    const data = {
      name: form.name.trim(),
      category: form.category,
      sub_category: form.sub_category.trim() || null,
      base_unit: form.base_unit,
      reorder_level: form.reorder_level ? parseFloat(form.reorder_level) : null,
      is_active: form.is_active,
    };
    if (editingProduct) {
      await onUpdateProduct(editingProduct.id, data);
    } else {
      await onCreateProduct(data);
    }
    setModalOpen(false);
  };

  const handleAddConversion = async () => {
    if (!editingProduct || !convForm.from_unit || !convForm.to_unit || !convForm.conversion_factor) return;
    await onCreateConversion({
      standard_product_id: editingProduct.id,
      from_unit: convForm.from_unit,
      to_unit: convForm.to_unit,
      conversion_factor: parseFloat(convForm.conversion_factor) || 1,
    });
    setConvForm({ from_unit: "", to_unit: "", conversion_factor: "" });
  };

  const handleDelete = async () => {
    if (deletingId) await onDeleteProduct(deletingId);
    setDeleteOpen(false);
    setDeletingId(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />New Product</Button>
      </div>

      <div className="text-xs text-muted-foreground">
        {filtered.length} product{filtered.length !== 1 ? "s" : ""}
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><button onClick={() => toggleSort("name")} className="flex items-center gap-1 hover:text-foreground">Name <SortIcon col="name" /></button></TableHead>
              <TableHead><button onClick={() => toggleSort("category")} className="flex items-center gap-1 hover:text-foreground">Category <SortIcon col="category" /></button></TableHead>
              <TableHead>Sub-category</TableHead>
              <TableHead><button onClick={() => toggleSort("base_unit")} className="flex items-center gap-1 hover:text-foreground">Base Unit <SortIcon col="base_unit" /></button></TableHead>
              <TableHead>Reorder</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No products found</TableCell></TableRow>
            ) : filtered.map((p) => (
              <TableRow key={p.id} className="cursor-pointer" onClick={() => onOpenDetail(p)}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell><Badge variant="outline">{p.category}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{p.sub_category || "—"}</TableCell>
                <TableCell>{p.base_unit}</TableCell>
                <TableCell className="font-mono">{p.reorder_level ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={p.is_active ? "default" : "secondary"}>{p.is_active ? "Active" : "Inactive"}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(p); }}>
                      <Package className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); setDeletingId(p.id); setDeleteOpen(true); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProduct ? "Edit Product" : "New Standard Product"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Product Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., Macallan 12" />
              </div>
              <div>
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sub-category</Label>
                <Input value={form.sub_category} onChange={(e) => setForm({ ...form, sub_category: e.target.value })} placeholder="e.g., Whisky" />
              </div>
              <div>
                <Label>Base Unit *</Label>
                <Select value={form.base_unit} onValueChange={(v) => setForm({ ...form, base_unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BASE_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reorder Level</Label>
                <Input type="number" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} placeholder="Optional" />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>Active</Label>
              </div>
            </div>

            {/* Pack Conversions (only in edit mode) */}
            {editingProduct && (
              <div className="border-t pt-3 space-y-2">
                <h4 className="text-sm font-semibold">Pack / Conversion Rules</h4>
                {productConversions.length > 0 && (
                  <div className="space-y-1">
                    {productConversions.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1">
                        <span>1 {c.from_unit} = {c.conversion_factor} {c.to_unit}</span>
                        <Button size="icon" variant="ghost" className="h-6 w-6 ml-auto text-destructive" onClick={() => onDeleteConversion(c.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-xs">From</Label>
                    <Input value={convForm.from_unit} onChange={(e) => setConvForm({ ...convForm, from_unit: e.target.value })} placeholder="case" className="h-8 text-sm" />
                  </div>
                  <span className="text-sm pb-1">=</span>
                  <div className="w-16">
                    <Label className="text-xs">Qty</Label>
                    <Input type="number" value={convForm.conversion_factor} onChange={(e) => setConvForm({ ...convForm, conversion_factor: e.target.value })} placeholder="12" className="h-8 text-sm" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs">To</Label>
                    <Input value={convForm.to_unit} onChange={(e) => setConvForm({ ...convForm, to_unit: e.target.value })} placeholder="bottle" className="h-8 text-sm" />
                  </div>
                  <Button size="sm" variant="outline" className="h-8" onClick={handleAddConversion}>Add</Button>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingProduct ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} onConfirm={handleDelete} title="Delete Product" description="This will remove the standard product and all its conversion rules and supplier mappings." />
    </div>
  );
}
