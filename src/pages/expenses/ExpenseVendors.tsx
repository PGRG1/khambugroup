import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { toast } from "sonner";

interface Supplier {
  id: string;
  name: string;
  vendor_code: string | null;
  vendor_type: "procurement" | "expense" | "both";
  payment_terms_id: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
}

interface PaymentTerm { id: string; name: string; }
interface ExpenseBill { supplier_id: string | null; payment_status: string | null; due_date: string | null; }

const NONE = "__none__";

function generateVendorCode(name: string, seq: number): string {
  const clean = (name || "").trim();
  if (!clean) return "";
  const words = clean.split(/\s+/).filter(Boolean);
  let prefix = "";
  if (words.length === 1) {
    prefix = words[0].slice(0, 6).toUpperCase();
  } else {
    prefix = words.map((w) => w.slice(0, 3)).join("").toUpperCase();
  }
  prefix = prefix.replace(/[^A-Z0-9]/g, "");
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

function KCard({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "amber" | "sky" | "red" }) {
  const toneCls =
    tone === "amber" ? "text-amber-400" :
    tone === "sky" ? "text-sky-400" :
    tone === "red" ? "text-red-400" :
    "text-foreground";
  return (
    <Card className="card-glass">
      <CardContent className="p-4">
        <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold td-num ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

export default function ExpenseVendorsPage() {
  const { tenantId } = useActiveTenant();
  const [vendors, setVendors] = useState<Supplier[]>([]);
  const [allSupplierCount, setAllSupplierCount] = useState(0);
  const [terms, setTerms] = useState<PaymentTerm[]>([]);
  const [bills, setBills] = useState<ExpenseBill[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Supplier>>({});
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    const [v, t, b, cnt] = await Promise.all([
      supabase.from("suppliers").select("*").in("vendor_type", ["expense", "both"]).order("name"),
      tenantId
        ? supabase.from("expense_payment_terms").select("id,name").eq("tenant_id", tenantId).order("name")
        : Promise.resolve({ data: [] as any }),
      supabase.from("expense_bills").select("supplier_id,payment_status,due_date"),
      supabase.from("suppliers").select("id", { count: "exact", head: true }),
    ]);
    setVendors((v.data || []) as any);
    setTerms((t.data || []) as any);
    setBills((b.data || []) as any);
    setAllSupplierCount((cnt as any).count || 0);
  };

  useEffect(() => { load(); }, [tenantId]);

  const kpis = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const active = vendors.filter((v) => v.is_active).length;
    const openSet = new Set<string>();
    const overdueSet = new Set<string>();
    for (const b of bills) {
      if (!b.supplier_id) continue;
      if (b.payment_status !== "paid") openSet.add(b.supplier_id);
      if (b.payment_status !== "paid" && b.due_date && b.due_date < today) overdueSet.add(b.supplier_id);
    }
    return { active, open: openSet.size, overdue: overdueSet.size };
  }, [vendors, bills]);

  // Auto-generate vendor code from name (debounced 300ms) when not in edit mode and not manually edited
  useEffect(() => {
    if (editing.id) return; // edit mode — don't auto-generate
    if (codeManuallyEdited) return;
    if (!editing.name) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const code = generateVendorCode(editing.name || "", allSupplierCount + 1);
      setEditing((p) => ({ ...p, vendor_code: code }));
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [editing.name, editing.id, codeManuallyEdited, allSupplierCount]);

  const checkCodeUniqueness = async (code: string) => {
    if (!code) { setCodeError(null); return; }
    const q = supabase.from("suppliers").select("id").eq("vendor_code", code);
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
      const { error } = await supabase.from("suppliers").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      payload.is_active = true;
      const { error } = await supabase.from("suppliers").insert(payload);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Saved");
    setOpen(false);
    load();
  };

  const toggleActive = async (v: Supplier) => {
    const { error } = await supabase.from("suppliers").update({ is_active: !v.is_active }).eq("id", v.id);
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
    setCodeManuallyEdited(true); // existing — don't auto-overwrite
    setOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight">Vendors</h1>
          <p className="text-sm text-muted-foreground">Companies and service providers used for operational expenses.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> Add Vendor
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KCard label="Active vendors" value={kpis.active} />
        <KCard label="With open bills" value={kpis.open} tone="sky" />
        <KCard label="With overdue bills" value={kpis.overdue} tone="red" />
      </div>

      <Card className="card-glass p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {["Name","Vendor Code","Payment Terms","Contact","Email","Phone","Active",""].map((h) => (
                <TableHead key={h} className="text-[11px] uppercase tracking-wider text-muted-foreground">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.map((v, idx) => {
              const term = terms.find((t) => t.id === v.payment_terms_id);
              return (
                <TableRow key={v.id} className={`${idx % 2 === 0 ? "bg-muted/30" : ""} hover:bg-muted/20`}>
                  <TableCell className="py-2 px-3 font-medium">{v.name}</TableCell>
                  <TableCell className="py-2 px-3 font-mono text-xs text-muted-foreground">{v.vendor_code || "—"}</TableCell>
                  <TableCell className="py-2 px-3">{term?.name || "—"}</TableCell>
                  <TableCell className="py-2 px-3">{v.contact_person || "—"}</TableCell>
                  <TableCell className="py-2 px-3">{v.email || "—"}</TableCell>
                  <TableCell className="py-2 px-3">{v.phone || "—"}</TableCell>
                  <TableCell className="py-2 px-3" onClick={() => toggleActive(v)}>
                    {v.is_active ? (
                      <Badge className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 cursor-pointer">Active</Badge>
                    ) : (
                      <Badge variant="secondary" className="cursor-pointer">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-2 px-3">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(v)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {!vendors.length && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  No expense vendors added yet. Add your first vendor to start tracking bills and payments.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
          <SheetHeader><SheetTitle>{editing.id ? "Edit" : "New"} Vendor</SheetTitle></SheetHeader>
          <div className="space-y-3 mt-4">
            <div>
              <Label>Name *</Label>
              <Input value={editing.name || ""} onChange={(e) => setEditing((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label>Vendor Code</Label>
              <Input
                className="font-mono"
                placeholder="Auto-generated from name"
                value={editing.vendor_code || ""}
                onChange={(e) => {
                  setCodeManuallyEdited(true);
                  setEditing((p) => ({ ...p, vendor_code: e.target.value.toUpperCase() }));
                }}
                onBlur={(e) => checkCodeUniqueness(e.target.value.trim())}
              />
              {codeError && <p className="text-xs text-red-400 mt-1">{codeError}</p>}
              {editing.id && editingVendorHasBills && (
                <p className="text-xs text-muted-foreground mt-1">Changing this code will affect historical references.</p>
              )}
            </div>
            <div>
              <Label>Payment Terms</Label>
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
            <div>
              <Label>Contact person</Label>
              <Input value={editing.contact_person || ""} onChange={(e) => setEditing((p) => ({ ...p, contact_person: e.target.value }))} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={editing.email || ""} onChange={(e) => setEditing((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={editing.phone || ""} onChange={(e) => setEditing((p) => ({ ...p, phone: e.target.value }))} />
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
