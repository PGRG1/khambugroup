import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useVenueScope } from "@/hooks/useVenueScope";
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
import { usePurchasingMode } from "@/hooks/usePurchasingMode";
import { format, parseISO } from "date-fns";

const STATUS_LABEL: Record<Status, string> = { draft: "Draft", approved: "Approved", sent: "Sent", partial: "Partly received", received: "Received", cancelled: "Cancelled" };
const STATUS_TONE: Record<Status, string> = { draft: "text-muted-foreground", approved: "text-warning", sent: "text-warning", partial: "text-warning", received: "text-success", cancelled: "text-muted-foreground" };
const PROGRESS = ["Draft", "Approved", "Sent", "Received"] as const;
const progressIndex = (st: Status) => ({ draft: 0, approved: 1, sent: 2, partial: 3, received: 3, cancelled: 0 } as Record<Status, number>)[st];

type Status = "draft" | "approved" | "sent" | "partial" | "received" | "cancelled";

const STATUS_FLOW: Record<Status, { next?: Status; label?: string }> = {
  draft: { next: "approved", label: "Approve" },
  approved: { next: "sent", label: "Mark as sent" },
  sent: { next: "received", label: "Mark received" },
  partial: { next: "received", label: "Mark received" },
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
  const venueScope = useVenueScope();
  const venueFilter: string = "all"; const setVenueFilter = (_v: string) => {};
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
      if (!venueScope.includesName(p.venue)) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!p.po_number.toLowerCase().includes(q) && !supplierName(p.supplier_id).toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [pos, supplierFilter, venueScope.includesName, statusFilter, search, suppliers]);

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

  const { mode } = usePurchasingMode();
  const byVenue = mode === "by_venue";
  const [venuePick, setVenuePick] = useState("all");
  const [page, setPage] = useState(0);
  const [received, setReceived] = useState<Record<string, number> | null>(null);

  const tabCounts = useMemo(() => {
    const by = (...st: Status[]) => pos.filter((p) => st.includes(p.status)).length;
    return { all: pos.length, draft: by("draft"), approved: by("approved"), sent: by("sent", "partial"), received: by("received"), cancelled: by("cancelled") };
  }, [pos]);
  const tabs: { key: string; label: string; count: number }[] = [
    { key: "all", label: "All", count: tabCounts.all },
    { key: "draft", label: "Draft", count: tabCounts.draft },
    { key: "approved", label: "Approved", count: tabCounts.approved },
    { key: "sent", label: "Sent", count: tabCounts.sent },
    { key: "received", label: "Received", count: tabCounts.received },
    ...(tabCounts.cancelled ? [{ key: "cancelled", label: "Cancelled", count: tabCounts.cancelled }] : []),
  ];

  const rows = useMemo(() => filtered.filter((p) => {
    if (statusFilter === "sent" && !["sent", "partial"].includes(p.status)) return false;
    if (byVenue && venuePick !== "all" && p.venue !== venuePick) return false;
    return true;
  }), [filtered, statusFilter, byVenue, venuePick]);
  useEffect(() => setPage(0), [statusFilter, search, supplierFilter, venuePick]);
  const PAGE = 25;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE));
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);

  useEffect(() => {
    if (!selectedItems.length) { setReceived(null); return; }
    let live = true;
    supabase.from("grn_items").select("po_item_id, quantity_received").in("po_item_id", selectedItems.map((i) => i.id)).then(({ data }) => {
      if (!live) return;
      const m: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { if (r.po_item_id) m[r.po_item_id] = (m[r.po_item_id] ?? 0) + (Number(r.quantity_received) || 0); });
      setReceived(m);
    });
    return () => { live = false; };
  }, [selectedItems]);

  const shortDate = (d: string | null) => (d ? format(parseISO(d), "d MMM") : "—");
  const newPoButton = canManage ? <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> New PO</Button> : null;
  const supName = suppliers.find((s) => s.id === supplierId)?.name;
  const statusText = (st: Status) => <span className={cn("text-xs font-medium", STATUS_TONE[st])}>{STATUS_LABEL[st]}</span>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">Purchase Orders</h1>
        {newPoButton}
      </div>

      {!loading && pos.length === 0 ? (
        <div className="card-glass rounded-xl border border-border/60 p-8 text-center space-y-3">
          <p className="font-display text-base font-semibold text-foreground">No purchase orders yet</p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">Purchase orders are optional. Use one when you want to agree quantities and prices before the delivery; Bani then checks the delivery and invoice against it.</p>
          {newPoButton}
        </div>
      ) : (<>
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Status">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={statusFilter === t.key} onClick={() => setStatusFilter(t.key)}
              className={cn("rounded-full border px-3 py-1 text-xs transition-colors", statusFilter === t.key ? "border-primary bg-primary text-primary-foreground" : "border-border/70 bg-card/60 text-muted-foreground hover:text-foreground")}>
              {t.label} <span className="td-num ml-1 opacity-80">{t.count}</span>
            </button>
          ))}
        </div>

        <div className="card-glass rounded-xl border border-border/60 overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-border/60 p-3 sm:flex-row">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search PO # or supplier" className="h-9 pl-8" />
            </div>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="h-9 sm:w-48" aria-label="Supplier"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All suppliers</SelectItem>
                {suppliers.filter((s) => s.id).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {byVenue && (
              <Select value={venuePick} onValueChange={setVenuePick}>
                <SelectTrigger className="h-9 sm:w-40" aria-label="Venue"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All venues</SelectItem>
                  {activeVenueNames.filter(Boolean).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          {loading ? <div className="h-40 animate-pulse bg-card/40" /> : rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No purchase orders match.</p>
          ) : isMobile ? (
            <ul className="divide-y divide-border/60">
              {pageRows.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => openDetail(p)} className="w-full px-3 py-2.5 text-left hover:bg-muted/40">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{p.suppliers?.name ?? supplierName(p.supplier_id)}</span>
                      <span className="td-num shrink-0 text-sm">{fmtMoney(p.total_amount)}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{p.po_number} · {shortDate(p.expected_date)} · {statusText(p.status)}</div>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>PO #</TableHead><TableHead>Supplier</TableHead>{byVenue && <TableHead>Venue</TableHead>}
                <TableHead>Delivery</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {pageRows.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => openDetail(p)}>
                    <TableCell className="td-num text-sm">{p.po_number}</TableCell>
                    <TableCell className="text-sm">{p.suppliers?.name ?? supplierName(p.supplier_id)}</TableCell>
                    {byVenue && <TableCell className="text-sm">{p.venue}</TableCell>}
                    <TableCell className="text-sm">{shortDate(p.expected_date)}</TableCell>
                    <TableCell className="td-num text-right text-sm">{fmtMoney(p.total_amount)}</TableCell>
                    <TableCell>{statusText(p.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {pageCount > 1 && (
            <div className="flex items-center justify-end gap-2 border-t border-border/60 p-2 text-xs text-muted-foreground">
              <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
              <span>Page {page + 1} of {pageCount}</span>
              <Button size="sm" variant="ghost" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </div>
      </>)}

      {/* New PO */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) resetCreate(); }}>
        <DialogContent className="max-w-[720px] w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New purchase order</DialogTitle></DialogHeader>
          <div className={cn("grid gap-3", byVenue ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
            <div><Label className="text-xs">Supplier</Label>
              <Select value={supplierId} onValueChange={(v) => { setSupplierId(v); setLines([]); }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Pick supplier" /></SelectTrigger>
                <SelectContent>{activeSuppliers.filter((s) => s.id).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Delivery date</Label><Input type="date" className="h-9" value={expected} onChange={(e) => setExpected(e.target.value)} /></div>
            {byVenue && <div><Label className="text-xs">Venue</Label>
              <Select value={venue} onValueChange={setVenue}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Pick venue" /></SelectTrigger>
                <SelectContent>{activeVenueNames.filter(Boolean).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>}
          </div>
          <div><Label className="text-xs">Note to supplier</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

          <div className="space-y-2">
            {lines.length > 0 && (
              <div className="space-y-2">
                <div className="hidden sm:grid grid-cols-[1fr_70px_60px_90px_90px_28px] gap-2 text-xs text-muted-foreground">
                  <span>Item</span><span>Qty</span><span>Unit</span><span>Price</span><span className="text-right">Amount</span><span />
                </div>
                {lines.map((l) => (
                  <div key={l.key} className="grid grid-cols-[1fr_28px] sm:grid-cols-[1fr_70px_60px_90px_90px_28px] gap-2 items-center rounded-lg border border-border/50 p-2 sm:border-0 sm:p-0">
                    <div className="min-w-0"><ProductPicker products={supplierProducts} value={l.product_master_id} onChange={(id) => onPickProduct(l.key, id)} /></div>
                    <button type="button" aria-label="Remove line" onClick={() => removeLine(l.key)} className="sm:order-last text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                    <div className="col-span-2 grid grid-cols-4 gap-2 items-center sm:contents">
                      <Input type="number" aria-label="Quantity" className="h-8 td-num" value={l.quantity_ordered} onChange={(e) => updateLine(l.key, { quantity_ordered: Number(e.target.value) })} />
                      <span className="text-xs text-muted-foreground truncate">{l.unit}</span>
                      <Input type="number" aria-label="Price" className="h-8 td-num" value={l.unit_price} onChange={(e) => updateLine(l.key, { unit_price: Number(e.target.value) })} />
                      <span className="td-num text-right text-sm">{fmtPrice((Number(l.quantity_ordered) || 0) * (Number(l.unit_price) || 0))}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {supplierId ? (
              <button type="button" onClick={addLine} className="text-sm text-primary hover:underline">+ Add item from {supName}'s list</button>
            ) : <p className="text-xs text-muted-foreground">Pick a supplier to add items.</p>}
          </div>

          <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between border-t border-border/60 pt-3">
            <span className="text-sm">Total <span className="td-num font-semibold">{fmtPrice(draftTotal)}</span></span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={saving} onClick={handleCreate}>Save draft</Button>
              <Button size="sm" disabled={saving} onClick={handleCreate}>Create PO</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Open a PO */}
      <Dialog open={!!selectedPo} onOpenChange={(o) => { if (!o) { setSelectedPo(null); setSelectedItems([]); } }}>
        <DialogContent className="max-w-[640px] w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto">
          {selectedPo && (<>
            <DialogHeader>
              <DialogTitle>{selectedPo.po_number} · {selectedPo.suppliers?.name ?? supplierName(selectedPo.supplier_id)}</DialogTitle>
              <p className="text-sm text-muted-foreground">Delivery {fmtDate(selectedPo.expected_date)} · <span className="td-num">{fmtMoney(selectedPo.total_amount)}</span></p>
            </DialogHeader>
            {selectedPo.status === "cancelled" ? (
              <span className="w-fit rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">Cancelled</span>
            ) : (
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                {PROGRESS.map((step, i) => {
                  const cur = progressIndex(selectedPo.status);
                  const done = i < cur || (i === cur && selectedPo.status === "received");
                  const current = i === cur && !done;
                  return <li key={step} className="flex items-center gap-2">
                    {i > 0 && <span className="text-muted-foreground">→</span>}
                    <span className={cn("flex items-center gap-1", done ? "text-success" : current ? "font-semibold text-foreground" : "text-muted-foreground")}>
                      {done && <Check className="h-3.5 w-3.5" />}{step === "Received" && selectedPo.status === "partial" ? "Partly received" : step}
                    </span>
                  </li>;
                })}
              </ol>
            )}
            <Table>
              <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Ordered</TableHead><TableHead className="text-right">Received</TableHead></TableRow></TableHeader>
              <TableBody>
                {selectedItems.map((it) => {
                  const got = received?.[it.id];
                  const short = got !== undefined ? Math.max(0, Number(it.quantity_ordered) - got) : 0;
                  return <TableRow key={it.id}>
                    <TableCell className="text-sm">{it.description}</TableCell>
                    <TableCell className="td-num text-right text-sm">{it.quantity_ordered} {it.unit}</TableCell>
                    <TableCell className={cn("td-num text-right text-sm", short > 0 && "text-warning")}>
                      {got === undefined ? "—" : got}{short > 0 && <span className="ml-1 text-xs">({short} short)</span>}
                    </TableCell>
                  </TableRow>;
                })}
              </TableBody>
            </Table>
            {selectedPo.notes && <p className="text-sm text-muted-foreground">Note: {selectedPo.notes}</p>}
            {canManage && selectedPo.status !== "received" && selectedPo.status !== "cancelled" && (
              <DialogFooter className="flex-row justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={cancelPo}>Cancel PO</Button>
                {next?.next && <Button size="sm" onClick={() => advanceStatus(next.next!)}>{next.label}</Button>}
              </DialogFooter>
            )}
          </>)}
        </DialogContent>
      </Dialog>
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
