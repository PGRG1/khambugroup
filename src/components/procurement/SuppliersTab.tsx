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

interface Supplier {
  id: string;
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
}

const PAYMENT_TERMS = ["COD", "Net 7", "Net 14", "Net 30", "Net 60"];
const ROUNDING_MODES: RoundingMode[] = ["sum_then_round", "round_then_sum", "integer"];

const emptyForm = {
  name: "",
  contact_person: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
  payment_terms: "COD",
  invoice_rounding_mode: "sum_then_round" as RoundingMode,
  is_active: true,
};

export default function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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
    });
    setDialogOpen(true);
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
              <TableHead>Contact Person</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Payment Terms</TableHead>
              <TableHead>Invoice Rounding</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : pag.pageItems.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No suppliers & vendors found</TableCell></TableRow>
            ) : (
              pag.pageItems.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.contact_person || "—"}</TableCell>
                  <TableCell>{s.email || "—"}</TableCell>
                  <TableCell>{s.phone || "—"}</TableCell>
                  <TableCell>{s.payment_terms || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {ROUNDING_MODE_LABELS[(s.invoice_rounding_mode || "sum_then_round") as RoundingMode]}
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


      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
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
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
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
