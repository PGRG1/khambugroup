import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useVenues } from "@/hooks/useVenues";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { downloadCSV } from "@/utils/csvDownload";
import { toast } from "sonner";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter,
} from "@/components/ui/table";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import {
  Plus, Trash2, Edit2, Download, Search, AlertTriangle, DollarSign,
  ChefHat, Building2, ArrowUpDown,
} from "lucide-react";

// ---------- helpers ----------
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return `${String(dt.getDate()).padStart(2, "0")} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
};
const fmtMoney = (n?: number | null) =>
  (Number(n) || 0).toLocaleString("en-HK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n?: number | null) =>
  (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const WASTE_REASONS = ["Spoilage", "Expiry", "Breakage", "Quality", "Over-prep", "Other"];
const CONSUMPTION_REASONS = ["Staff meal", "Marketing", "R&D", "Tasting", "Comp", "Other"];

type EntryType = "waste" | "consumption";
type Entry = {
  id: string;
  tenant_id: string;
  venue: string;
  entry_date: string;
  entry_type: EntryType;
  reason: string;
  product_master_id: string | null;
  sku: string | null;
  description: string;
  quantity: number;
  uom: string | null;
  unit_cost: number;
  total_value: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};
type Product = {
  id: string;
  internal_sku: string;
  internal_product_name: string;
  stock_uom: string | null;
  unit: string | null;
  cost_per_stock_unit: number | null;
  unit_cost: number | null;
  status: string;
};

const formSchema = z.object({
  venue: z.string().min(1, "Venue required"),
  entry_date: z.string().min(1, "Date required"),
  entry_type: z.enum(["waste", "consumption"]),
  reason: z.string().min(1, "Reason required"),
  product_master_id: z.string().nullable(),
  sku: z.string().nullable(),
  description: z.string().min(1, "Description required"),
  quantity: z.number().positive("Quantity must be > 0"),
  uom: z.string().nullable(),
  unit_cost: z.number().min(0, "Cost cannot be negative"),
  notes: z.string().nullable(),
});

const TYPE_META: Record<EntryType, { label: string; cls: string; Icon: typeof Trash2 }> = {
  waste: { label: "Waste", cls: "bg-red-500/15 text-red-400 border border-red-500/30", Icon: Trash2 },
  consumption: { label: "Consumption", cls: "bg-blue-500/15 text-blue-400 border border-blue-500/30", Icon: ChefHat },
};

function TypeBadge({ type }: { type: EntryType }) {
  const m = TYPE_META[type];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${m.cls}`}>
      <m.Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}

