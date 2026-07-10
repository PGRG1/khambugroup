import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, X, Trash2, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVenues } from "@/hooks/useVenues";
import { useActiveTenant } from "@/hooks/useActiveTenant";

type Status = "draft" | "approved" | "sent" | "partial" | "received" | "cancelled";

const STATUS_FLOW: Record<Status, { next?: Status; label?: string }> = {
  draft: { next: "approved", label: "Approve" },
  approved: { next: "sent", label: "Mark as Sent" },
  sent: { next: "received", label: "Mark Received" },
  partial: { next: "received", label: "Mark Received" },
  received: {},
  cancelled: {},
};

const statusBadge = (s: Status) => {
  const map: Record<Status, string> = {
    draft: "bg-muted text-muted-foreground border-border",
    approved: "bg-info/10 text-info border-info/30",
    sent: "bg-warning/10 text-warning border-warning/30",
    partial: "bg-warning/10 text-warning border-warning/30",
    received: "bg-primary/10 text-primary border-primary/25",
    cancelled: "bg-destructive/10 text-destructive border-destructive/25",
  };
  return map[s];
};

const fmtMoneyWhole = (n: number) => `HK$ ${Math.round(n || 0).toLocaleString("en-US")}`;
const fmtPrice = (n: number) => `HK$ ${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtMoney = fmtMoneyWhole;
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

interface Supplier { id: string; name: string; is_active: boolean }
interface Product { id: string; internal_product_name: string; supplier_product_name?: string | null; internal_sku?: string | null; unit?: string | null; unit_cost?: number | null }
interface ProductSupplierRow { product_master_id: string; supplier: string; purchase_unit: string | null; purchase_unit_cost: number | null }
interface POItem { id: string; po_id: string; product_master_id: string; description: string; quantity_ordered: number; unit: string; unit_price: number; total: number }
interface PO {
  id: string; po_number: string; supplier_id: string; venue: string; status: Status;
  requested_date: string | null; expected_date: string | null; notes: string | null;
  total_amount: number; created_by: string; created_at: string; updated_at: string;
  suppliers?: { name: string } | null;
}

interface DraftLine {
  key: string;
  product_master_id: string;
  description: string;
  quantity_ordered: number;
  unit: string;
  unit_price: number;
}

export default function PurchaseOrdersTab() {
  const { user, isAdmin } = useAuth();
  const { tenantId } = useActiveTenant();
  const { venues: dbVenues } = useVenues();
  const activeVenueNames = useMemo(() => dbVenues.filter((v) => v.is_active).map((v) => v.name), [dbVenues]);
  const [pos, setPos] = useState<PO[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [psRows, setPsRows] = useState<ProductSupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();

  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [venueFilter, setVenueFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedPo, setSelectedPo] = useState<PO | null>(null);
  const [selectedItems, setSelectedItems] = useState<POItem[]>([]);
  const [isManager, setIsManager] = useState(false);

  // create form
  const [supplierId, setSupplierId] = useState("");
  const [venue, setVenue] = useState<string>("");
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);

  // Default the create-form venue to the first active master venue whenever list resolves
  useEffect(() => {
    if (!venue && activeVenueNames.length) setVenue(activeVenueNames[0]);
  }, [activeVenueNames, venue]);

  const loadAll = async () => {
    if (!tenantId) return;
    setLoading(true);
    const [poRes, supRes, prodRes, psRes] = await Promise.all([
      supabase.from("purchase_orders").select("*, suppliers(name)").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
      supabase.from("suppliers").select("id,name,is_active").eq("tenant_id", tenantId).order("name"),
      supabase.from("product_master").select("id, internal_product_name, supplier_product_name, internal_sku, unit, unit_cost").eq("tenant_id", tenantId).order("internal_product_name"),
      supabase.from("product_suppliers").select("product_master_id, supplier, purchase_unit, purchase_unit_cost").eq("tenant_id", tenantId),
    ]);
    if (poRes.error) toast.error(poRes.error.message);
    setPos((poRes.data ?? []) as any);
    setSuppliers((supRes.data ?? []) as Supplier[]);
    setProducts((prodRes.data ?? []) as Product[]);
    setPsRows((psRes.data ?? []) as ProductSupplierRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!tenantId) return;
    loadAll();
    (async () => {
      if (!user) return;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      setIsManager((data ?? []).some((r: any) => r.role === "manager" || r.role === "admin") || isAdmin);
    })();
  }, [user, isAdmin, tenantId]);

  const canManage = isAdmin || isManager;

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    return pos.filter((p) => {
      if (supplierFilter !== "all" && p.supplier_id !== supplierFilter) return false;
      if (venueFilter !== "all" && p.venue !== venueFilter) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!p.po_number.toLowerCase().includes(q) && !supplierName(p.supplier_id).toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [pos, supplierFilter, venueFilter, statusFilter, search, suppliers]);

  const addLine = () => {
    setLines((l) => [...l, { key: crypto.randomUUID(), product_master_id: "", description: "", quantity_ordered: 1, unit: "each", unit_price: 0 }]);
  };

  const removeLine = (k: string) => setLines((l) => l.filter((x) => x.key !== k));

  const updateLine = (k: string, patch: Partial<DraftLine>) => {
    setLines((l) => l.map((x) => (x.key === k ? { ...x, ...patch } : x)));
  };

  const onPickProduct = (k: string, productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    const supName = suppliers.find((s) => s.id === supplierId)?.name;
    const ps = supName ? psRows.find((r) => r.product_master_id === productId && r.supplier === supName) : undefined;
    updateLine(k, {
      product_master_id: productId,
      description: prod.internal_product_name,
      unit: ps?.purchase_unit ?? prod.unit ?? "each",
      unit_price: ps?.purchase_unit_cost ?? prod.unit_cost ?? 0,
    });
  };

  const supplierProducts = useMemo(() => {
    const supName = suppliers.find((s) => s.id === supplierId)?.name;
    if (!supName) return [];
    const ids = new Set(psRows.filter((r) => r.supplier === supName).map((r) => r.product_master_id));
    return products.filter((p) => ids.has(p.id));
  }, [supplierId, suppliers, psRows, products]);

  const draftTotal = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.quantity_ordered) || 0) * (Number(l.unit_price) || 0), 0),
    [lines]
  );

  const resetCreate = () => {
    setSupplierId(""); setVenue(activeVenueNames[0] ?? ""); setExpected(""); setNotes(""); setLines([]);
  };

  const handleCreate = async () => {
    if (!supplierId) return toast.error("Pick a supplier");
    if (!venue) return toast.error("Pick a venue");
    const validLines = lines.filter((l) => l.product_master_id);
    if (!validLines.length) return toast.error("Add at least one line item");
    if (!user) return toast.error("Not signed in");
    setSaving(true);
    const { data: po, error } = await supabase
      .from("purchase_orders")
      .insert({
        supplier_id: supplierId,
        venue,
        expected_date: expected || null,
        notes: notes || null,
        total_amount: draftTotal,
        created_by: user.id,
        status: "draft",
        tenant_id: tenantId,
      } as any)
      .select()
      .single();
    if (error || !po) { setSaving(false); return toast.error(error?.message ?? "Failed"); }
    const itemsPayload = validLines.map((l) => ({
      po_id: po.id,
      product_master_id: l.product_master_id,
      description: l.description,
      quantity_ordered: Number(l.quantity_ordered) || 0,
      unit: l.unit || "each",
      unit_price: Number(l.unit_price) || 0,
    }));
    const { error: itemsErr } = await supabase.from("purchase_order_items").insert(itemsPayload);
    if (itemsErr) {
      await supabase.from("purchase_orders").delete().eq("id", po.id);
      setSaving(false);
      return toast.error(itemsErr.message);
    }
    toast.success(`Created ${po.po_number}`);
    setSaving(false);
    setCreateOpen(false);
    resetCreate();
    loadAll();
  };

  const openDetail = async (po: PO) => {
    setSelectedPo(po);
    const { data } = await supabase.from("purchase_order_items").select("*").eq("po_id", po.id);
    setSelectedItems((data ?? []) as POItem[]);
  };

  const advanceStatus = async (next: Status) => {
    if (!selectedPo) return;
    const { error } = await supabase.from("purchase_orders").update({ status: next }).eq("id", selectedPo.id);
    if (error) return toast.error(error.message);
    toast.success(`Status → ${next}`);
    setSelectedPo({ ...selectedPo, status: next });
    loadAll();
  };

  const cancelPo = async () => {
    if (!selectedPo) return;
    const { error } = await supabase.from("purchase_orders").update({ status: "cancelled" }).eq("id", selectedPo.id);
    if (error) return toast.error(error.message);
    toast.success("Cancelled");
    setSelectedPo({ ...selectedPo, status: "cancelled" });
    loadAll();
  };

  const activeSuppliers = suppliers.filter((s) => s.is_active);
  const next = selectedPo ? STATUS_FLOW[selectedPo.status] : undefined;

  const stats = useMemo(() => {
    const by = (s: Status) => pos.filter(p => p.status === s).length;
    return {
      total: pos.length,
      draft: by("draft"),
      sent: by("sent") + by("approved") + by("partial"),
      received: by("received"),
      cancelled: by("cancelled"),
    };
  }, [pos]);

  const toggleStatusFilter = (v: string) => setStatusFilter(prev => prev === v ? "all" : v);

  const scopeLabel = useMemo(() => {
    const parts: string[] = [];
    parts.push(supplierFilter === "all" ? "All suppliers" : supplierName(supplierFilter));
    parts.push(venueFilter === "all" ? "All venues" : venueFilter);
    parts.push(statusFilter === "all" ? "All statuses" : statusFilter);
    return parts.join(" · ");
  }, [supplierFilter, venueFilter, statusFilter, suppliers]);

  const StatTile = ({ label, value, tone, filterValue }: { label: string; value: number; tone?: "warn" | "primary" | "danger"; filterValue?: string }) => {
    const active = filterValue && statusFilter === filterValue;
    const toneCls = tone === "warn" ? "text-warning" : tone === "primary" ? "text-primary" : tone === "danger" ? "text-destructive" : "text-foreground";
    return (
      <button
        type="button"
        onClick={filterValue ? () => toggleStatusFilter(filterValue) : undefined}
        disabled={!filterValue}
        className={cn(
          "text-left rounded-lg border border-border/60 bg-card/50 px-3 py-2 transition-colors",
          filterValue ? "hover:border-border cursor-pointer" : "cursor-default",
          active && "ring-2 ring-primary/60 bg-primary/5",
        )}
      >
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</div>
        <div className={`text-lg font-semibold tabular-nums mt-0.5 ${toneCls}`}>{value.toLocaleString()}</div>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-[64px] rounded-lg border border-border/60 bg-card/40 animate-pulse" />)
        ) : (
          <>
            <StatTile label="Total" value={stats.total} />
            <StatTile label="Draft" value={stats.draft} filterValue="draft" />
            <StatTile label="Sent / Pending" value={stats.sent} tone="warn" filterValue="sent" />
            <StatTile label="Received" value={stats.received} tone="primary" filterValue="received" />
            <StatTile label="Cancelled" value={stats.cancelled} tone="danger" filterValue="cancelled" />
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-end justify-between">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="w-48">
            <Label className="text-xs">Supplier</Label>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All suppliers</SelectItem>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Label className="text-xs">Venue</Label>
            <Select value={venueFilter} onValueChange={setVenueFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All venues</SelectItem>
                {activeVenueNames.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-40">
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {(["draft","approved","sent","partial","received","cancelled"] as Status[]).map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-56">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="PO# or supplier" className="pl-7 h-9" />
            </div>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} disabled={!canManage} className="h-9">
          <Plus className="h-4 w-4 mr-1" /> New PO
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {scopeLabel} · <span className="tabular-nums">{filtered.length.toLocaleString()}</span> of <span className="tabular-nums">{pos.length.toLocaleString()}</span> POs
      </p>

      {loading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-11 rounded-md border border-border/60 bg-card/40 animate-pulse" />)}
        </div>
      ) : isMobile ? (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm rounded-xl border border-border/60 bg-card/40">No purchase orders</div>
          ) : filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => openDetail(p)}
              className="w-full text-left rounded-lg border border-border/60 bg-card/50 p-3 hover:border-border transition-colors min-h-[64px]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-sm font-medium">{p.po_number}</div>
                  <div className="text-xs text-muted-foreground truncate">{p.suppliers?.name ?? supplierName(p.supplier_id)} · {p.venue}</div>
                </div>
                <Badge variant="outline" className={cn("capitalize shrink-0", statusBadge(p.status))}>{p.status}</Badge>
              </div>
              <div className="flex items-center justify-between mt-2 text-xs">
                <span className="text-muted-foreground">Exp: {fmtDate(p.expected_date)}</span>
                <span className="font-semibold tabular-nums">{fmtMoney(Number(p.total_amount))}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Venue</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expected Date</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead>Created At</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No purchase orders</TableCell></TableRow>
              ) : filtered.map((p) => (
                <TableRow key={p.id} className="cursor-pointer hover:bg-accent/40" onClick={() => openDetail(p)}>
                  <TableCell className="font-mono">{p.po_number}</TableCell>
                  <TableCell>{p.suppliers?.name ?? supplierName(p.supplier_id)}</TableCell>
                  <TableCell>{p.venue}</TableCell>
                  <TableCell><Badge variant="outline" className={cn("capitalize", statusBadge(p.status))}>{p.status}</Badge></TableCell>
                  <TableCell>{fmtDate(p.expected_date)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{fmtMoney(Number(p.total_amount))}</TableCell>
                  <TableCell>{fmtDate(p.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}


      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetCreate(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Supplier</Label>
              <Select value={supplierId} onValueChange={(v) => { setSupplierId(v); setLines([]); }}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {activeSuppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Venue</Label>
              <Select value={venue} onValueChange={setVenue}>
                <SelectTrigger><SelectValue placeholder="Select venue" /></SelectTrigger>
                <SelectContent>
                  {activeVenueNames.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Expected Date</Label>
              <Input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line Items</Label>
              <Button size="sm" variant="outline" onClick={addLine} disabled={!supplierId}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add line
              </Button>
            </div>
            <div className="border border-border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Product</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">No lines yet</TableCell></TableRow>
                  ) : lines.map((l) => (
                    <TableRow key={l.key}>
                      <TableCell>
                        <ProductPicker
                          products={supplierProducts}
                          value={l.product_master_id}
                          onChange={(id) => onPickProduct(l.key, id)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input value={l.unit} onChange={(e) => updateLine(l.key, { unit: e.target.value })} className="h-8 w-20" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" step="0.01" value={l.quantity_ordered}
                          onChange={(e) => updateLine(l.key, { quantity_ordered: parseFloat(e.target.value) || 0 })}
                          className="h-8 w-24 text-right td-num ml-auto" />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" step="0.01" value={l.unit_price}
                          onChange={(e) => updateLine(l.key, { unit_price: parseFloat(e.target.value) || 0 })}
                          className="h-8 w-28 text-right td-num ml-auto" />
                      </TableCell>
                      <TableCell className="text-right td-num">
                        {fmtMoney((Number(l.quantity_ordered) || 0) * (Number(l.unit_price) || 0))}
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => removeLine(l.key)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end items-baseline gap-3 pr-2">
              <span className="text-sm text-muted-foreground">Running total</span>
              <span className="text-lg font-semibold td-num">{fmtMoney(draftTotal)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Saving…" : "Create PO"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Slide-over detail */}
      {selectedPo && (
        <div className="fixed inset-0 z-50 bg-black/60" onClick={() => setSelectedPo(null)}>
          <div
            className="absolute right-0 top-0 h-full w-full max-w-2xl bg-background border-l border-border shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-5 border-b border-border">
              <div>
                <h2 className="text-xl font-display font-semibold">{selectedPo.po_number}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {selectedPo.suppliers?.name ?? supplierName(selectedPo.supplier_id)} · {selectedPo.venue}
                </p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setSelectedPo(null)}><X className="h-4 w-4" /></Button>
            </div>

            <div className="p-5 space-y-5">
              {/* Status workflow strip */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Workflow</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  {(["draft","approved","sent","received"] as Status[]).map((s, i, arr) => {
                    const active = selectedPo.status === s;
                    const past = arr.indexOf(selectedPo.status as Status) > i;
                    return (
                      <React.Fragment key={s}>
                        <div className={cn(
                          "px-3 py-1 rounded-md text-xs border capitalize",
                          active ? statusBadge(s) : past ? "bg-primary/10 text-primary/80 border-primary/25" : "bg-muted text-muted-foreground border-border"
                        )}>
                          {past && <Check className="h-3 w-3 inline mr-1" />}{s}
                        </div>
                        {i < arr.length - 1 && <span className="text-muted-foreground">→</span>}
                      </React.Fragment>
                    );
                  })}
                </div>
                <div className="flex gap-2 pt-1">
                  {next?.next && selectedPo.status !== "cancelled" && (
                    <Button size="sm" disabled={!canManage} onClick={() => advanceStatus(next.next!)}>{next.label}</Button>
                  )}
                  {selectedPo.status !== "received" && selectedPo.status !== "cancelled" && (
                    <Button size="sm" variant="destructive" disabled={!canManage} onClick={cancelPo}>Cancel PO</Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <Field label="Status"><Badge variant="outline" className={cn("capitalize", statusBadge(selectedPo.status))}>{selectedPo.status}</Badge></Field>
                <Field label="Total"><span className="td-num font-semibold">{fmtMoney(Number(selectedPo.total_amount))}</span></Field>
                <Field label="Requested">{fmtDate(selectedPo.requested_date)}</Field>
                <Field label="Expected">{fmtDate(selectedPo.expected_date)}</Field>
                <Field label="Created">{fmtDate(selectedPo.created_at)}</Field>
                <Field label="Updated">{fmtDate(selectedPo.updated_at)}</Field>
                {selectedPo.notes && <div className="col-span-2"><Field label="Notes">{selectedPo.notes}</Field></div>}
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Line Items</Label>
                <div className="border border-border rounded-md mt-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedItems.map((it) => (
                        <TableRow key={it.id}>
                          <TableCell>{it.description}</TableCell>
                          <TableCell>{it.unit}</TableCell>
                          <TableCell className="text-right td-num">{Number(it.quantity_ordered)}</TableCell>
                          <TableCell className="text-right td-num">{fmtMoney(Number(it.unit_price))}</TableCell>
                          <TableCell className="text-right td-num">{fmtMoney(Number(it.total))}</TableCell>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function ProductPicker({ products, value, onChange }: { products: Product[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = products.find((p) => p.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between h-8 font-normal">
          <span className="truncate">{current ? current.internal_product_name : "Select product…"}</span>
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
