import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Search, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { toast } from "sonner";
import {
  PageHeader,
  KpiGrid,
  KpiCard,
  KpiSkeleton,
  StatusPill,
  TableSkeleton,
  EmptyState,
  ScopeLine,
} from "@/components/expenses/shared";

interface Supplier {
  id: string;
  name: string;
  vendor_code: string | null;
  vendor_type: "procurement" | "expense" | "both" | null;
  payment_terms_id: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
}

interface PaymentTerm { id: string; name: string; }
interface ExpenseBillLite { supplier_id: string | null; payment_status: string | null; due_date: string | null; }

const NONE = "__none__";
type TypeFilter = "all" | "expense" | "both" | "procurement";

function generateVendorCode(name: string, seq: number): string {
  const clean = (name || "").trim();
  if (!clean) return "";
  const words = clean.split(/\s+/).filter(Boolean);
  let prefix = "";
  if (words.length === 1) prefix = words[0].slice(0, 6).toUpperCase();
  else prefix = words.map((w) => w.slice(0, 3)).join("").toUpperCase();
  prefix = prefix.replace(/[^A-Z0-9]/g, "");
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

export default function ExpenseVendorsPage() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [vendors, setVendors] = useState<Supplier[]>([]);
  const [terms, setTerms] = useState<PaymentTerm[]>([]);
  const [bills, setBills] = useState<ExpenseBillLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Supplier>>({});
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    // Broadened filter: show ALL suppliers so master data is never mysteriously empty,
    // with an in-page chip filter to slice by vendor_type. Prevents the old bug where
    // seeding suppliers as "procurement" made the expense vendor page permanently empty.
    const [v, t, b] = await Promise.all([
      supabase.from("suppliers").select("*").eq("tenant_id", tenantId).order("name"),
      supabase.from("expense_payment_terms").select("id,name").eq("tenant_id", tenantId).order("name"),
      supabase.from("expense_bills").select("supplier_id,payment_status,due_date").eq("tenant_id", tenantId),
    ]);
    setVendors((v.data || []) as any);
    setTerms((t.data || []) as any);
    setBills((b.data || []) as any);
    setLoading(false);
  };

  useEffect(() => {
    if (!tenantLoading) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, tenantLoading]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors.filter((v) => {
      if (typeFilter !== "all" && (v.vendor_type || "procurement") !== typeFilter) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        (v.vendor_code || "").toLowerCase().includes(q) ||
        (v.email || "").toLowerCase().includes(q)
      );
    });
  }, [vendors, search, typeFilter]);

  const kpis = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const active = vendors.filter((v) => v.is_active).length;
    const expenseCount = vendors.filter((v) => v.vendor_type === "expense" || v.vendor_type === "both").length;
    const openSet = new Set<string>();
    const overdueSet = new Set<string>();
    for (const b of bills) {
      if (!b.supplier_id) continue;
      if (b.payment_status !== "paid") openSet.add(b.supplier_id);
      if (b.payment_status !== "paid" && b.due_date && b.due_date < today) overdueSet.add(b.supplier_id);
    }
    return { active, expenseCount, open: openSet.size, overdue: overdueSet.size };
  }, [vendors, bills]);

  useEffect(() => {
    if (editing.id) return;
    if (codeManuallyEdited) return;
    if (!editing.name) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const code = generateVendorCode(editing.name || "", vendors.length + 1);
      setEditing((p) => ({ ...p, vendor_code: code }));
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [editing.name, editing.id, codeManuallyEdited, vendors.length]);

  const checkCodeUniqueness = async (code: string) => {
    if (!code || !tenantId) { setCodeError(null); return; }
    const q = supabase.from("suppliers").select("id").eq("tenant_id", tenantId).eq("vendor_code", code);
    if (editing.id) q.neq("id", editing.id);
    const { data } = await q.limit(1);
    setCodeError(data && data.length ? "This code is already in use" : null);
  };

  const editingVendorHasBills = useMemo(() => {
    if (!editing.id) return false;
    return bills.some((b) => b.supplier_id === editing.id);
  }, [editing.id, bills]);

  const save = async () => {
    if (!editing.name) { toast.error("Name is required"); return; }
    if (codeError) { toast.error(codeError); return; }
    const payload: any = {
      name: editing.name,
      vendor_code: editing.vendor_code?.trim() || null,
      vendor_type: editing.vendor_type || "expense",
      payment_terms_id: editing.payment_terms_id || null,
      contact_person: editing.contact_person || null,
      email: editing.email || null,
      phone: editing.phone || null,
      address: editing.address || null,
      notes: editing.notes || null,
    };
    if (editing.id) {
      const { error } = await supabase.from("suppliers").update(payload).eq("id", editing.id).eq("tenant_id", tenantId!);
      if (error) { toast.error(error.message); return; }
    } else {
      payload.is_active = true;
      payload.tenant_id = tenantId;
      const { error } = await supabase.from("suppliers").insert(payload);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Saved");
    setOpen(false);
    load();
  };

  const toggleActive = async (v: Supplier) => {
    const { error } = await supabase
      .from("suppliers")
      .update({ is_active: !v.is_active })
      .eq("id", v.id)
      .eq("tenant_id", tenantId!);
    if (error) toast.error(error.message);
    else load();
  };

  const openNew = () => {
    setEditing({ vendor_type: "expense" });
    setCodeError(null);
    setCodeManuallyEdited(false);
    setOpen(true);
  };

  const openEdit = (v: Supplier) => {
    setEditing(v);
    setCodeError(null);
    setCodeManuallyEdited(true);
    setOpen(true);
  };

  const typeChip = (t: string | null) => {
    if (t === "expense") return <StatusPill variant="info">Expense</StatusPill>;
    if (t === "both") return <StatusPill variant="success">Both</StatusPill>;
    return <StatusPill variant="muted">Procurement</StatusPill>;
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Vendors"
        description="All companies and service providers. Filter by type to see expense-only vendors, procurement suppliers, or both."
        actions={
          <Button size="sm" className="h-9" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Add vendor
          </Button>
        }
      />

      {loading ? (
        <KpiSkeleton count={4} />
      ) : (
        <KpiGrid>
          <KpiCard label="Total vendors" value={String(vendors.length)} />
          <KpiCard label="Active" value={String(kpis.active)} tone="success" />
          <KpiCard label="Used for expenses" value={String(kpis.expenseCount)} hint="type = expense or both" tone="info" />
          <KpiCard label="With overdue bills" value={String(kpis.overdue)} tone={kpis.overdue > 0 ? "destructive" : "default"} />
        </KpiGrid>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-9"
            placeholder="Search vendor, code, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          {(["all", "expense", "both", "procurement"] as TypeFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={
                "px-3 h-9 text-xs font-medium rounded-md border transition-colors " +
                (typeFilter === t
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-secondary text-secondary-foreground hover:bg-muted")
              }
            >
              {t === "all" ? "All types" : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <ScopeLine>
          {visible.length} of {vendors.length}
        </ScopeLine>
      </div>

      <Card className="card-glass p-0 overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  {["Name", "Code", "Type", "Payment terms", "Contact", "Status", ""].map((h) => (
                    <TableHead key={h} className="text-[11px] uppercase tracking-wider text-muted-foreground">{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((v, idx) => {
                  const term = terms.find((t) => t.id === v.payment_terms_id);
                  return (
                    <TableRow key={v.id} className={`${idx % 2 === 0 ? "bg-muted/20" : ""} hover:bg-muted/40 cursor-pointer`} onClick={() => openEdit(v)}>
                      <TableCell className="py-2 px-3 font-medium">{v.name}</TableCell>
                      <TableCell className="py-2 px-3 font-mono text-xs text-muted-foreground">{v.vendor_code || "—"}</TableCell>
                      <TableCell className="py-2 px-3">{typeChip(v.vendor_type)}</TableCell>
                      <TableCell className="py-2 px-3">{term?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="py-2 px-3 text-muted-foreground truncate max-w-[220px]">
                        {v.contact_person || v.email || v.phone || "—"}
                      </TableCell>
                      <TableCell className="py-2 px-3" onClick={(e) => { e.stopPropagation(); toggleActive(v); }}>
                        <StatusPill variant={v.is_active ? "success" : "muted"} className="cursor-pointer">
                          {v.is_active ? "Active" : "Inactive"}
                        </StatusPill>
                      </TableCell>
                      <TableCell className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(v)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!vendors.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="p-0">
                      <EmptyState
                        icon={<Users className="h-6 w-6" />}
                        title="No vendors yet"
                        description="Add your first vendor to start tracking bills, statements, and payments."
                        action={
                          <Button size="sm" className="h-8" onClick={openNew}>
                            <Plus className="h-3 w-3 mr-1" /> Add first vendor
                          </Button>
                        }
                      />
                    </TableCell>
                  </TableRow>
                )}
                {vendors.length > 0 && !visible.length && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No vendors match the current filter.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-[520px] overflow-y-auto">
          <SheetHeader><SheetTitle>{editing.id ? "Edit" : "New"} Vendor</SheetTitle></SheetHeader>
          <div className="space-y-3 mt-4">
            <div>
              <Label>Name *</Label>
              <Input value={editing.name || ""} onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vendor code</Label>
                <Input
                  className="font-mono"
                  placeholder="Auto-generated"
                  value={editing.vendor_code || ""}
                  onChange={(e) => {
                    setCodeManuallyEdited(true);
                    setEditing((p) => ({ ...p, vendor_code: e.target.value.toUpperCase() }));
                  }}
                  onBlur={(e) => checkCodeUniqueness(e.target.value.trim())}
                />
                {codeError && <p className="text-xs text-destructive mt-1">{codeError}</p>}
                {editing.id && editingVendorHasBills && (
                  <p className="text-xs text-muted-foreground mt-1">Changing this code affects historical references.</p>
                )}
              </div>
              <div>
                <Label>Vendor type</Label>
                <Select
                  value={editing.vendor_type || "expense"}
                  onValueChange={(v: any) => setEditing((p) => ({ ...p, vendor_type: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">Expense only</SelectItem>
                    <SelectItem value="procurement">Procurement only</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Controls which modules can bill this vendor.</p>
              </div>
            </div>
            <div>
              <Label>Payment terms</Label>
              <Select
                value={editing.payment_terms_id || NONE}
                onValueChange={(v) => setEditing((p) => ({ ...p, payment_terms_id: v === NONE ? null : v }))}
              >
                <SelectTrigger><SelectValue placeholder="No terms set" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No terms set</SelectItem>
                  {terms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Contact person</Label>
                <Input value={editing.contact_person || ""} onChange={(e) => setEditing((p) => ({ ...p, contact_person: e.target.value }))} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={editing.phone || ""} onChange={(e) => setEditing((p) => ({ ...p, phone: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={editing.email || ""} onChange={(e) => setEditing((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={editing.address || ""} onChange={(e) => setEditing((p) => ({ ...p, address: e.target.value }))} />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={editing.notes || ""} onChange={(e) => setEditing((p) => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} disabled={!!codeError}>Save</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
