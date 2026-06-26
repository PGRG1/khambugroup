import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Plus, Pencil, Trash2, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const fmtMoney = (n: number) =>
  `HK$ ${(Number(n) || 0).toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d?: string | null) => (d ? format(new Date(d), "dd MMM yyyy") : "—");

type Supplier = { id: string; name: string };
type SupplierOB = {
  id: string; supplier_id: string; amount: number; venue: string | null;
  as_of_date: string; notes: string;
};
type CreditNoteRow = {
  id: string; supplier_id: string | null; credit_note_number: string;
  credit_note_date: string; original_amount: number; remaining_balance: number;
  status: string; venue: string | null; notes: string;
};
type DepositOB = {
  id: string; supplier_id: string; product_master_id: string | null;
  sku: string; description: string; quantity: number; unit_value: number;
  total_value: number; venue: string | null; as_of_date: string; notes: string;
};
type ToastFn = ReturnType<typeof useToast>["toast"];

export default function OpeningBalances() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const { user } = useAuth();
  const { toast } = useToast();

  const [goLive, setGoLive] = useState<Date>(new Date());
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierOBs, setSupplierOBs] = useState<SupplierOB[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNoteRow[]>([]);
  const [deposits, setDeposits] = useState<DepositOB[]>([]);

  const supplierMap = useMemo(() => {
    const m = new Map<string, string>();
    suppliers.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [suppliers]);

  const reload = useCallback(async () => {
    if (!tenantId) return;
    const [sups, sob, cn, dob] = await Promise.all([
      (supabase.from("suppliers") as any).select("id,name").eq("tenant_id", tenantId).order("name"),
      (supabase.from("supplier_opening_balances" as any) as any).select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      (supabase.from("credit_notes") as any).select("id,supplier_id,credit_note_number,credit_note_date,original_amount,remaining_balance,status,venue,notes").eq("tenant_id", tenantId).eq("is_opening_balance", true).order("credit_note_date", { ascending: false }),
      (supabase.from("deposit_opening_balances" as any) as any).select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    ]);
    setSuppliers(((sups.data as any) || []) as Supplier[]);
    setSupplierOBs(((sob.data as any) || []) as SupplierOB[]);
    setCreditNotes(((cn.data as any) || []) as CreditNoteRow[]);
    setDeposits(((dob.data as any) || []) as DepositOB[]);
  }, [tenantId]);

  useEffect(() => { reload(); }, [reload]);

  if (tenantLoading || !tenantId) {
    return <div className="p-6 text-muted-foreground">Loading…</div>;
  }

  const goLiveISO = format(goLive, "yyyy-MM-dd");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Opening Balances</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Capture supplier payables, credit notes, and deposits as of your go-live date.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Go-live date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[220px] justify-start text-left font-normal")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(goLive, "dd MMM yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={goLive}
                onSelect={(d) => d && setGoLive(d)}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <SupplierPayablesSection
        tenantId={tenantId} userId={user?.id} goLiveISO={goLiveISO}
        rows={supplierOBs} suppliers={suppliers} supplierMap={supplierMap}
        onChanged={reload} toast={toast}
      />

      <CreditNotesSection
        tenantId={tenantId} userId={user?.id} goLiveISO={goLiveISO}
        rows={creditNotes} suppliers={suppliers} supplierMap={supplierMap}
        onChanged={reload} toast={toast}
      />

      <DepositsSection
        tenantId={tenantId} userId={user?.id} goLiveISO={goLiveISO}
        rows={deposits} suppliers={suppliers} supplierMap={supplierMap}
        onChanged={reload} toast={toast}
      />
    </div>
  );
}

/* ============================== Supplier Payables ============================== */

function SupplierPayablesSection({
  tenantId, userId, goLiveISO, rows, suppliers, supplierMap, onChanged, toast,
}: {
  tenantId: string; userId?: string; goLiveISO: string;
  rows: SupplierOB[]; suppliers: Supplier[]; supplierMap: Map<string, string>;
  onChanged: () => void; toast: ToastFn;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierOB | null>(null);
  const [form, setForm] = useState({ supplier_id: "", amount: "", venue: "", notes: "" });

  const startAdd = () => {
    setEditing(null);
    setForm({ supplier_id: "", amount: "", venue: "", notes: "" });
    setOpen(true);
  };
  const startEdit = (r: SupplierOB) => {
    setEditing(r);
    setForm({
      supplier_id: r.supplier_id, amount: String(r.amount),
      venue: r.venue || "", notes: r.notes || "",
    });
    setOpen(true);
  };

  const save = async () => {
    const amt = Number(form.amount);
    if (!form.supplier_id || !(amt > 0)) {
      toast({ title: "Missing fields", description: "Supplier and positive amount required.", variant: "destructive" });
      return;
    }
    const payload: any = {
      tenant_id: tenantId,
      supplier_id: form.supplier_id,
      amount: amt,
      venue: form.venue || null,
      notes: form.notes || "",
      as_of_date: goLiveISO,
      ...(editing ? {} : { created_by: userId || null }),
    };
    const tbl = supabase.from("supplier_opening_balances" as any) as any;
    const { error } = editing
      ? await tbl.update(payload).eq("id", editing.id).eq("tenant_id", tenantId)
      : await tbl.insert(payload);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    setOpen(false);
    onChanged();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this opening balance?")) return;
    const { error } = await (supabase.from("supplier_opening_balances" as any) as any)
      .delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    onChanged();
  };

  const total = rows.reduce((a, b) => a + Number(b.amount || 0), 0);

  return (
    <Card className="card-glass">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Supplier Payables</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{rows.length} entries · {fmtMoney(total)} total</p>
        </div>
        <Button onClick={startAdd}><Plus className="h-4 w-4 mr-1" />Add Opening Balance</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Venue</TableHead>
              <TableHead>As of Date</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No entries yet.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{supplierMap.get(r.supplier_id) || "—"}</TableCell>
                <TableCell className="text-right td-num">{fmtMoney(Number(r.amount))}</TableCell>
                <TableCell>{r.venue || "—"}</TableCell>
                <TableCell>{fmtDate(r.as_of_date)}</TableCell>
                <TableCell className="max-w-xs truncate">{r.notes || "—"}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => startEdit(r)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Supplier Opening Balance</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Supplier</Label>
              <Select value={form.supplier_id} onValueChange={(v) => setForm((f) => ({ ...f, supplier_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount (HK$)</Label>
              <Input type="number" step="0.01" min="0" value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <Label>Venue</Label>
              <Input value={form.venue} onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="text-xs text-muted-foreground">As of: {fmtDate(goLiveISO)}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ============================== Credit Notes ============================== */

function CreditNotesSection({
  tenantId, userId, goLiveISO, rows, suppliers, supplierMap, onChanged, toast,
}: {
  tenantId: string; userId?: string; goLiveISO: string;
  rows: CreditNoteRow[]; suppliers: Supplier[]; supplierMap: Map<string, string>;
  onChanged: () => void; toast: ToastFn;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ supplier_id: "", credit_note_number: "", amount: "", venue: "", notes: "" });

  const startAdd = () => {
    setForm({ supplier_id: "", credit_note_number: "", amount: "", venue: "", notes: "" });
    setOpen(true);
  };

  const save = async () => {
    const amt = Number(form.amount);
    if (!form.supplier_id || !form.credit_note_number.trim() || !(amt > 0)) {
      toast({ title: "Missing fields", description: "Supplier, CN # and positive amount required.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("credit_notes").insert({
      tenant_id: tenantId,
      supplier_id: form.supplier_id,
      credit_note_number: form.credit_note_number.trim(),
      credit_note_date: goLiveISO,
      original_amount: amt,
      remaining_balance: amt,
      status: "approved",
      venue: form.venue || null,
      notes: form.notes || "",
      source_invoice_id: null,
      is_opening_balance: true,
      created_by: userId || null,
    } as any);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    setOpen(false);
    onChanged();
  };

  const voidCN = async (id: string) => {
    if (!confirm("Void this credit note?")) return;
    const { error } = await supabase.from("credit_notes").update({ status: "void" }).eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast({ title: "Void failed", description: error.message, variant: "destructive" }); return; }
    onChanged();
  };

  const total = rows.reduce((a, b) => a + Number(b.remaining_balance || 0), 0);

  return (
    <Card className="card-glass">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Credit Notes</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{rows.length} entries · {fmtMoney(total)} remaining</p>
        </div>
        <Button onClick={startAdd}><Plus className="h-4 w-4 mr-1" />Add Opening Credit Note</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>CN #</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Remaining</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No entries yet.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.supplier_id ? supplierMap.get(r.supplier_id) || "—" : "—"}</TableCell>
                <TableCell>{r.credit_note_number}</TableCell>
                <TableCell className="text-right td-num">{fmtMoney(Number(r.original_amount))}</TableCell>
                <TableCell className="text-right td-num">{fmtMoney(Number(r.remaining_balance))}</TableCell>
                <TableCell>{fmtDate(r.credit_note_date)}</TableCell>
                <TableCell className="max-w-xs truncate">{r.notes || "—"}</TableCell>
                <TableCell><Badge variant={r.status === "void" ? "outline" : "secondary"}>{r.status}</Badge></TableCell>
                <TableCell className="text-right">
                  {r.status !== "void" && (
                    <Button variant="ghost" size="icon" onClick={() => voidCN(r.id)} title="Void">
                      <Ban className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Opening Credit Note</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Supplier</Label>
              <Select value={form.supplier_id} onValueChange={(v) => setForm((f) => ({ ...f, supplier_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Credit Note #</Label>
              <Input value={form.credit_note_number}
                onChange={(e) => setForm((f) => ({ ...f, credit_note_number: e.target.value }))} />
            </div>
            <div>
              <Label>Amount (HK$)</Label>
              <Input type="number" step="0.01" min="0" value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
            <div>
              <Label>Venue</Label>
              <Input value={form.venue} onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="text-xs text-muted-foreground">Date: {fmtDate(goLiveISO)}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ============================== Deposits ============================== */

function DepositsSection({
  tenantId, userId, goLiveISO, rows, suppliers, supplierMap, onChanged, toast,
}: {
  tenantId: string; userId?: string; goLiveISO: string;
  rows: DepositOB[]; suppliers: Supplier[]; supplierMap: Map<string, string>;
  onChanged: () => void; toast: ToastFn;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DepositOB | null>(null);
  const [form, setForm] = useState({
    supplier_id: "", product_master_id: null as string | null, sku: "",
    description: "", quantity: "1", unit_value: "", venue: "", notes: "",
  });

  const startAdd = () => {
    setEditing(null);
    setForm({ supplier_id: "", product_master_id: null, sku: "", description: "", quantity: "1", unit_value: "", venue: "", notes: "" });
    setOpen(true);
  };
  const startEdit = (r: DepositOB) => {
    setEditing(r);
    setForm({
      supplier_id: r.supplier_id,
      product_master_id: r.product_master_id,
      sku: r.sku || "",
      description: r.description,
      quantity: String(r.quantity),
      unit_value: String(r.unit_value),
      venue: r.venue || "",
      notes: r.notes || "",
    });
    setOpen(true);
  };

  const onSkuChange = async (sku: string) => {
    setForm((f) => ({ ...f, sku }));
    const trimmed = sku.trim();
    if (!trimmed) return;
    const { data } = await supabase
      .from("product_master")
      .select("id,description,unit_cost")
      .eq("tenant_id", tenantId)
      .eq("internal_sku", trimmed)
      .maybeSingle();
    if (data) {
      setForm((f) => ({
        ...f,
        product_master_id: (data as any).id,
        description: f.description || (data as any).description || "",
        unit_value: f.unit_value || ((data as any).unit_cost != null ? String((data as any).unit_cost) : ""),
      }));
    }
  };

  const totalPreview = (Number(form.quantity) || 0) * (Number(form.unit_value) || 0);

  const save = async () => {
    const qty = Number(form.quantity);
    const uv = Number(form.unit_value);
    if (!form.supplier_id || !form.description.trim() || !(qty > 0) || !(uv > 0)) {
      toast({ title: "Missing fields", description: "Supplier, description, qty and unit value required.", variant: "destructive" });
      return;
    }
    const payload: any = {
      tenant_id: tenantId,
      supplier_id: form.supplier_id,
      product_master_id: form.product_master_id,
      sku: form.sku || "",
      description: form.description.trim(),
      quantity: qty,
      unit_value: uv,
      venue: form.venue || null,
      notes: form.notes || "",
      as_of_date: goLiveISO,
      ...(editing ? {} : { created_by: userId || null }),
    };
    const tbl = supabase.from("deposit_opening_balances" as any) as any;
    const { error } = editing
      ? await tbl.update(payload).eq("id", editing.id).eq("tenant_id", tenantId)
      : await tbl.insert(payload);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    setOpen(false);
    onChanged();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this deposit?")) return;
    const { error } = await (supabase.from("deposit_opening_balances" as any) as any)
      .delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    onChanged();
  };

  const total = rows.reduce((a, b) => a + Number(b.total_value || 0), 0);

  return (
    <Card className="card-glass">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Deposits</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{rows.length} entries · {fmtMoney(total)} total</p>
        </div>
        <Button onClick={startAdd}><Plus className="h-4 w-4 mr-1" />Add Deposit</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Supplier</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit Value</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Venue</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">No entries yet.</TableCell></TableRow>
            ) : rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{supplierMap.get(r.supplier_id) || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.sku || "—"}</TableCell>
                <TableCell className="max-w-xs truncate">{r.description}</TableCell>
                <TableCell className="text-right td-num">{Number(r.quantity)}</TableCell>
                <TableCell className="text-right td-num">{fmtMoney(Number(r.unit_value))}</TableCell>
                <TableCell className="text-right td-num">{fmtMoney(Number(r.total_value))}</TableCell>
                <TableCell>{r.venue || "—"}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => startEdit(r)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Deposit</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Supplier</Label>
              <Select value={form.supplier_id} onValueChange={(v) => setForm((f) => ({ ...f, supplier_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>SKU</Label>
              <Input value={form.sku} onChange={(e) => onSkuChange(e.target.value)} placeholder="Internal SKU (auto-fills if found)" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Quantity</Label>
                <Input type="number" step="0.01" min="0" value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
              </div>
              <div>
                <Label>Unit Value</Label>
                <Input type="number" step="0.01" min="0" value={form.unit_value}
                  onChange={(e) => setForm((f) => ({ ...f, unit_value: e.target.value }))} />
              </div>
              <div>
                <Label>Total</Label>
                <Input readOnly value={fmtMoney(totalPreview)} className="bg-muted" />
              </div>
            </div>
            <div>
              <Label>Venue</Label>
              <Input value={form.venue} onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="text-xs text-muted-foreground">As of: {fmtDate(goLiveISO)}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
