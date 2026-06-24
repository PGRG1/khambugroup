import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";
import { downloadCSV } from "@/utils/csvDownload";
import { Plus, Download, Pencil, Trash2 } from "lucide-react";
import { DataTableShell, usePagination } from "@/components/common/data-table";
import { ROUNDING_MODE_LABELS, type RoundingMode } from "@/utils/invoiceRounding";
import SupplierSheet from "./SupplierSheet";

interface Supplier {
  id: string;
  code: string | null;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  payment_terms: string | null;
  invoice_rounding_mode: RoundingMode | null;
  is_active: boolean;
  created_at: string;
  categories: string[];
  delivery_days: string[];
  moq: number;
  account_number: string;
}

const PAYMENT_TERMS = ["COD", "Net 7", "Net 14", "Net 30", "Net 60"];
const ROUNDING_MODES: RoundingMode[] = ["sum_then_round", "round_then_sum", "integer"];
const CATEGORY_OPTIONS = ["Food", "Beverages", "Packaging", "Supplies", "Tobacco", "Other"];
const DAY_OPTIONS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const emptyForm = {
  code: "",
  name: "",
  contact_person: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
  payment_terms: "COD",
  invoice_rounding_mode: "sum_then_round" as RoundingMode,
  is_active: true,
  categories: [] as string[],
  delivery_days: [] as string[],
  moq: 0,
  account_number: "",
};