// ---------- page ----------
export default function WastePage() {
  const { tenantId } = useActiveTenant();
  const { user } = useAuth();
  const { venues } = useVenues();

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [periodSpend, setPeriodSpend] = useState<number>(0);

  const [search, setSearch] = useState("");
  const [venueFilter, setVenueFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [period, setPeriod] = useState<"all" | "30d" | "mtd" | "ytd">("30d");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [rows, prods] = await Promise.all([
        fetchAllRows(
          "inventory_movements_waste",
          "id, tenant_id, venue, entry_date, entry_type, reason, product_master_id, sku, description, quantity, uom, unit_cost, total_value, notes, created_by, created_at",
          { col: "entry_date", asc: false },
          tenantId,
        ),
        fetchAllRows(
          "product_master",
          "id, internal_sku, internal_product_name, stock_uom, unit, cost_per_stock_unit, unit_cost, status",
          { col: "internal_sku", asc: true },
          tenantId,
        ),
      ]);
      setEntries(rows as Entry[]);
      setProducts((prods as Product[]).filter((p) => p.status === "Active"));
    } catch (e: any) {
      toast.error("Failed to load: " + (e?.message ?? "unknown"));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  // ----- period filter -----
  const periodStart = useMemo(() => {
    const now = new Date();
    if (period === "all") return null;
    if (period === "30d") {
      const d = new Date(now); d.setDate(d.getDate() - 30); return d;
    }
    if (period === "mtd") return new Date(now.getFullYear(), now.getMonth(), 1);
    if (period === "ytd") return new Date(now.getFullYear(), 0, 1);
    return null;
  }, [period]);

  const periodEntries = useMemo(() => {
    if (!periodStart) return entries;
    const s = periodStart.toISOString().slice(0, 10);
    return entries.filter((e) => e.entry_date >= s);
  }, [entries, periodStart]);

  // ----- fetch net invoice spend for waste-% KPI -----
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      let q: any = (supabase as any).from("invoices").select("total_amount, invoice_date").eq("tenant_id", tenantId);
      if (periodStart) q = q.gte("invoice_date", periodStart.toISOString().slice(0, 10));
      const { data } = await q;
      if (cancelled) return;
      const sum = (data ?? []).reduce((s: number, r: any) => s + (Number(r.total_amount) || 0), 0);
      setPeriodSpend(sum);
    })();
    return () => { cancelled = true; };
  }, [tenantId, periodStart]);

  // ----- filtered for table/chart -----
  const filtered = useMemo(() => {
    let list = periodEntries;
    if (venueFilter !== "all") list = list.filter((e) => e.venue === venueFilter);
    if (typeFilter !== "all") list = list.filter((e) => e.entry_type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        e.description.toLowerCase().includes(q) ||
        (e.sku || "").toLowerCase().includes(q) ||
        (e.reason || "").toLowerCase().includes(q) ||
        (e.notes || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [periodEntries, venueFilter, typeFilter, search]);

  // ----- KPIs -----
  const totalValue = useMemo(() => filtered.reduce((s, e) => s + Number(e.total_value || 0), 0), [filtered]);
  const wastePct = useMemo(() => {
    if (!periodSpend) return 0;
    return (totalValue / periodSpend) * 100;
  }, [totalValue, periodSpend]);

  const topItem = useMemo(() => {
    const map = new Map<string, { name: string; value: number }>();
    for (const e of filtered) {
      const k = e.description || e.sku || "—";
      const cur = map.get(k) || { name: k, value: 0 };
      cur.value += Number(e.total_value || 0);
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => b.value - a.value)[0];
  }, [filtered]);

  const topReason = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filtered) {
      const k = `${TYPE_META[e.entry_type].label} · ${e.reason}`;
      map.set(k, (map.get(k) || 0) + Number(e.total_value || 0));
    }
    return [...map.entries()].map(([k, v]) => ({ name: k, value: v })).sort((a, b) => b.value - a.value)[0];
  }, [filtered]);

  // ----- charts -----
  const byVenue = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filtered) map.set(e.venue, (map.get(e.venue) || 0) + Number(e.total_value || 0));
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [filtered]);

  const [breakdown, setBreakdown] = useState<"item" | "reason">("item");
  const byBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filtered) {
      const k = breakdown === "item" ? (e.description || e.sku || "—") : `${TYPE_META[e.entry_type].label} · ${e.reason}`;
      map.set(k, (map.get(k) || 0) + Number(e.total_value || 0));
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [filtered, breakdown]);

  // ----- CRUD -----
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this entry? This will also reverse the stock movement.")) return;
    const { error } = await (supabase as any).from("inventory_movements_waste").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Entry deleted");
    load();
  };

  const exportCsv = () => {
    if (!filtered.length) { toast.message("Nothing to export"); return; }
    downloadCSV(
      filtered.map((e) => ({
        date: e.entry_date,
        venue: e.venue,
        type: TYPE_META[e.entry_type].label,
        sku: e.sku || "",
        description: e.description,
        qty: Number(e.quantity).toFixed(2),
        uom: e.uom || "",
        unit_cost: Number(e.unit_cost).toFixed(2),
        total_value: Number(e.total_value).toFixed(2),
        reason: e.reason,
        notes: e.notes || "",
      })),
      [
        { key: "date", label: "Date" },
        { key: "venue", label: "Venue" },
        { key: "type", label: "Type" },
        { key: "sku", label: "SKU" },
        { key: "description", label: "Item" },
        { key: "qty", label: "Qty" },
        { key: "uom", label: "UOM" },
        { key: "unit_cost", label: "Unit Cost" },
        { key: "total_value", label: "Total Value" },
        { key: "reason", label: "Reason" },
        { key: "notes", label: "Notes" },
      ],
      "waste_adjustments",
    );
  };

  // ---------- render ----------
  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Waste &amp; Adjustments</h1>
          <p className="text-sm text-muted-foreground">
            Spoilage, breakage, expiry and internal consumption — deducted from Stock on Hand.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="mtd">Month to date</SelectItem>
              <SelectItem value="ytd">Year to date</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-1.5" /> Export
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> New entry
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Total waste value" value={`$${fmtMoney(totalValue)}`} Icon={DollarSign} />
        <Kpi label="Waste % of purchases" value={`${wastePct.toFixed(2)}%`} Icon={AlertTriangle}
             sub={periodSpend ? `${fmtMoney(periodSpend)} spend` : "no spend in period"} />
        <Kpi label="Top wasted item" value={topItem ? topItem.name : "—"}
             sub={topItem ? `$${fmtMoney(topItem.value)}` : undefined} Icon={Trash2} />
        <Kpi label="Top reason" value={topReason ? topReason.name : "—"}
             sub={topReason ? `$${fmtMoney(topReason.value)}` : undefined} Icon={ArrowUpDown} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Waste by venue</h3>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byVenue} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${v}`} />
                  <Tooltip formatter={(v: number) => `$${fmtMoney(v)}`} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Top 10</h3>
              <Select value={breakdown} onValueChange={(v: any) => setBreakdown(v)}>
                <SelectTrigger className="w-[150px] h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="item">By item</SelectItem>
                  <SelectItem value="reason">By reason</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byBreakdown} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                  <Tooltip formatter={(v: number) => `$${fmtMoney(v)}`} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0,4,4,0]}>
                    {byBreakdown.map((_, i) => (
                      <Cell key={i} fill={`hsl(var(--primary) / ${1 - i * 0.07})`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search item, SKU, reason, notes…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="waste">Waste</SelectItem>
            <SelectItem value="consumption">Consumption</SelectItem>
          </SelectContent>
        </Select>
        <Select value={venueFilter} onValueChange={setVenueFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All venues" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All venues</SelectItem>
            {venues.filter((v) => v.name).map((v) => (
              <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Venue</TableHead>
                <TableHead className="text-xs">Type</TableHead>
                <TableHead className="text-xs">SKU</TableHead>
                <TableHead className="text-xs">Item</TableHead>
                <TableHead className="text-xs text-right">Qty</TableHead>
                <TableHead className="text-xs">UOM</TableHead>
                <TableHead className="text-xs text-right">Unit Cost</TableHead>
                <TableHead className="text-xs text-right">Total Value</TableHead>
                <TableHead className="text-xs">Reason</TableHead>
                <TableHead className="text-xs">Notes</TableHead>
                <TableHead className="text-xs w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">No entries yet. Click <strong>New entry</strong> to log waste or consumption.</TableCell></TableRow>
              ) : (
                filtered.map((e) => (
                  <TableRow key={e.id} className="text-xs">
                    <TableCell className="font-mono">{fmtDate(e.entry_date)}</TableCell>
                    <TableCell>{e.venue}</TableCell>
                    <TableCell><TypeBadge type={e.entry_type} /></TableCell>
                    <TableCell className="font-mono text-muted-foreground">{e.sku || "—"}</TableCell>
                    <TableCell className="max-w-[260px] truncate" title={e.description}>{e.description}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtQty(e.quantity)}</TableCell>
                    <TableCell className="text-muted-foreground">{e.uom || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">${fmtMoney(e.unit_cost)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">${fmtMoney(e.total_value)}</TableCell>
                    <TableCell>{e.reason}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-muted-foreground" title={e.notes || ""}>{e.notes || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(e); setDialogOpen(true); }}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-300" onClick={() => handleDelete(e.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {filtered.length > 0 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={8} className="text-xs font-medium text-right">Total ({filtered.length} entries)</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">${fmtMoney(totalValue)}</TableCell>
                  <TableCell colSpan={3} />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>

      <EntryDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}
        editing={editing}
        products={products}
        venues={venues.map((v) => v.name).filter(Boolean)}
        tenantId={tenantId}
        userId={user?.id ?? null}
        onSaved={() => { setDialogOpen(false); setEditing(null); load(); }}
      />
    </div>
  );
}

// ---------- KPI card ----------
function Kpi({ label, value, sub, Icon }: { label: string; value: string; sub?: string; Icon: typeof DollarSign }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold tabular-nums truncate" title={value}>{value}</p>
            {sub && <p className="text-[11px] text-muted-foreground mt-0.5 truncate" title={sub}>{sub}</p>}
          </div>
          <div className="rounded-lg bg-primary/10 p-2 shrink-0"><Icon className="h-4 w-4 text-primary" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- entry dialog ----------
function EntryDialog({
  open, onOpenChange, editing, products, venues, tenantId, userId, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Entry | null;
  products: Product[];
  venues: string[];
  tenantId: string | null;
  userId: string | null;
  onSaved: () => void;
}) {
  const blank = {
    venue: venues[0] || "",
    entry_date: new Date().toISOString().slice(0, 10),
    entry_type: "waste" as EntryType,
    reason: "",
    product_master_id: null as string | null,
    sku: "",
    description: "",
    quantity: "" as string,
    uom: "",
    unit_cost: "" as string,
    notes: "",
  };
  const [form, setForm] = useState(blank);
  const [skuPickerOpen, setSkuPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        venue: editing.venue,
        entry_date: editing.entry_date,
        entry_type: editing.entry_type,
        reason: editing.reason,
        product_master_id: editing.product_master_id,
        sku: editing.sku || "",
        description: editing.description,
        quantity: String(editing.quantity),
        uom: editing.uom || "",
        unit_cost: String(editing.unit_cost),
        notes: editing.notes || "",
      });
    } else {
      setForm({ ...blank, venue: venues[0] || "" });
    }
  }, [open, editing, venues.join("|")]);

  const reasons = form.entry_type === "waste" ? WASTE_REASONS : CONSUMPTION_REASONS;

  const qtyNum = Number(form.quantity) || 0;
  const costNum = Number(form.unit_cost) || 0;
  const total = qtyNum * costNum;

  const pickProduct = (p: Product) => {
    setForm((f) => ({
      ...f,
      product_master_id: p.id,
      sku: p.internal_sku,
      description: p.internal_product_name,
      uom: p.stock_uom || p.unit || "",
      unit_cost: String(p.cost_per_stock_unit ?? p.unit_cost ?? ""),
    }));
    setSkuPickerOpen(false);
  };

  const save = async () => {
    if (!tenantId) { toast.error("No active tenant"); return; }
    const parsed = formSchema.safeParse({
      venue: form.venue,
      entry_date: form.entry_date,
      entry_type: form.entry_type,
      reason: form.reason,
      product_master_id: form.product_master_id || null,
      sku: form.sku || null,
      description: form.description,
      quantity: qtyNum,
      uom: form.uom || null,
      unit_cost: costNum,
      notes: form.notes || null,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    const payload = { ...parsed.data, tenant_id: tenantId, created_by: userId };
    let error;
    if (editing) {
      ({ error } = await (supabase as any).from("inventory_movements_waste").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await (supabase as any).from("inventory_movements_waste").insert(payload));
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Entry updated" : "Entry recorded");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit entry" : "New waste / consumption entry"}</DialogTitle>
          <DialogDescription>
            Stock-tracked items are deducted from Stock on Hand at save.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Date</Label>
            <Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Venue</Label>
            <Select value={form.venue} onValueChange={(v) => setForm({ ...form, venue: v })}>
              <SelectTrigger><SelectValue placeholder="Select venue" /></SelectTrigger>
              <SelectContent>
                {venues.filter(Boolean).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Type</Label>
            <Select value={form.entry_type} onValueChange={(v: EntryType) => setForm({ ...form, entry_type: v, reason: "" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="waste">Waste</SelectItem>
                <SelectItem value="consumption">Consumption</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Reason</Label>
            <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
              <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
              <SelectContent>
                {reasons.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2">
            <Label className="text-xs">Item (search by SKU or name)</Label>
            <Popover open={skuPickerOpen} onOpenChange={setSkuPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between font-normal">
                  <span className="truncate">
                    {form.sku ? `${form.sku} — ${form.description}` : "Select item…"}
                  </span>
                  <Search className="h-3.5 w-3.5 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
                <Command>
                  <CommandInput placeholder="Search SKU or item…" />
                  <CommandList>
                    <CommandEmpty>No items.</CommandEmpty>
                    <CommandGroup>
                      {products.slice(0, 200).map((p) => (
                        <CommandItem key={p.id} value={`${p.internal_sku} ${p.internal_product_name}`} onSelect={() => pickProduct(p)}>
                          <span className="font-mono text-xs mr-2">{p.internal_sku}</span>
                          <span className="truncate">{p.internal_product_name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-[11px] text-muted-foreground mt-1">
              Manual entries (no SKU) are logged for reporting only and do not affect stock.
            </p>
          </div>

          <div className="col-span-2">
            <Label className="text-xs">Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Item description" />
          </div>

          <div>
            <Label className="text-xs">Quantity</Label>
            <Input type="number" step="0.01" min="0" value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">UOM</Label>
            <Input value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })} placeholder="e.g. kg, btl, ea" />
          </div>

          <div>
            <Label className="text-xs">Unit cost</Label>
            <Input type="number" step="0.01" min="0" value={form.unit_cost}
              onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Total value</Label>
            <div className="h-9 px-3 flex items-center rounded-md border border-input bg-muted/30 text-sm tabular-nums font-medium">
              ${fmtMoney(total)}
            </div>
          </div>

          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional context…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Save" : "Record entry"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
