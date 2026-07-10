import React, { useState, useEffect, useMemo } from "react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import DeleteConfirmDialog from "@/components/dashboard/DeleteConfirmDialog";
import { downloadCSV } from "@/utils/csvDownload";
import { Plus, Download, Pencil, Trash2, MoreVertical, Mail, Phone } from "lucide-react";
import { DataTableShell, usePagination } from "@/components/common/data-table";
import { ROUNDING_MODE_LABELS, type RoundingMode } from "@/utils/invoiceRounding";
import { useIsMobile } from "@/hooks/use-mobile";
import { tonePill } from "@/components/kpi/toneStyles";
import { cn } from "@/lib/utils";
import SupplierSheet from "./SupplierSheet";
import { useActiveTenant } from "@/hooks/useActiveTenant";

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
  code: "", name: "", contact_person: "", email: "", phone: "", address: "", notes: "",
  payment_terms: "COD",
  invoice_rounding_mode: "sum_then_round" as RoundingMode,
  is_active: true,
  categories: [] as string[],
  delivery_days: [] as string[],
  moq: 0,
  account_number: "",
};

function generateCodeSuggestion(name: string, existingCodes: string[]): string {
  const base = name.replace(/[^a-zA-Z\s]/g, "").trim().split(/\s+/).map(w => w[0] || "").join("").toUpperCase().slice(0, 4);
  if (!base) return "";
  const existing = existingCodes.filter(c => c.startsWith(base + "-"))
    .map(c => parseInt(c.split("-")[1] || "0", 10)).filter(n => !isNaN(n));
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return `${base}-${String(next).padStart(3, "0")}`;
}

type StatChip = "all" | "active" | "inactive" | "missing_contact";

