import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { SupplierItemMapping, StandardProduct } from "@/hooks/useStandardProducts";
import { Supplier } from "@/hooks/useInvoiceData";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";

interface Props {
  mappings: SupplierItemMapping[];
  products: StandardProduct[];
  suppliers: Supplier[];
  onCreateMapping: (m: Omit<SupplierItemMapping, "id" | "created_at" | "updated_at" | "supplier_name" | "standard_product_name">) => Promise<any>;
  onUpdateMapping: (id: string, updates: Partial<Omit<SupplierItemMapping, "id" | "created_at" | "updated_at" | "supplier_name" | "standard_product_name">>) => Promise<boolean>;
  onDeleteMapping: (id: string) => Promise<boolean>;
}

const PURCHASE_UNITS = ["each", "bottle", "case", "box", "kg", "g", "can", "pack", "bag", "litre"];

export default function SupplierItemMappingsTab({ mappings, products, suppliers, onCreateMapping, onUpdateMapping, onDeleteMapping }: Props) {
  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [sortKey, setSortKey] = useState("supplier_item_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierItemMapping | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    supplier_id: "", supplier_item_name: "", supplier_sku: "",
    standard_product_id: "", purchase_unit: "each",
    quantity_per_unit: "1", default_unit_price: "",
  });

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const filtered = useMemo(() => {
    let result = mappings;
    if (supplierFilter !== "all") result = result.filter((m) => m.supplier_id === supplierFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((m) =>
        m.supplier_item_name.toLowerCase().includes(q) ||
        (m.supplier_sku || "").toLowerCase().includes(q) ||
        (m.standard_product_name || "").toLowerCase().includes(q)
      );
    }
    return [...result].sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      let cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [mappings, supplierFilter, search, sortKey, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ supplier_id: "", supplier_item_name: "", supplier_sku: "", standard_product_id: "", purchase_unit: "each", quantity_per_unit: "1", default_unit_price: "" });
    setModalOpen(true);
  };

  const openEdit = (m: SupplierItemMapping) => {
    setEditing(m);
    setForm({
      supplier_id: m.supplier_id,
      supplier_item_name: m.supplier_item_name,
      supplier_sku: m.supplier_sku || "",
      standard_product_id: m.standard_product_id,
      purchase_unit: m.purchase_unit,
      quantity_per_unit: String(m.quantity_per_unit),
      default_unit_price: m.default_unit_price ? String(m.default_unit_price) : "",
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.supplier_id || !form.supplier_item_name.trim() || !form.standard_product_id) return;
    const data = {
      supplier_id: form.supplier_id,
      supplier_item_name: form.supplier_item_name.trim(),
      supplier_sku: form.supplier_sku.trim() || null,
      standard_product_id: form.standard_product_id,
      purchase_unit: form.purchase_unit,
      quantity_per_unit: parseFloat(form.quantity_per_unit) || 1,
      default_unit_price: form.default_unit_price ? parseFloat(form.default_unit_price) : null,
    };
    if (editing) {
      await onUpdateMapping(editing.id, data);
    } else {
      await onCreateMapping(data);
    }
    setModalOpen(false);
  };

  const handleDelete = async () => {
    if (deletingId) await onDeleteMapping(deletingId);
    setDeleteOpen(false);
    setDeletingId(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search mappings..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Suppliers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            {suppliers.filter((s) => s.is_active).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />New Mapping</Button>
      </div>

      <div className="text-xs text-muted-foreground">{filtered.length} mapping{filtered.length !== 1 ? "s" : ""}</div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><button onClick={() => toggleSort("supplier_name")} className="flex items-center gap-1 hover:text-foreground">Supplier <SortIcon col="supplier_name" /></button></TableHead>
              <TableHead><button onClick={() => toggleSort("supplier_item_name")} className="flex items-center gap-1 hover:text-foreground">Supplier Item <SortIcon col="supplier_item_name" /></button></TableHead>
              <TableHead>SKU</TableHead>
              <TableHead><button onClick={() => toggleSort("standard_product_name")} className="flex items-center gap-1 hover:text-foreground">Standard Product <SortIcon col="standard_product_name" /></button></TableHead>
              <TableHead>Purchase Unit</TableHead>
              <TableHead>Qty/Unit</TableHead>
              <TableHead className="text-right">Default Price</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No mappings found</TableCell></TableRow>
            ) : filtered.map((m) => (
              <TableRow key={m.id} className="cursor-pointer" onClick={() => openEdit(m)}>
                <TableCell>{m.supplier_name}</TableCell>
                <TableCell className="font-medium">{m.supplier_item_name}</TableCell>
                <TableCell className="text-muted-foreground">{m.supplier_sku || "—"}</TableCell>
                <TableCell>{m.standard_product_name}</TableCell>
                <TableCell>{m.purchase_unit}</TableCell>
                <TableCell className="font-mono">{m.quantity_per_unit}</TableCell>
                <TableCell className="text-right font-mono">{m.default_unit_price ? `$${m.default_unit_price.toFixed(2)}` : "—"}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEdit(m); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); setDeletingId(m.id); setDeleteOpen(true); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Mapping" : "New Supplier Item Mapping"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Supplier *</Label>
              <Select value={form.supplier_id} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.filter((s) => s.is_active).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Supplier Item Name *</Label>
                <Input value={form.supplier_item_name} onChange={(e) => setForm({ ...form, supplier_item_name: e.target.value })} placeholder="As on invoice" />
              </div>
              <div>
                <Label>SKU</Label>
                <Input value={form.supplier_sku} onChange={(e) => setForm({ ...form, supplier_sku: e.target.value })} placeholder="Optional" />
              </div>
            </div>
            <div>
              <Label>Standard Product *</Label>
              <Select value={form.standard_product_id} onValueChange={(v) => setForm({ ...form, standard_product_id: v })}>
                <SelectTrigger><SelectValue placeholder="Link to product" /></SelectTrigger>
                <SelectContent>
                  {products.filter((p) => p.is_active).map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.category})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Purchase Unit</Label>
                <Select value={form.purchase_unit} onValueChange={(v) => setForm({ ...form, purchase_unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PURCHASE_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Qty per Unit</Label>
                <Input type="number" value={form.quantity_per_unit} onChange={(e) => setForm({ ...form, quantity_per_unit: e.target.value })} />
              </div>
              <div>
                <Label>Default Price</Label>
                <Input type="number" step="0.01" value={form.default_unit_price} onChange={(e) => setForm({ ...form, default_unit_price: e.target.value })} placeholder="Optional" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editing ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} onConfirm={handleDelete} title="Delete Mapping" description="Remove this supplier item mapping?" />
    </div>
  );
}