function generateCodeSuggestion(name: string, existingCodes: string[]): string {
  const base = name
    .replace(/[^a-zA-Z\s]/g, "")
    .trim()
    .split(/\s+/)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase()
    .slice(0, 4);
  if (!base) return "";
  const existing = existingCodes
    .filter((c) => c.startsWith(base + "-"))
    .map((c) => parseInt(c.split("-")[1] || "0", 10))
    .filter((n) => !isNaN(n));
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${base}-${String(next).padStart(3, "0")}`;
}

export default function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const fetchSuppliers = async () => {
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .order("name");
    if (error) {
      toast.error("Failed to load suppliers & vendors");
    } else {
      setSuppliers((data || []) as unknown as Supplier[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchSuppliers(); }, []);

  const filtered = suppliers.filter((s) => {
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.contact_person || "").toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q) ||
      (s.phone || "").toLowerCase().includes(q)
    );
  });

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      contact_person: s.contact_person || "",
      email: s.email || "",
      phone: s.phone || "",
      address: s.address || "",
      notes: s.notes || "",
      payment_terms: s.payment_terms || "COD",
      invoice_rounding_mode: (s.invoice_rounding_mode || "sum_then_round") as RoundingMode,
      is_active: s.is_active,
      categories: s.categories || [],
      delivery_days: s.delivery_days || [],
      moq: s.moq || 0,
      account_number: s.account_number || "",
    });
    setDialogOpen(true);
  };

  const openSheet = (s: Supplier) => {
    setSelectedSupplier(s);
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Supplier & vendor name is required");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      contact_person: form.contact_person || null,
      email: form.email || null,
      phone: form.phone || null,
      address: form.address || null,
      notes: form.notes || null,
      payment_terms: form.payment_terms,
      invoice_rounding_mode: form.invoice_rounding_mode,
      is_active: form.is_active,
      categories: form.categories,
      delivery_days: form.delivery_days,
      moq: form.moq || 0,
      account_number: form.account_number || "",
    };

    if (editingId) {
      const { error } = await supabase.from("suppliers").update(payload).eq("id", editingId);
      if (error) toast.error("Failed to update supplier & vendor");
      else toast.success("Supplier & vendor updated");
    } else {
      const { error } = await supabase.from("suppliers").insert(payload);
      if (error) toast.error("Failed to add supplier & vendor");
      else toast.success("Supplier & vendor added");
    }
    setSaving(false);
    setDialogOpen(false);
    fetchSuppliers();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("suppliers").delete().eq("id", deleteId);
    if (error) toast.error("Failed to delete supplier & vendor");
    else toast.success("Supplier & vendor deleted");
    setDeleteId(null);
    fetchSuppliers();
  };

  const handleExport = () => {
    downloadCSV(
      filtered,
      [
        { key: "name", label: "Name" },
        { key: "contact_person", label: "Contact Person" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "payment_terms", label: "Payment Terms" },
        { key: "address", label: "Address" },
        { key: "is_active", label: "Active" },
        { key: "notes", label: "Notes" },
        { key: "categories", label: "Categories" },
        { key: "delivery_days", label: "Delivery Days" },
        { key: "moq", label: "MOQ ($)" },
        { key: "account_number", label: "Account Number" },
      ],
      "suppliers"
    );
  };

  const pag = usePagination(filtered);

  return (
    <div className="space-y-4">
      <DataTableShell
        search={{ value: search, onChange: setSearch, placeholder: "Search suppliers & vendors…" }}
        toolbarRight={
          <>
            <Button variant="outline" size="sm" onClick={handleExport} className="h-9">
              <Download className="h-4 w-4 mr-1" />CSV
            </Button>
            <Button size="sm" onClick={openAdd} className="h-9">
              <Plus className="h-4 w-4 mr-1" />Add Supplier & Vendor
            </Button>
          </>
        }
        resultCount={`${filtered.length} supplier & vendor${filtered.length !== 1 ? "s" : ""}`}
        pagination={{
          page: pag.page, pageSize: pag.pageSize, totalPages: pag.totalPages,
          rangeStart: pag.rangeStart, rangeEnd: pag.rangeEnd, total: pag.total,
          onPageChange: pag.setPage, onPageSizeChange: pag.setPageSize,
        }}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Categories</TableHead>
              <TableHead>Delivery days</TableHead>
              <TableHead>Payment Terms</TableHead>
              <TableHead className="text-right">MOQ</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : pag.pageItems.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No suppliers & vendors found</TableCell></TableRow>
            ) : (
              pag.pageItems.map((s) => (
                <TableRow key={s.id}>
                  <TableCell
                    className="font-medium cursor-pointer text-primary hover:underline"
                    onClick={() => openSheet(s)}
                  >
                    {s.name}
                  </TableCell>
                  <TableCell>
                    {s.categories?.length ? (
                      <div className="flex flex-wrap gap-1">
                        {s.categories.map((c) => (
                          <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {s.delivery_days?.length
                      ? DAY_OPTIONS.filter((d) => s.delivery_days.includes(d)).join(" ")
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>{s.payment_terms || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.moq > 0 ? `$${Number(s.moq).toLocaleString()}` : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.is_active ? "default" : "secondary"}>
                      {s.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(s.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DataTableShell>

      {selectedSupplier && (
        <SupplierSheet
          supplier={selectedSupplier}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          onEdit={(s) => {
            setSheetOpen(false);
            openEdit(s as Supplier);
          }}
          onRefresh={fetchSuppliers}
        />
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Supplier & Vendor" : "Add Supplier & Vendor"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Contact Person</Label>
                <Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Payment Terms</Label>
                <Select value={form.payment_terms} onValueChange={(v) => setForm({ ...form, payment_terms: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                <Label>Active</Label>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Invoice rounding rule</Label>
              <Select
                value={form.invoice_rounding_mode}
                onValueChange={(v) => setForm({ ...form, invoice_rounding_mode: v as RoundingMode })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROUNDING_MODES.map((m) => (
                    <SelectItem key={m} value={m}>{ROUNDING_MODE_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Controls how line item totals are rounded and how the invoice total is summed.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>

            {/* Categories */}
            <div className="space-y-2">
              <Label>Supplier categories</Label>
              <p className="text-xs text-muted-foreground">Select all that apply</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_OPTIONS.map((cat) => (
                  <label
                    key={cat}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm cursor-pointer transition-colors ${
                      form.categories.includes(cat)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={form.categories.includes(cat)}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          categories: e.target.checked
                            ? [...f.categories, cat]
                            : f.categories.filter((c) => c !== cat),
                        }))
                      }
                    />
                    {cat}
                  </label>
                ))}
              </div>
            </div>

            {/* Delivery days */}
            <div className="space-y-2">
              <Label>Delivery days</Label>
              <p className="text-xs text-muted-foreground">Which days does this supplier deliver?</p>
              <div className="flex gap-2">
                {DAY_OPTIONS.map((day) => (
                  <label
                    key={day}
                    className={`flex items-center justify-center w-10 h-10 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                      form.delivery_days.includes(day)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={form.delivery_days.includes(day)}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          delivery_days: e.target.checked
                            ? [...f.delivery_days, day]
                            : f.delivery_days.filter((d) => d !== day),
                        }))
                      }
                    />
                    {day}
                  </label>
                ))}
              </div>
            </div>

            {/* MOQ + Account number */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Minimum order value ($)</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={form.moq || ""}
                  onChange={(e) => setForm((f) => ({ ...f, moq: Number(e.target.value) || 0 }))}
                />
                <p className="text-xs text-muted-foreground">Leave 0 if no minimum</p>
              </div>
              <div className="space-y-1.5">
                <Label>Account number</Label>
                <Input
                  placeholder="Your account ref with supplier"
                  value={form.account_number}
                  onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        onConfirm={handleDelete}
        title="Delete Supplier & Vendor"
        description="Are you sure? This supplier & vendor will be permanently removed."
      />
    </div>
  );
}