export default function SuppliersTab() {
  const { tenantId } = useActiveTenant();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [chip, setChip] = useState<StatChip>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [termsFilter, setTermsFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const isMobile = useIsMobile();

  const fetchSuppliers = async () => {
    if (!tenantId) return;
    const { data, error } = await supabase.from("suppliers").select("*").eq("tenant_id", tenantId).order("name");
    if (error) toast.error("Failed to load suppliers & vendors");
    else setSuppliers((data || []) as unknown as Supplier[]);
    setLoading(false);
  };

  useEffect(() => { fetchSuppliers(); }, [tenantId]);

  useEffect(() => {
    if (!editingId && form.name && !form.code) {
      const existingCodes = suppliers.map(s => s.code || "").filter(Boolean);
      const suggested = generateCodeSuggestion(form.name, existingCodes);
      if (suggested) setForm(f => (f.code ? f : { ...f, code: suggested }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.name]);

  const missingContact = (s: Supplier) => !(s.email || "").trim() && !(s.phone || "").trim();

  const stats = useMemo(() => ({
    total: suppliers.length,
    active: suppliers.filter(s => s.is_active).length,
    inactive: suppliers.filter(s => !s.is_active).length,
    missing_contact: suppliers.filter(missingContact).length,
  }), [suppliers]);

  const filtered = useMemo(() => suppliers.filter(s => {
    if (chip === "active" && !s.is_active) return false;
    if (chip === "inactive" && s.is_active) return false;
    if (chip === "missing_contact" && !missingContact(s)) return false;
    if (categoryFilter !== "all" && !(s.categories || []).includes(categoryFilter)) return false;
    if (termsFilter !== "all" && (s.payment_terms || "") !== termsFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(
        s.name.toLowerCase().includes(q) ||
        (s.contact_person || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q) ||
        (s.phone || "").toLowerCase().includes(q) ||
        (s.code || "").toLowerCase().includes(q)
      )) return false;
    }
    return true;
  }), [suppliers, chip, categoryFilter, termsFilter, search]);

  const openAdd = () => { setEditingId(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (s: Supplier) => {
    setEditingId(s.id);
    setForm({
      code: s.code || "", name: s.name,
      contact_person: s.contact_person || "", email: s.email || "", phone: s.phone || "",
      address: s.address || "", notes: s.notes || "",
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
  const openSheet = (s: Supplier) => { setSelectedSupplier(s); setSheetOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Supplier & vendor name is required"); return; }
    const trimmedCode = form.code.trim();
    if (trimmedCode) {
      const dup = suppliers.find(s => (s.code || "") === trimmedCode && s.id !== editingId);
      if (dup) { toast.error(`Code "${trimmedCode}" is already used by ${dup.name}`); return; }
    }
    setSaving(true);
    const payload = {
      code: trimmedCode || null, name: form.name.trim(),
      contact_person: form.contact_person || null, email: form.email || null, phone: form.phone || null,
      address: form.address || null, notes: form.notes || null,
      payment_terms: form.payment_terms, invoice_rounding_mode: form.invoice_rounding_mode,
      is_active: form.is_active, categories: form.categories, delivery_days: form.delivery_days,
      moq: form.moq || 0, account_number: form.account_number || "",
    };
    if (editingId) {
      const { error } = await supabase.from("suppliers").update(payload).eq("id", editingId).eq("tenant_id", tenantId!);
      if (error) toast.error("Failed to update supplier & vendor"); else toast.success("Supplier & vendor updated");
    } else {
      const { error } = await supabase.from("suppliers").insert({ ...payload, tenant_id: tenantId } as any);
      if (error) toast.error("Failed to add supplier & vendor"); else toast.success("Supplier & vendor added");
    }
    setSaving(false); setDialogOpen(false); fetchSuppliers();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("suppliers").delete().eq("id", deleteId).eq("tenant_id", tenantId!);
    if (error) toast.error("Failed to delete supplier & vendor"); else toast.success("Supplier & vendor deleted");
    setDeleteId(null); fetchSuppliers();
  };

  const handleExport = () => downloadCSV(filtered, [
    { key: "code", label: "Code" }, { key: "name", label: "Name" },
    { key: "contact_person", label: "Contact Person" },
    { key: "email", label: "Email" }, { key: "phone", label: "Phone" },
    { key: "payment_terms", label: "Payment Terms" }, { key: "address", label: "Address" },
    { key: "is_active", label: "Active" }, { key: "notes", label: "Notes" },
    { key: "categories", label: "Categories" }, { key: "delivery_days", label: "Delivery Days" },
    { key: "moq", label: "MOQ (HK$)" }, { key: "account_number", label: "Account Number" },
  ], "suppliers");

  const pag = usePagination(filtered);

  const StatChipBtn = ({ id, label, count, tone }: { id: StatChip; label: string; count: number; tone: "neutral" | "success" | "danger" }) => {
    const active = chip === id;
    return (
      <button
        onClick={() => setChip(active ? "all" : id)}
        className={cn(
          "flex-1 sm:flex-none min-w-[110px] rounded-lg px-3 py-2 text-left transition-all border min-h-[52px]",
          active
            ? `${tonePill[tone]} border-transparent ring-2 ring-primary/40`
            : "bg-card border-border hover:border-primary/40",
        )}
      >
        <div className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold tabular-nums leading-tight">{count}</div>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="flex flex-wrap gap-2">
        <StatChipBtn id="all" label="Total" count={stats.total} tone="neutral" />
        <StatChipBtn id="active" label="Active" count={stats.active} tone="success" />
        <StatChipBtn id="inactive" label="Inactive" count={stats.inactive} tone="neutral" />
        <StatChipBtn id="missing_contact" label="Missing contact" count={stats.missing_contact} tone="danger" />
      </div>

      <DataTableShell
        search={{ value: search, onChange: setSearch, placeholder: "Search name, code, contact…" }}
        toolbarRight={
          <>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-[140px] text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={termsFilter} onValueChange={setTermsFilter}>
              <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue placeholder="Terms" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Terms</SelectItem>
                {PAYMENT_TERMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleExport} className="h-9">
              <Download className="h-4 w-4 mr-1" />CSV
            </Button>
            <Button size="sm" onClick={openAdd} className="h-9">
              <Plus className="h-4 w-4 mr-1" />Add
            </Button>
          </>
        }
        resultCount={`${filtered.length} supplier${filtered.length !== 1 ? "s" : ""}`}
        pagination={{
          page: pag.page, pageSize: pag.pageSize, totalPages: pag.totalPages,
          rangeStart: pag.rangeStart, rangeEnd: pag.rangeEnd, total: pag.total,
          onPageChange: pag.setPage, onPageSizeChange: pag.setPageSize,
        }}
      >
        {isMobile ? (
          <div className="divide-y divide-border">
            {loading ? (
              [0, 1, 2, 3].map(i => <div key={i} className="p-4 h-24 bg-muted/20 animate-pulse" />)
            ) : pag.pageItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No suppliers & vendors found</div>
            ) : (
              pag.pageItems.map(s => (
                <div key={s.id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <button className="flex-1 min-w-0 text-left" onClick={() => openSheet(s)}>
                      <div className="font-medium text-sm text-primary truncate">{s.name}</div>
                      <div className="text-[11px] font-mono text-muted-foreground">{s.code || "—"}</div>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0"><MoreVertical className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5 mr-2" />Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDeleteId(s.id)} className="text-destructive"><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {(s.categories?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {s.categories.map(c => <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>)}
                    </div>
                  )}
                  {(s.contact_person || s.phone || s.email) && (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {s.contact_person && <div>{s.contact_person}</div>}
                      {s.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> <a href={`tel:${s.phone}`} className="hover:text-foreground">{s.phone}</a></div>}
                      {s.email && <div className="flex items-center gap-1 truncate"><Mail className="h-3 w-3 shrink-0" /> <a href={`mailto:${s.email}`} className="hover:text-foreground truncate">{s.email}</a></div>}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>{s.payment_terms || "—"}</span>
                      {s.moq > 0 && <span className="tabular-nums">MOQ HK${Number(s.moq).toLocaleString()}</span>}
                    </div>
                    <Badge variant={s.is_active ? "default" : "secondary"} className="text-[10px]">{s.is_active ? "Active" : "Inactive"}</Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Categories</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Payment Terms</TableHead>
                <TableHead className="text-right">MOQ</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[80px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={9}><div className="h-8 bg-muted/30 rounded animate-pulse" /></TableCell></TableRow>
                ))
              ) : pag.pageItems.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No suppliers & vendors found</TableCell></TableRow>
              ) : (
                pag.pageItems.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.code || "—"}</TableCell>
                    <TableCell>
                      <button className="font-medium text-primary hover:underline text-left" onClick={() => openSheet(s)}>{s.name}</button>
                      {s.phone && <div className="text-[11px] text-muted-foreground tabular-nums">{s.phone}</div>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.contact_person || <span className="text-muted-foreground">—</span>}
                      {s.email && <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">{s.email}</div>}
                    </TableCell>
                    <TableCell>
                      {s.categories?.length ? (
                        <div className="flex flex-wrap gap-1">{s.categories.map(c => <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>)}</div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.delivery_days?.length ? DAY_OPTIONS.filter(d => s.delivery_days.includes(d)).join(" ") : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs">{s.payment_terms || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.moq > 0 ? `HK$${Number(s.moq).toLocaleString()}` : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.is_active ? "default" : "secondary"}>{s.is_active ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteId(s.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </DataTableShell>

      {selectedSupplier && (
        <SupplierSheet
          supplier={selectedSupplier}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          onEdit={(s) => { setSheetOpen(false); openEdit(s as Supplier); }}
          onRefresh={fetchSuppliers}
        />
      )}

      {/* Add / Edit Dialog — sectioned; bottom sheet on mobile */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className={cn(
            "max-h-[92vh] overflow-y-auto",
            isMobile
              ? "max-w-full w-full left-0 right-0 top-auto bottom-0 translate-x-0 translate-y-0 rounded-t-2xl rounded-b-none border-b-0 data-[state=open]:slide-in-from-bottom-1/2 data-[state=closed]:slide-out-to-bottom-1/2"
              : "sm:max-w-2xl",
          )}
        >
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Supplier & Vendor" : "Add Supplier & Vendor"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-5 py-2">
            {/* IDENTITY */}
            <section className="space-y-3">
              <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Identity</h4>
              <div className="grid gap-1.5">
                <Label>Name *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Supplier code <span className="text-xs text-muted-foreground ml-2">(auto-generated, editable)</span></Label>
                <Input placeholder="e.g. JEB-001" value={form.code}
                  onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} className="font-mono" />
                <p className="text-xs text-muted-foreground">Unique code for this supplier. Used for reporting and integrations.</p>
              </div>
            </section>

            <div className="h-px bg-border" />

            {/* CONTACT */}
            <section className="space-y-3">
              <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Contact</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Contact Person</Label>
                  <Input value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Phone</Label>
                  <Input type="tel" inputMode="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Email</Label>
                <Input type="email" inputMode="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Address</Label>
                <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
              </div>
            </section>

            <div className="h-px bg-border" />

            {/* COMMERCIAL */}
            <section className="space-y-3">
              <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Commercial Terms</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Payment Terms</Label>
                  <Select value={form.payment_terms} onValueChange={v => setForm({ ...form, payment_terms: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PAYMENT_TERMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Minimum order value (HK$)</Label>
                  <Input type="number" inputMode="numeric" min={0} placeholder="0" value={form.moq || ""}
                    onChange={e => setForm(f => ({ ...f, moq: Number(e.target.value) || 0 }))} className="tabular-nums" />
                </div>
                <div className="grid gap-1.5">
                  <Label>Account number</Label>
                  <Input placeholder="Your account ref with supplier" value={form.account_number}
                    onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Invoice rounding rule</Label>
                  <Select value={form.invoice_rounding_mode}
                    onValueChange={v => setForm({ ...form, invoice_rounding_mode: v as RoundingMode })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ROUNDING_MODES.map(m => <SelectItem key={m} value={m}>{ROUNDING_MODE_LABELS[m]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <div className="h-px bg-border" />

            {/* LOGISTICS */}
            <section className="space-y-3">
              <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Logistics</h4>
              <div className="space-y-2">
                <Label>Supplier categories</Label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_OPTIONS.map(cat => {
                    const on = form.categories.includes(cat);
                    return (
                      <button type="button" key={cat}
                        onClick={() => setForm(f => ({ ...f, categories: on ? f.categories.filter(c => c !== cat) : [...f.categories, cat] }))}
                        className={cn(
                          "px-3 py-1.5 rounded-full border text-sm transition-colors min-h-[36px]",
                          on ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary",
                        )}>
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Delivery days</Label>
                <div className="flex flex-wrap gap-2">
                  {DAY_OPTIONS.map(day => {
                    const on = form.delivery_days.includes(day);
                    return (
                      <button type="button" key={day}
                        onClick={() => setForm(f => ({ ...f, delivery_days: on ? f.delivery_days.filter(d => d !== day) : [...f.delivery_days, day] }))}
                        className={cn(
                          "flex items-center justify-center w-11 h-11 rounded-lg border text-xs font-medium transition-colors",
                          on ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary",
                        )}>
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <div className="h-px bg-border" />

            {/* OTHER */}
            <section className="space-y-3">
              <h4 className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Other</h4>
              <div className="grid gap-1.5">
                <Label>Notes</Label>
                <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
                <Label>Active</Label>
              </div>
            </section>
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
