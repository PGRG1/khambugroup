import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useVenueScope } from "@/hooks/useVenueScope";
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
import { Plus, X, Trash2, ChevronsUpDown, Download, MoreHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RevenuePageTop } from "@/components/revenue/RevenuePageTop";
import { Toolbar, FilterPanel, FilterGroup, SortMenu } from "@/components/kit";
import { usePeriodFilter } from "@/hooks/usePeriodFilter";
import { shortDay } from "@/utils/salesRecordChecks";
import { formatDate, formatTableCurrency, formatTableInteger, formatDecimal } from "@/utils/format";
import ProcurementInvoicesTab, { type InvoiceWorkflowControls } from "./ProcurementInvoicesTab";
import { cn } from "@/lib/utils";
import { backfillGrnsFromInvoices } from "@/utils/backfillGrnsFromInvoices";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { usePagination } from "@/components/common/data-table";
import { downloadCSV } from "@/utils/csvDownload";
import { useVenues } from "@/hooks/useVenues";
import { DeliveryCheckDialog, type DeliveryCheckTarget } from "@/components/procurement/DeliveryCheckDialog";
import { AlertTriangle } from "lucide-react";

type GrnStatus = "draft" | "confirmed" | "disputed";

const fmtMoneyWhole = (n: number) => `HK$ ${Math.round(n || 0).toLocaleString("en-US")}`;
const fmtMoney = fmtMoneyWhole;
const fmtPrice = (n: number) => `HK$ ${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

interface GrnStat { total: number; lines: number; short: number }
const receivedQty = (r: any) => Number(r.accepted_qty ?? r.quantity_received ?? 0);
const lineDiffers = (r: any) => r.quantity_invoiced != null && Math.abs(receivedQty(r) - Number(r.quantity_invoiced)) > 1e-9;
/** Plain-word delivery status and its tone. */
export function grnStatusWords(status: string, short: number): { label: string; tone: string } {
  if (status === "draft") return { label: "Draft", tone: "text-muted-foreground" };
  if (status === "disputed") return { label: "Disputed", tone: "text-warning" };
  if (short > 0) return { label: `${short} line${short === 1 ? "" : "s"} short`, tone: "text-warning" };
  return { label: "Received", tone: "text-primary" };
}

interface Supplier { id: string; name: string; is_active: boolean }
interface Product { id: string; internal_product_name: string; internal_sku?: string | null; unit?: string | null; unit_cost?: number | null }
interface PORow { id: string; po_number: string; supplier_id: string; venue: string; status: string }
interface POItem { id: string; po_id: string; product_master_id: string | null; description: string; quantity_ordered: number; unit: string; unit_price: number }
interface InvoiceRow { id: string; invoice_number: string; supplier_id: string; supplier_name: string; venue: string; invoice_date: string }
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
  return <ProcurementInvoicesTab renderRegister={controls => <GoodsReceived controls={controls} />} />;
}

function GoodsReceived({ controls }: { controls: InvoiceWorkflowControls }) {
  const { user, isAdmin } = useAuth();
  const { tenantId } = useActiveTenant();
  const { venues: dbVenues } = useVenues();
  const activeVenueNames = useMemo(() => dbVenues.filter((v) => v.is_active).map((v) => v.name), [dbVenues]);
  const [grns, setGrns] = useState<GRN[]>([]);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<{ done: number; total: number } | null>(null);
  const [grnTotals, setGrnTotals] = useState<Record<string, number>>({});
  const [grnStats, setGrnStats] = useState<Record<string, GrnStat>>({});
  const [sort, setSort] = useState("newest");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pos, setPos] = useState<PORow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isManager, setIsManager] = useState(false);

  const [supplierFilter, setSupplierFilter] = useState("all");
  const venueScope = useVenueScope();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  // create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [linkedPoId, setLinkedPoId] = useState<string | null>(null);
  const [linkedInvoiceId, setLinkedInvoiceId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [venue, setVenue] = useState<string>("");
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<GRNItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDlgOpen, setConfirmDlgOpen] = useState(false);
  const [hasPrefilled, setHasPrefilled] = useState(false);

  // detail panel
  const [selected, setSelected] = useState<GRN | null>(null);
  const [selectedItems, setSelectedItems] = useState<GRNItem[]>([]);
  const [problemTarget, setProblemTarget] = useState<DeliveryCheckTarget | null>(null);

  const loadAll = async () => {
    if (!tenantId) return;
    setLoading(true);
    const [grnRows, allItems, supRes, prodRes, poRes, invRows] = await Promise.all([
      fetchAllRows("goods_received_notes", "*, suppliers(name), purchase_orders(po_number), invoices!invoice_id(invoice_number)", { col: "created_at", asc: false }, tenantId),
      fetchAllRows("grn_items", "grn_id, total, quantity_invoiced, quantity_received, accepted_qty", undefined, tenantId),
      supabase.from("suppliers").select("id,name,is_active").eq("tenant_id", tenantId).order("name"),
      supabase.from("product_master").select("id, internal_product_name, internal_sku, unit, unit_cost").eq("tenant_id", tenantId).order("internal_product_name"),
      supabase.from("purchase_orders" as any).select("id, po_number, supplier_id, venue, status").eq("tenant_id", tenantId).in("status", ["approved", "sent"]).order("created_at", { ascending: false }),
      fetchAllRows("invoices", "id, invoice_number, supplier_id, venue, invoice_date, created_at", { col: "created_at", asc: false }, tenantId),
    ]);
    setGrns((grnRows ?? []) as any);
    const totals: Record<string, number> = {};
    const stats: Record<string, GrnStat> = {};
    for (const r of (allItems ?? []) as any[]) {
      totals[r.grn_id] = (totals[r.grn_id] || 0) + Number(r.total || 0);
      const st = stats[r.grn_id] ??= { total: 0, lines: 0, short: 0 };
      st.total += Number(r.total || 0); st.lines += 1; if (lineDiffers(r)) st.short += 1;
    }
    setGrnTotals(totals);
    setGrnStats(stats);
    const sups = (supRes.data ?? []) as Supplier[];
    setSuppliers(sups);
    setProducts((prodRes.data ?? []) as Product[]);
    setPos((poRes.data ?? []) as unknown as PORow[]);
    const supMap = new Map(sups.map((s) => [s.id, s.name]));
    setInvoices(((invRows ?? []) as any[]).map((i) => ({
      id: i.id, invoice_number: i.invoice_number, supplier_id: i.supplier_id,
      supplier_name: supMap.get(i.supplier_id) || "—", venue: i.venue,
      invoice_date: i.invoice_date,
    })));
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

  const period = usePeriodFilter(grns.map((g) => g.received_date || ""), "MTD");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return grns.filter((g) => {
      if (supplierFilter !== "all" && g.supplier_id !== supplierFilter) return false;
      if (!venueScope.includesName(g.venue)) return false;
      if (statusFilter !== "all" && g.status !== statusFilter) return false;
      if (!period.inPeriod(g.received_date)) return false;
      if (q) {
        const hay = [
          g.grn_number,
          g.suppliers?.name ?? supplierName(g.supplier_id),
          g.purchase_orders?.po_number ?? "",
          g.invoices?.invoice_number ?? "",
          g.venue,
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      const name = (g: GRN) => g.suppliers?.name ?? supplierName(g.supplier_id);
      if (sort === "oldest") return (a.received_date || "").localeCompare(b.received_date || "");
      if (sort === "value") return (grnTotals[b.id] || 0) - (grnTotals[a.id] || 0);
      if (sort === "supplier") return name(a).localeCompare(name(b));
      return (b.received_date || "").localeCompare(a.received_date || "") || (b.created_at || "").localeCompare(a.created_at || "");
    });
  }, [grns, suppliers, supplierFilter, venueScope.includesName, statusFilter, period.inPeriod, search, sort, grnTotals]);

  const shortOf = (g: GRN) => grnStats[g.id]?.short || 0;
  const isShort = (g: GRN) => g.status === "disputed" || shortOf(g) > 0;
  const kpis = useMemo(() => ({
    total: filtered.length,
    value: filtered.reduce((s, g) => s + (grnTotals[g.id] || 0), 0),
    short: filtered.filter(isShort).length,
  }), [filtered, grnTotals, grnStats]);

  const resetForm = () => {
    setLinkedPoId(null);
    setLinkedInvoiceId(null);
    setSupplierId("");
    setVenue(activeVenueNames[0] ?? "");
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
    if (activeVenueNames.includes(po.venue)) setVenue(po.venue);
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
    if (activeVenueNames.includes(inv.venue)) setVenue(inv.venue);
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

  const resetFilters = () => { setSupplierFilter("all"); setStatusFilter("all"); };

  const runBackfill = async () => {
    if (!tenantId || !user) return;
    if (!window.confirm("Backfill GRNs for every invoice without one? This is a one-off historical migration.")) return;
    setBackfilling(true);
    setBackfillProgress({ done: 0, total: 0 });
    try {
      const summary = await backfillGrnsFromInvoices({
        tenantId, userId: user.id,
        onProgress: (done, total) => setBackfillProgress({ done, total }),
      });
      toast.success(
        `Backfill complete: ${summary.created} created, ${summary.skipped} skipped, ${summary.failed} failed. ` +
        `Remaining without GRN: ${summary.remainingWithoutGrn}. Total GRNs: ${summary.grnCount}.`,
        { duration: 10000 },
      );
      if (summary.failed > 0) console.error("Backfill failures:", summary.failures);
      loadAll();
    } catch (e: any) {
      toast.error(`Backfill failed: ${e?.message || String(e)}`);
    } finally {
      setBackfilling(false);
      setBackfillProgress(null);
    }
  };

  const handleDownload = () => downloadCSV(
    filtered.map((g) => ({
      grn_number: g.grn_number,
      supplier: g.suppliers?.name ?? supplierName(g.supplier_id),
      venue: g.venue,
      linked_po: g.purchase_orders?.po_number ?? "",
      linked_invoice: g.invoices?.invoice_number ?? "",
      received_date: fmtDate(g.received_date),
      status: g.status,
      total_value: (grnTotals[g.id] || 0).toFixed(2),
    })),
    [
      { key: "grn_number", label: "GRN Number" },
      { key: "supplier", label: "Supplier" },
      { key: "venue", label: "Venue" },
      { key: "linked_po", label: "Linked PO" },
      { key: "linked_invoice", label: "Linked Invoice" },
      { key: "received_date", label: "Received Date" },
      { key: "status", label: "Status" },
      { key: "total_value", label: "Total Value" },
    ],
    "grns",
  );

  const pag = usePagination(filtered, 25);

  const sortOptions = [{ key: "newest", label: "Newest first", compactLabel: "Newest" }, { key: "oldest", label: "Oldest first", compactLabel: "Oldest" }, { key: "value", label: "Highest value", compactLabel: "Value" }, { key: "supplier", label: "Supplier A–Z", compactLabel: "A–Z" }];
  const filterPanel = (
    <FilterPanel activeCount={Number(supplierFilter !== "all") + Number(statusFilter !== "all")} onReset={resetFilters} width={320}>
      <FilterGroup title="Supplier">
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger aria-label="Supplier"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All suppliers</SelectItem>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      </FilterGroup>
      <FilterGroup title="Status">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger aria-label="Status"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All statuses</SelectItem><SelectItem value="draft">Draft</SelectItem><SelectItem value="confirmed">Confirmed</SelectItem><SelectItem value="disputed">Disputed</SelectItem></SelectContent>
        </Select>
      </FilterGroup>
      <FilterGroup title="Venue">
        <p className="text-[13px] text-muted-foreground">{venueScope.label}</p>
        <div className="flex flex-wrap gap-1.5">{venueScope.venues.map((v) => <Button key={v.id} variant="outline" size="sm" aria-pressed={venueScope.includesId(v.id)} onClick={() => venueScope.toggleVenue(v.id)}>{v.name}</Button>)}</div>
      </FilterGroup>
      <div className="min-[641px]:hidden"><FilterGroup title="Sort"><SortMenu value={sort} onChange={setSort} options={sortOptions} /></FilterGroup></div>
    </FilterPanel>
  );
  useEffect(() => { pag.setPage(1); }, [search, supplierFilter, statusFilter, sort, period.label, venueScope.label]);
  const rowKeys = (open: () => void) => ({ tabIndex: 0, onClick: open, onKeyDown: (e: React.KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } } });
  const nameOf = (g: GRN) => g.suppliers?.name ?? supplierName(g.supplier_id);
  const showMore = canManage || isAdmin;

  return (
    <div className="w-full mx-auto space-y-6 min-w-0 max-[640px]:pb-24">
      <RevenuePageTop title="Goods received" actionsBesideTitle period={period.control}
        actions={showMore ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" className="kit-btn kit-btn-secondary h-9" aria-label="More"><MoreHorizontal className="h-4 w-4 mr-1" />More</Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canManage && <DropdownMenuItem onSelect={() => { resetForm(); setCreateOpen(true); }}><Plus className="h-4 w-4 mr-2" />New GRN</DropdownMenuItem>}
              {isAdmin && <DropdownMenuItem disabled={backfilling || !tenantId || !user} onSelect={() => void runBackfill()}>
                {backfilling ? backfillProgress && backfillProgress.total > 0 ? `Backfilling ${backfillProgress.done}/${backfillProgress.total}…` : "Backfilling…" : "Backfill"}
              </DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : undefined} />
      <div data-invoice-tabs-host />

      <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Goods received records">
        <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5" aria-label="Goods received summary">
          <span>{period.label}</span>
          <span className="text-[13px] text-muted-foreground font-normal">· {formatTableInteger(kpis.total)} deliveries · {formatTableCurrency(kpis.value)} ·</span>
          <span className={`text-[13px] font-normal ${kpis.short > 0 ? "text-warning" : "text-muted-foreground"}`}>{formatTableInteger(kpis.short)} short</span>
        </h2>
        <Toolbar mobileSearchBelow searchAfterControls search={search} onSearch={setSearch} placeholder="Search supplier, invoice # or GRN #"
          filter={filterPanel}
          sort={<div className="max-[640px]:hidden"><SortMenu value={sort} onChange={setSort} options={sortOptions} /></div>}
          downloadControl={<Button variant="outline" size="icon" className="kit-btn kit-tool-btn kit-btn-icon" aria-label="Download goods received" title="Download CSV" onClick={handleDownload}><Download className="h-4 w-4" /></Button>} />

        {loading ? <p className="p-10 text-center text-sm text-muted-foreground">Loading deliveries…</p>
          : !filtered.length ? <p className="p-10 text-center text-sm text-muted-foreground">No deliveries match this period and filters.</p>
          : <>
            <ul className="min-[641px]:hidden divide-y divide-border/60" aria-label="Deliveries">
              {pag.pageItems.map((g) => { const st = grnStatusWords(g.status, shortOf(g)); return (
                <li key={g.id} className="px-2 py-3">
                  <Button variant="ghost" className="block w-full h-auto p-0 text-left font-normal hover:bg-transparent" onClick={() => openDetail(g)}>
                    <span className="flex justify-between gap-2 text-[13px]"><span className="min-w-0 whitespace-normal">{nameOf(g)}</span><span className="td-num shrink-0">{formatTableCurrency(grnTotals[g.id] || 0)}</span></span>
                    <span className="block mt-1 text-xs text-muted-foreground whitespace-normal">{g.received_date ? shortDay(g.received_date) : "—"} · {g.invoices?.invoice_number || "No invoice"} · <span className={st.tone}>{st.label}</span></span>
                  </Button>
                </li>); })}
            </ul>
            <div className="kit hidden min-[641px]:block">
              <table className="sales-table !w-full !table-fixed" aria-label="Deliveries table">
                <thead><tr>
                  <th className="sales-cell-left w-[13%]">Received</th><th className="sales-cell-left">Supplier</th><th className="sales-cell-left w-[17%]">Invoice #</th>
                  <th className="sales-cell-right w-[9%]">Items</th><th className="sales-cell-right w-[14%]">Value</th><th className="sales-cell-left w-[14%]">Status</th>
                </tr></thead>
                <tbody>
                  {pag.pageItems.map((g) => { const st = grnStatusWords(g.status, shortOf(g)); return (
                    <tr key={g.id} className="sales-record-row" {...rowKeys(() => openDetail(g))}>
                      <td className="sales-cell-left">{g.received_date ? shortDay(g.received_date) : "—"}</td>
                      <td className="sales-cell-left !whitespace-normal break-words">{nameOf(g)}</td>
                      <td className="sales-cell-left td-num !whitespace-normal break-all">{g.invoices?.invoice_number || <span className="text-muted-foreground">No invoice</span>}</td>
                      <td className="td-num">{formatTableInteger(grnStats[g.id]?.lines || 0)}</td>
                      <td className="td-num">{formatTableCurrency(grnTotals[g.id] || 0)}</td>
                      <td className={`sales-cell-left ${st.tone}`}>{st.label}</td>
                    </tr>); })}
                </tbody>
              </table>
            </div>
          </>}
        {pag.totalPages > 1 && (
          <div className="flex justify-between items-center gap-2 kit-divider pt-2 text-xs text-muted-foreground">
            <span className="td-num">{formatTableInteger(pag.rangeStart)}–{formatTableInteger(pag.rangeEnd)} of {formatTableInteger(pag.total)}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" aria-label="Previous page" className="h-8 w-8" disabled={pag.page <= 1} onClick={() => pag.setPage(pag.page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label="Next page" className="h-8 w-8" disabled={pag.page >= pag.totalPages} onClick={() => pag.setPage(pag.page + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </section>

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
              <Select value={venue} onValueChange={setVenue}>
                <SelectTrigger><SelectValue placeholder="Select venue" /></SelectTrigger>
                <SelectContent>
                  {activeVenueNames.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
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
                        <TableCell className="text-right text-muted-foreground tabular-nums text-xs">
                          {linkedPoId ? (it.quantity_ordered ?? "—") : (it.quantity_invoiced ?? "—")}
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        {(() => {
                          const ref = linkedPoId ? it.quantity_ordered : it.quantity_invoiced;
                          const diff = ref != null ? (Number(it.quantity_received) - Number(ref)) : 0;
                          const tone = ref == null || diff === 0 ? "" : diff < 0 ? "border-warning bg-warning/5" : "border-primary bg-primary/5";
                          return (
                            <Input type="number" step="0.01" inputMode="decimal" value={it.quantity_received}
                              onChange={(e) => updateRow(it.key, { quantity_received: parseFloat(e.target.value) || 0 })}
                              className={`h-9 w-24 text-right tabular-nums font-medium ml-auto ${tone}`} />
                          );
                        })()}
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

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <DialogContent className="kit sales-day-dialog bg-background max-w-[760px] grid-cols-[minmax(0,1fr)] p-0 gap-0 w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] rounded-lg overflow-y-auto">
          {selected && (() => {
            const diffs = selectedItems.filter(lineDiffers);
            const st = grnStatusWords(selected.status, diffs.length);
            const anyDiff = diffs.length > 0;
            const price = (it: any) => Number(it.accepted_price > 0 ? it.accepted_price : it.unit_cost);
            const qtyText = (n: number, unit: string) => `${formatDecimal(n, Number.isInteger(n) ? 0 : 2)} ${unit || ""}`.trim();
            const diffWords = diffs.map((it: any) => {
              const d = receivedQty(it) - Number(it.quantity_invoiced);
              return `${it.description}: ${qtyText(Math.abs(d), it.unit)} ${d < 0 ? "short" : "extra"}`;
            }).join(" · ");
            return (
              <div className="min-w-0 p-5 sm:p-7 space-y-5">
                <div className="pr-8 space-y-1.5">
                  <DialogTitle className="text-[16px] break-words">{nameOf(selected)}</DialogTitle>
                  <DialogDescription className="text-[13px]">Received {selected.received_date ? formatDate(selected.received_date) : "—"} · invoice {selected.invoices?.invoice_number || "none"} · <span className={st.tone}>{st.label}</span></DialogDescription>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-[13px]">
                  {[["Received", selected.received_date ? formatDate(selected.received_date) : "—"], ["Venue", selected.venue || "—"], ["Items", formatTableInteger(selectedItems.length)], ["Value", formatTableCurrency(grnTotals[selected.id] || 0)]].map(([l, v]) => (
                    <div key={l} className="min-w-0"><p className="kit-group-h mb-1">{l}</p><p className="td-num break-words">{v}</p></div>
                  ))}
                </div>
                <p className={`text-[13px] ${anyDiff ? "text-warning" : "text-primary"}`}>{anyDiff ? diffWords : "✓ Everything received as invoiced"}</p>
                {selected.notes && <p className="text-[13px] text-muted-foreground whitespace-pre-wrap">{selected.notes}</p>}
                <table className="w-full table-fixed text-[11px] sm:text-[12px]" aria-label="Delivery items">
                  <thead><tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-3">Item</th>
                    {anyDiff && <th className="text-right w-[16%]">Invoiced</th>}
                    <th className="text-right w-[16%]">Received</th><th className="text-right w-[16%]">Price</th><th className="text-right w-[18%]">Total</th>
                  </tr></thead>
                  <tbody>
                    {selectedItems.map((it: any) => (
                      <tr key={it.key} className={`border-b border-border/50 ${lineDiffers(it) ? "text-warning" : ""}`}>
                        <td className="py-3 pr-2 break-words">{it.description}</td>
                        {anyDiff && <td className="text-right td-num">{it.quantity_invoiced == null ? "—" : qtyText(Number(it.quantity_invoiced), it.unit)}</td>}
                        <td className="text-right td-num">{qtyText(receivedQty(it), it.unit)}</td>
                        <td className="text-right td-num">{formatDecimal(price(it))}</td>
                        <td className="text-right td-num">{formatDecimal(receivedQty(it) * price(it))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="outline" className="kit-btn kit-btn-secondary"><MoreHorizontal className="h-4 w-4 mr-1" />More</Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem disabled>{selected.grn_number}{selected.purchase_orders?.po_number ? ` · PO ${selected.purchase_orders.po_number}` : ""}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <div className="flex flex-wrap justify-end gap-2">
                    {selected.status === "draft" && canManage && <Button variant="outline" className="kit-btn kit-btn-secondary" onClick={confirmReceiptFromPanel}>Confirm receipt</Button>}
                    {selected.invoice_id && (
                      <Button variant="outline" className="kit-btn kit-btn-secondary" onClick={() =>
                        setProblemTarget({
                          invoiceId: selected.invoice_id!,
                          supplierName: nameOf(selected),
                          total: grnTotals[selected.id] || 0,
                          invoiceDate: invoices.find((i) => i.id === selected.invoice_id)?.invoice_date || selected.received_date || "",
                          lines: selectedItems
                            .filter((it) => it.invoice_line_item_id)
                            .map((it) => ({
                              invoice_line_item_id: it.invoice_line_item_id!,
                              description: it.description || "(no description)",
                              unit: it.unit || "each",
                              quantity_invoiced: Number(it.quantity_invoiced) || 0,
                              quantity_received: Number(it.quantity_received) || 0,
                              unit_price: Number(it.unit_cost) || 0,
                            })),
                        })
                      }><AlertTriangle className="h-3.5 w-3.5 mr-1" />Report a problem</Button>
                    )}
                    {selected.invoice_id && <Button className="kit-btn kit-btn-primary" onClick={() => { const id = selected.invoice_id!; setSelected(null); controls.openInvoice(id); }}>Open invoice</Button>}
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <DeliveryCheckDialog
        target={problemTarget}
        tenantId={tenantId || ""}
        userId={user?.id || ""}
        onClose={() => {
          setProblemTarget(null);
          loadAll();
          if (selected) openDetail(selected);
        }}
      />
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
