import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, X, Trash2, ChevronsUpDown, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { backfillGrnsFromInvoices } from "@/utils/backfillGrnsFromInvoices";
import { fetchAllRows } from "@/utils/fetchAllRows";

const VENUES = ["Assembly", "Caliente", "Hanabi"] as const;
type Venue = typeof VENUES[number];
type GrnStatus = "draft" | "confirmed";

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-HK", { style: "currency", currency: "HKD", currencyDisplay: "narrowSymbol" }).format(n || 0);
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");

const statusBadge = (s: GrnStatus) =>
  s === "confirmed"
    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
    : "bg-zinc-500/20 text-zinc-300 border-zinc-500/40";

interface Supplier { id: string; name: string; is_active: boolean }
interface Product { id: string; internal_product_name: string; internal_sku?: string | null; unit?: string | null; unit_cost?: number | null }
interface PORow { id: string; po_number: string; supplier_id: string; venue: string; status: string }
interface POItem { id: string; po_id: string; product_master_id: string | null; description: string; quantity_ordered: number; unit: string; unit_price: number }
interface InvoiceRow { id: string; invoice_number: string; supplier_id: string; supplier_name: string; venue: string }
interface InvoiceLine { id: string; invoice_id: string; product_master_id: string | null; description: string; quantity: number; unit: string; unit_price: number }

interface GRN {
  id: string;
  grn_number: string;
  po_id: string | null;
  invoice_id: string | null;
  supplier_id: string;
  venue: string;
  status: GrnStatus;
  received_date: string;
  notes: string | null;
  received_by: string;
  created_at: string;
  suppliers?: { name: string } | null;
  purchase_orders?: { po_number: string } | null;
  invoices?: { invoice_number: string } | null;
}

interface GRNItem {
  id?: string;
  key: string;
  po_item_id: string | null;
  invoice_line_item_id: string | null;
  product_master_id: string | null;
  description: string;
  quantity_invoiced: number | null;
  quantity_ordered: number | null;
  quantity_received: number;
  unit: string;
  unit_cost: number;
}

export default function ReceivingTab() {
  const { user, isAdmin } = useAuth();
  const { tenantId } = useActiveTenant();
  const [grns, setGrns] = useState<GRN[]>([]);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<{ done: number; total: number } | null>(null);
  const [grnTotals, setGrnTotals] = useState<Record<string, number>>({});
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pos, setPos] = useState<PORow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isManager, setIsManager] = useState(false);

  const [supplierFilter, setSupplierFilter] = useState("all");
  const [venueFilter, setVenueFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [linkedPoId, setLinkedPoId] = useState<string | null>(null);
  const [linkedInvoiceId, setLinkedInvoiceId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [venue, setVenue] = useState<Venue>("Assembly");
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<GRNItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDlgOpen, setConfirmDlgOpen] = useState(false);
  const [hasPrefilled, setHasPrefilled] = useState(false);

  // detail panel
  const [selected, setSelected] = useState<GRN | null>(null);
  const [selectedItems, setSelectedItems] = useState<GRNItem[]>([]);

  const loadAll = async () => {
    setLoading(true);
    const [grnRows, allItems, supRes, prodRes, poRes, invRes] = await Promise.all([
      fetchAllRows("goods_received_notes", "*, suppliers(name), purchase_orders(po_number), invoices!invoice_id(invoice_number)", { col: "created_at", asc: false }, tenantId),
      fetchAllRows("grn_items", "grn_id, total", undefined, tenantId),
      supabase.from("suppliers").select("id,name,is_active").order("name"),
      supabase.from("product_master").select("id, internal_product_name, internal_sku, unit, unit_cost").order("internal_product_name"),
      supabase.from("purchase_orders" as any).select("id, po_number, supplier_id, venue, status").in("status", ["approved", "sent"]).order("created_at", { ascending: false }),
      supabase.from("invoices").select("id, invoice_number, supplier_id, venue").order("created_at", { ascending: false }).limit(500),
    ]);
    setGrns((grnRows ?? []) as any);
    const totals: Record<string, number> = {};
    for (const r of (allItems ?? []) as any[]) {
      totals[r.grn_id] = (totals[r.grn_id] || 0) + Number(r.total || 0);
    }
    setGrnTotals(totals);
    const sups = (supRes.data ?? []) as Supplier[];
    setSuppliers(sups);
    setProducts((prodRes.data ?? []) as Product[]);
    setPos((poRes.data ?? []) as unknown as PORow[]);
    const supMap = new Map(sups.map((s) => [s.id, s.name]));
    setInvoices(((invRes.data ?? []) as any[]).map((i) => ({
      id: i.id, invoice_number: i.invoice_number, supplier_id: i.supplier_id,
      supplier_name: supMap.get(i.supplier_id) || "—", venue: i.venue,
    })));
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    (async () => {
      if (!user) return;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      setIsManager((data ?? []).some((r: any) => r.role === "manager" || r.role === "admin") || isAdmin);
    })();
  }, [user, isAdmin]);

  const canManage = isAdmin || isManager;

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    return grns.filter((g) => {
      if (supplierFilter !== "all" && g.supplier_id !== supplierFilter) return false;
      if (venueFilter !== "all" && g.venue !== venueFilter) return false;
      if (statusFilter !== "all" && g.status !== statusFilter) return false;
      return true;
    });
  }, [grns, supplierFilter, venueFilter, statusFilter]);

  const resetForm = () => {
    setLinkedPoId(null);
    setLinkedInvoiceId(null);
    setSupplierId("");
    setVenue("Assembly");
    setReceivedDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    setItems([]);
    setHasPrefilled(false);
  };

  const handlePickPO = async (poId: string) => {
    const po = pos.find((p) => p.id === poId);
    if (!po) return;
    setLinkedPoId(poId);
    setSupplierId(po.supplier_id);
    if (VENUES.includes(po.venue as Venue)) setVenue(po.venue as Venue);
    const { data } = await supabase.from("purchase_order_items" as any).select("*").eq("po_id", poId);
    const lines = ((data ?? []) as unknown as POItem[]).map((it) => ({
      key: crypto.randomUUID(),
      po_item_id: it.id,
      invoice_line_item_id: null,
      product_master_id: it.product_master_id,
      description: it.description,
      quantity_invoiced: null,
      quantity_ordered: Number(it.quantity_ordered),
      quantity_received: Number(it.quantity_ordered),
      unit: it.unit || "each",
      unit_cost: Number(it.unit_price),
    }));
    setItems(lines);
    setHasPrefilled(true);
  };

  const clearPoLink = () => {
    setLinkedPoId(null);
    setItems([]);
    setHasPrefilled(false);
  };

  const handlePickInvoice = async (invId: string) => {
    const inv = invoices.find((i) => i.id === invId);
    if (!inv) return;
    setLinkedInvoiceId(invId);
    setSupplierId(inv.supplier_id);
    if (VENUES.includes(inv.venue as Venue)) setVenue(inv.venue as Venue);
    const { data } = await supabase.from("invoice_line_items").select("*").eq("invoice_id", invId);
    const lines = ((data ?? []) as any[]).map((it) => ({
      key: crypto.randomUUID(),
      po_item_id: null,
      invoice_line_item_id: it.id,
      product_master_id: it.product_master_id,
      description: it.description || "",
      quantity_invoiced: Number(it.quantity),
      quantity_ordered: null,
      quantity_received: it.accepted_qty != null ? Number(it.accepted_qty) : Number(it.quantity),
      unit: it.unit || "each",
      unit_cost: Number(it.net_unit_cost) > 0 ? Number(it.net_unit_cost) : Number(it.unit_price),
    }));
    setItems(lines);
    setHasPrefilled(true);
  };

  const clearInvoiceLink = () => {
    setLinkedInvoiceId(null);
    setItems([]);
    setHasPrefilled(false);
  };

  const addRow = () => {
    setItems((l) => [...l, {
      key: crypto.randomUUID(), po_item_id: null, invoice_line_item_id: null, product_master_id: null,
      description: "", quantity_invoiced: null, quantity_ordered: null, quantity_received: 1,
      unit: "each", unit_cost: 0,
    }]);
  };

  const removeRow = (key: string) => setItems((l) => l.filter((x) => x.key !== key));
  const updateRow = (key: string, patch: Partial<GRNItem>) =>
    setItems((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const onPickProduct = (key: string, productId: string) => {
    const p = products.find((pp) => pp.id === productId);
    if (!p) return;
    updateRow(key, {
      product_master_id: productId,
      description: p.internal_product_name,
      unit: p.unit || "each",
      unit_cost: Number(p.unit_cost ?? 0),
    });
  };

  const totalValue = useMemo(
    () => items.reduce((s, r) => s + (Number(r.quantity_received) || 0) * (Number(r.unit_cost) || 0), 0),
    [items]
  );

  const doSave = async (status: GrnStatus) => {
    if (!supplierId) return toast.error("Pick a supplier");
    if (!venue) return toast.error("Pick a venue");
    if (items.length === 0) return toast.error("Add at least one line");
    if (!user) return toast.error("Not signed in");
    setSaving(true);
    const { data: grn, error } = await supabase
      .from("goods_received_notes" as any)
      .insert({
        po_id: linkedPoId,
        invoice_id: linkedInvoiceId,
        supplier_id: supplierId,
        venue,
        status,
        received_date: receivedDate,
        notes: notes || null,
        received_by: user.id,
      } as any)
      .select()
      .single();
    if (error || !grn) { setSaving(false); return toast.error(error?.message ?? "Failed"); }
    const payload = items.map((it) => ({
      grn_id: (grn as any).id,
      po_item_id: it.po_item_id,
      invoice_line_item_id: it.invoice_line_item_id,
      product_master_id: it.product_master_id,
      description: it.description || "(no description)",
      quantity_invoiced: it.quantity_invoiced,
      quantity_ordered: it.quantity_ordered,
      quantity_received: Number(it.quantity_received) || 0,
      unit: it.unit || "each",
      unit_cost: Number(it.unit_cost) || 0,
    }));
    const { error: itemsErr } = await supabase.from("grn_items" as any).insert(payload as any);
    if (itemsErr) {
      await supabase.from("goods_received_notes" as any).delete().eq("id", (grn as any).id);
      setSaving(false);
      return toast.error(itemsErr.message);
    }
    toast.success(`Saved ${(grn as any).grn_number}`);
    setSaving(false);
    setCreateOpen(false);
    setConfirmDlgOpen(false);
    resetForm();
    loadAll();
  };

  const openDetail = async (g: GRN) => {
    setSelected(g);
    const { data } = await supabase.from("grn_items" as any).select("*").eq("grn_id", g.id);
    setSelectedItems(((data ?? []) as any[]).map((r) => ({ ...r, key: r.id })));
  };

  const confirmReceiptFromPanel = async () => {
    if (!selected) return;
    const { error } = await supabase.from("goods_received_notes" as any).update({ status: "confirmed" }).eq("id", selected.id);
    if (error) return toast.error(error.message);
    toast.success("Receipt confirmed");
    setSelected({ ...selected, status: "confirmed" });
    loadAll();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="w-48">
            <Label className="text-xs">Supplier</Label>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All suppliers</SelectItem>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Label className="text-xs">Venue</Label>
            <Select value={venueFilter} onValueChange={setVenueFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All venues</SelectItem>
                {VENUES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="disputed">Disputed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              disabled={backfilling || !tenantId || !user}
              onClick={async () => {
                if (!tenantId || !user) return;
                if (!window.confirm("Backfill GRNs for every invoice without one? This is a one-off historical migration.")) return;
                setBackfilling(true);
                setBackfillProgress({ done: 0, total: 0 });
                try {
                  const summary = await backfillGrnsFromInvoices({
                    tenantId,
                    userId: user.id,
                    onProgress: (done, total) => setBackfillProgress({ done, total }),
                  });
                  toast.success(
                    `Backfill complete: ${summary.created} created, ${summary.skipped} skipped, ${summary.failed} failed. ` +
                    `Remaining without GRN: ${summary.remainingWithoutGrn}. Total GRNs: ${summary.grnCount}.`,
                    { duration: 10000 },
                  );
                  if (summary.failed > 0) {
                    console.error("Backfill failures:", summary.failures);
                  }
                  loadAll();
                } catch (e: any) {
                  toast.error(`Backfill failed: ${e?.message || String(e)}`);
                } finally {
                  setBackfilling(false);
                  setBackfillProgress(null);
                }
              }}
            >
              <Database className="h-4 w-4 mr-1" />
              {backfilling
                ? backfillProgress && backfillProgress.total > 0
                  ? `Backfilling ${backfillProgress.done}/${backfillProgress.total}…`
                  : "Backfilling…"
                : "Backfill GRNs from invoices"}
            </Button>
          )}
          <Button onClick={() => { resetForm(); setCreateOpen(true); }} disabled={!canManage}>
            <Plus className="h-4 w-4 mr-1" /> New GRN
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>GRN Number</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Venue</TableHead>
              <TableHead>Linked PO</TableHead>
              <TableHead>Linked Invoice</TableHead>
              <TableHead>Received Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No goods received notes</TableCell></TableRow>
            ) : filtered.map((g) => (
              <TableRow key={g.id} className="cursor-pointer" onClick={() => openDetail(g)}>
                <TableCell className="font-mono">{g.grn_number}</TableCell>
                <TableCell>{g.suppliers?.name ?? supplierName(g.supplier_id)}</TableCell>
                <TableCell>{g.venue}</TableCell>
                <TableCell className="font-mono text-xs">{g.purchase_orders?.po_number ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{g.invoices?.invoice_number ?? "—"}</TableCell>
                <TableCell>{fmtDate(g.received_date)}</TableCell>
                <TableCell><Badge variant="outline" className={cn("capitalize", statusBadge(g.status))}>{g.status}</Badge></TableCell>
                <TableCell className="text-right td-num">{fmtMoney(grnTotals[g.id] || 0)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Goods Received Note</DialogTitle></DialogHeader>

          {/* Optional link fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Link to PO (optional)</Label>
              <div className="flex gap-1">
                <SearchableSelect
                  className="flex-1"
                  placeholder="Select a PO…"
                  value={linkedPoId}
                  options={pos.map((p) => ({ value: p.id, label: `${p.po_number} — ${supplierName(p.supplier_id)}`, sub: p.venue }))}
                  onChange={(v) => v && handlePickPO(v)}
                />
                {linkedPoId && <Button size="icon" variant="ghost" onClick={clearPoLink}><X className="h-4 w-4" /></Button>}
              </div>
            </div>
            <div>
              <Label className="text-xs">Link to Invoice (optional)</Label>
              <div className="flex gap-1">
                <SearchableSelect
                  className="flex-1"
                  placeholder="Select an invoice…"
                  value={linkedInvoiceId}
                  options={invoices.map((i) => ({ value: i.id, label: `${i.invoice_number} — ${i.supplier_name}`, sub: i.venue }))}
                  onChange={(v) => v && handlePickInvoice(v)}
                />
                {linkedInvoiceId && <Button size="icon" variant="ghost" onClick={clearInvoiceLink}><X className="h-4 w-4" /></Button>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId} disabled={!!linkedPoId || !!linkedInvoiceId}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.filter((s) => s.is_active).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Venue</Label>
              <Select value={venue} onValueChange={(v) => setVenue(v as Venue)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VENUES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Received Date</Label>
              <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Items received</Label>
              <Button size="sm" variant="outline" onClick={addRow}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add row
              </Button>
            </div>
            <div className="border border-border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30%]">Item</TableHead>
                    <TableHead>Description</TableHead>
                    {hasPrefilled && <TableHead className="text-right">{linkedPoId ? "Ordered" : "Invoiced"}</TableHead>}
                    <TableHead className="text-right">Received Qty</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow><TableCell colSpan={hasPrefilled ? 8 : 7} className="text-center text-muted-foreground py-4">No items yet</TableCell></TableRow>
                  ) : items.map((it) => (
                    <TableRow key={it.key}>
                      <TableCell>
                        <ProductPicker products={products} value={it.product_master_id ?? ""} onChange={(id) => onPickProduct(it.key, id)} />
                      </TableCell>
                      <TableCell>
                        <Input value={it.description} onChange={(e) => updateRow(it.key, { description: e.target.value })} className="h-8 text-xs" />
                      </TableCell>
                      {hasPrefilled && (
                        <TableCell className="text-right text-muted-foreground td-num text-xs">
                          {linkedPoId ? (it.quantity_ordered ?? "—") : (it.quantity_invoiced ?? "—")}
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <Input type="number" step="0.01" value={it.quantity_received}
                          onChange={(e) => updateRow(it.key, { quantity_received: parseFloat(e.target.value) || 0 })}
                          className="h-8 w-24 text-right td-num ml-auto" />
                      </TableCell>
                      <TableCell>
                        <Input value={it.unit} onChange={(e) => updateRow(it.key, { unit: e.target.value })} className="h-8 w-20 text-xs" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" step="0.01" value={it.unit_cost}
                          onChange={(e) => updateRow(it.key, { unit_cost: parseFloat(e.target.value) || 0 })}
                          className="h-8 w-24 text-right td-num ml-auto" />
                      </TableCell>
                      <TableCell className="text-right td-num">
                        {fmtMoney((Number(it.quantity_received) || 0) * (Number(it.unit_cost) || 0))}
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => removeRow(it.key)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end items-baseline gap-3 pr-2">
              <span className="text-sm text-muted-foreground">Total value</span>
              <span className="text-lg font-semibold td-num">{fmtMoney(totalValue)}</span>
            </div>
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="secondary" onClick={() => doSave("draft")} disabled={saving}>Save as Draft</Button>
            <Button onClick={() => setConfirmDlgOpen(true)} disabled={saving || !canManage}>Confirm Receipt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDlgOpen} onOpenChange={setConfirmDlgOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Receipt</DialogTitle>
            <DialogDescription>Confirming receipt cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDlgOpen(false)}>Cancel</Button>
            <Button onClick={() => doSave("confirmed")} disabled={saving}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail slide-over */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/60" onClick={() => setSelected(null)}>
          <div className="absolute right-0 top-0 h-full w-full max-w-2xl bg-background border-l border-border shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between p-5 border-b border-border">
              <div>
                <h2 className="text-xl font-display font-semibold">{selected.grn_number}</h2>
                <p className="text-sm text-muted-foreground mt-1">{selected.suppliers?.name ?? supplierName(selected.supplier_id)} · {selected.venue}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setSelected(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-xs uppercase text-muted-foreground">Status</span><div><Badge variant="outline" className={cn("capitalize", statusBadge(selected.status))}>{selected.status}</Badge></div></div>
                <div><span className="text-xs uppercase text-muted-foreground">Received</span><div>{fmtDate(selected.received_date)}</div></div>
                <div><span className="text-xs uppercase text-muted-foreground">Linked PO</span><div className="font-mono text-xs">{selected.purchase_orders?.po_number ?? "—"}</div></div>
                <div><span className="text-xs uppercase text-muted-foreground">Linked Invoice</span><div className="font-mono text-xs">{selected.invoices?.invoice_number ?? "—"}</div></div>
                {selected.notes && <div className="col-span-2"><span className="text-xs uppercase text-muted-foreground">Notes</span><div>{selected.notes}</div></div>}
              </div>

              {selected.status === "draft" && canManage && (
                <Button size="sm" onClick={confirmReceiptFromPanel}>Confirm Receipt</Button>
              )}

              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Items</Label>
                <div className="border border-border rounded-md mt-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Received</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Unit Cost</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedItems.map((it) => (
                        <TableRow key={it.key}>
                          <TableCell>{it.description}</TableCell>
                          <TableCell className="text-right td-num">{Number((it as any).accepted_qty ?? it.quantity_received)}</TableCell>

                          <TableCell>{it.unit}</TableCell>
                          <TableCell className="text-right td-num">{fmtMoney(Number(it.unit_cost))}</TableCell>
                          <TableCell className="text-right td-num">{fmtMoney(Number(it.quantity_received) * Number(it.unit_cost))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SearchableSelect({ value, onChange, options, placeholder, className }: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: { value: string; label: string; sub?: string }[];
  placeholder: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-between font-normal", className)}>
          <span className="truncate">{current ? current.label : placeholder}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[420px]" align="start">
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.slice(0, 200).map((o) => (
                <CommandItem key={o.value} value={o.label} onSelect={() => { onChange(o.value); setOpen(false); }}>
                  <div className="flex flex-col">
                    <span className="text-sm">{o.label}</span>
                    {o.sub && <span className="text-xs text-muted-foreground">{o.sub}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ProductPicker({ products, value, onChange }: { products: Product[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = products.find((p) => p.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between h-8 font-normal text-xs">
          <span className="truncate">{current ? current.internal_product_name : "Select / type…"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[360px]" align="start">
        <Command>
          <CommandInput placeholder="Search products…" />
          <CommandList>
            <CommandEmpty>No products found.</CommandEmpty>
            <CommandGroup>
              {products.slice(0, 200).map((p) => (
                <CommandItem key={p.id} value={p.internal_product_name} onSelect={() => { onChange(p.id); setOpen(false); }}>
                  <div className="flex flex-col">
                    <span className="text-sm">{p.internal_product_name}</span>
                    {p.internal_sku && <span className="text-xs text-muted-foreground">{p.internal_sku}</span>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
