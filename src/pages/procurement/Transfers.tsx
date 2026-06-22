import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { formatCurrency } from "@/utils/salesUtils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Plus,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  X,
  Search,
} from "lucide-react";

const VENUES = ["Assembly", "Caliente", "Hanabi"] as const;
type Venue = (typeof VENUES)[number];

type StockLocation = {
  id: string;
  venue: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

type Product = {
  id: string;
  internal_sku: string;
  internal_product_name: string;
  stock_uom: string;
  cost_per_stock_unit: number;
  status: string;
};

type Transfer = {
  id: string;
  transfer_number: string;
  from_venue: string;
  to_venue: string;
  from_location_id: string | null;
  to_location_id: string | null;
  status: "draft" | "confirmed" | "received" | "cancelled";
  transfer_date: string;
  notes: string | null;
  created_by: string;
  received_by: string | null;
  received_at: string | null;
  created_at: string;
};

type TransferItem = {
  id: string;
  transfer_id: string;
  product_master_id: string;
  quantity_sent: number;
  quantity_received: number | null;
  unit: string;
  unit_cost: number;
  notes: string | null;
};

const STATUS_BADGE: Record<Transfer["status"], { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-muted text-muted-foreground border-border" },
  confirmed: { label: "Confirmed", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  received: { label: "Received", cls: "bg-green-50 text-green-700 border-green-200" },
  cancelled: { label: "Cancelled", cls: "bg-red-50 text-red-700 border-red-200" },
};

function StatusBadge({ status }: { status: Transfer["status"] }) {
  const b = STATUS_BADGE[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${b.cls}`}>
      {b.label}
    </span>
  );
}

export default function Transfers() {
  const [selectedTransferId, setSelectedTransferId] = useState<string | null>(null);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      {selectedTransferId ? (
        <TransferDetail
          transferId={selectedTransferId}
          onBack={() => setSelectedTransferId(null)}
        />
      ) : (
        <TransferList onOpen={setSelectedTransferId} />
      )}
    </div>
  );
}

/* ====================================================================== */
/*                              LIST VIEW                                 */
/* ====================================================================== */

function TransferList({ onOpen }: { onOpen: (id: string) => void }) {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [itemCounts, setItemCounts] = useState<Map<string, { count: number; value: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [fromVenue, setFromVenue] = useState<string>("all");
  const [toVenue, setToVenue] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const { data: t } = await supabase
      .from("transfers")
      .select("*")
      .order("created_at", { ascending: false });
    const list = (t as Transfer[]) ?? [];
    setTransfers(list);

    if (list.length) {
      const ids = list.map((x) => x.id);
      const { data: items } = await supabase
        .from("transfer_items")
        .select("transfer_id, quantity_sent, unit_cost")
        .in("transfer_id", ids);
      const map = new Map<string, { count: number; value: number }>();
      for (const id of ids) map.set(id, { count: 0, value: 0 });
      for (const row of (items as any[]) ?? []) {
        const cur = map.get(row.transfer_id) ?? { count: 0, value: 0 };
        cur.count += 1;
        cur.value += Number(row.quantity_sent || 0) * Number(row.unit_cost || 0);
        map.set(row.transfer_id, cur);
      }
      setItemCounts(map);
    } else {
      setItemCounts(new Map());
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const months = useMemo(() => {
    const set = new Set<string>();
    for (const t of transfers) set.add(t.transfer_date.slice(0, 7));
    return Array.from(set).sort().reverse();
  }, [transfers]);

  const filtered = useMemo(() => {
    return transfers.filter((t) => {
      if (fromVenue !== "all" && t.from_venue !== fromVenue) return false;
      if (toVenue !== "all" && t.to_venue !== toVenue) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (monthFilter !== "all" && !t.transfer_date.startsWith(monthFilter)) return false;
      return true;
    });
  }, [transfers, fromVenue, toVenue, statusFilter, monthFilter]);

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-display font-bold text-foreground">Transfers</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" /> New Transfer
        </Button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <Select value={fromVenue} onValueChange={setFromVenue}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="From venue" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All from venues</SelectItem>
            {VENUES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={toVenue} onValueChange={setToVenue}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="To venue" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All to venues</SelectItem>
            {VENUES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Month" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All months</SelectItem>
            {months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="card-glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary text-primary-foreground text-xs font-semibold">
                <th className="px-3 py-2 text-left">Transfer #</th>
                <th className="px-3 py-2 text-left">From → To</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Items</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No transfers yet.</td></tr>
              ) : (
                filtered.map((t) => {
                  const info = itemCounts.get(t.id) ?? { count: 0, value: 0 };
                  return (
                    <tr
                      key={t.id}
                      onClick={() => onOpen(t.id)}
                      className="border-b border-border/40 hover:bg-accent/30 cursor-pointer"
                    >
                      <td className="px-3 py-2 font-medium text-primary">{t.transfer_number}</td>
                      <td className="px-3 py-2">
                        {t.from_venue}
                        <ArrowRight className="h-3 w-3 mx-1 inline text-muted-foreground" />
                        {t.to_venue}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{t.transfer_date}</td>
                      <td className="px-3 py-2 text-muted-foreground">{info.count} items</td>
                      <td className="px-3 py-2"><StatusBadge status={t.status} /></td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {t.status === "draft" ? "—" : formatCurrency(info.value)}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        <ChevronRight className="h-4 w-4" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <NewTransferDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(id) => {
          setDialogOpen(false);
          load();
          onOpen(id);
        }}
      />
    </>
  );
}

/* ====================================================================== */
/*                        NEW TRANSFER DIALOG                             */
/* ====================================================================== */

type DraftLine = {
  product_master_id: string | null;
  product_name: string;
  quantity_sent: string;
  unit: string;
  unit_cost: string;
};

function NewTransferDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { user } = useAuth();
  const [fromVenue, setFromVenue] = useState<Venue>("Assembly");
  const [toVenue, setToVenue] = useState<Venue>("Caliente");
  const [fromLoc, setFromLoc] = useState<string>("none");
  const [toLoc, setToLoc] = useState<string>("none");
  const [transferDate, setTransferDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([
    { product_master_id: null, product_name: "", quantity_sent: "", unit: "each", unit_cost: "0" },
  ]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: locs } = await supabase
        .from("stock_locations")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      setLocations((locs as StockLocation[]) ?? []);

      const prods = await fetchAllRows(
        "product_master",
        "id, internal_sku, internal_product_name, stock_uom, cost_per_stock_unit, status",
        { col: "internal_product_name", asc: true },
      );
      setProducts((prods as Product[]).filter((p) => p.status === "Active"));
    })();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setFromVenue("Assembly");
      setToVenue("Caliente");
      setFromLoc("none");
      setToLoc("none");
      setTransferDate(new Date().toISOString().slice(0, 10));
      setNotes("");
      setLines([{ product_master_id: null, product_name: "", quantity_sent: "", unit: "each", unit_cost: "0" }]);
      setError("");
    }
  }, [open]);

  useEffect(() => { setFromLoc("none"); }, [fromVenue]);
  useEffect(() => { setToLoc("none"); }, [toVenue]);

  const fromLocs = locations.filter((l) => l.venue === fromVenue);
  const toLocs = locations.filter((l) => l.venue === toVenue);

  const updateLine = (idx: number, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };
  const addLine = () =>
    setLines((prev) => [...prev, { product_master_id: null, product_name: "", quantity_sent: "", unit: "each", unit_cost: "0" }]);
  const removeLine = (idx: number) =>
    setLines((prev) => prev.filter((_, i) => i !== idx));

  const pickProduct = (idx: number, p: Product) => {
    updateLine(idx, {
      product_master_id: p.id,
      product_name: p.internal_product_name,
      unit: p.stock_uom || "each",
      unit_cost: String(p.cost_per_stock_unit ?? 0),
    });
  };

  const submit = async () => {
    setError("");
    if (fromVenue === toVenue) {
      setError("From and To venue cannot be the same.");
      return;
    }
    const valid = lines.filter((l) => l.product_master_id && Number(l.quantity_sent) > 0);
    if (valid.length === 0) {
      setError("Add at least one item with a quantity.");
      return;
    }
    if (!user) {
      setError("Not signed in.");
      return;
    }
    setSaving(true);
    const { data: t, error: terr } = await supabase
      .from("transfers")
      .insert({
        from_venue: fromVenue,
        to_venue: toVenue,
        from_location_id: fromLoc === "none" ? null : fromLoc,
        to_location_id: toLoc === "none" ? null : toLoc,
        transfer_date: transferDate,
        notes: notes || null,
        created_by: user.id,
        status: "draft",
      })
      .select()
      .single();
    if (terr || !t) {
      setSaving(false);
      toast.error(terr?.message || "Failed to create transfer");
      return;
    }
    const rows = valid.map((l) => ({
      transfer_id: t.id,
      product_master_id: l.product_master_id!,
      quantity_sent: Number(l.quantity_sent),
      unit: l.unit,
      unit_cost: Number(l.unit_cost) || 0,
    }));
    const { error: ierr } = await supabase.from("transfer_items").insert(rows);
    setSaving(false);
    if (ierr) {
      toast.error(ierr.message);
      return;
    }
    toast.success(`Created ${t.transfer_number}`);
    onCreated(t.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">New Transfer</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>From venue</Label>
              <Select value={fromVenue} onValueChange={(v) => setFromVenue(v as Venue)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VENUES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>To venue</Label>
              <Select value={toVenue} onValueChange={(v) => setToVenue(v as Venue)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VENUES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(fromLocs.length > 0 || toLocs.length > 0) && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">From location (optional)</Label>
                {fromLocs.length > 0 ? (
                  <Select value={fromLoc} onValueChange={setFromLoc}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific location</SelectItem>
                      {fromLocs.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-xs text-muted-foreground italic h-10 flex items-center">No locations set up</div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To location (optional)</Label>
                {toLocs.length > 0 ? (
                  <Select value={toLoc} onValueChange={setToLoc}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific location</SelectItem>
                      {toLocs.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-xs text-muted-foreground italic h-10 flex items-center">No locations set up</div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>Transfer date</Label>
            <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Items to transfer</Label>
            <div className="border border-border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs">
                  <tr>
                    <th className="px-2 py-1 text-left">Item</th>
                    <th className="px-2 py-1 text-right w-16">Qty</th>
                    <th className="px-2 py-1 text-left w-20">Unit</th>
                    <th className="px-2 py-1 text-right w-20">Cost</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => (
                    <tr key={idx} className="border-t border-border/40">
                      <td className="px-1 py-1">
                        <ProductPicker
                          products={products}
                          value={l.product_name}
                          onPick={(p) => pickProduct(idx, p)}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number" inputMode="decimal" min={0}
                          className="h-8 text-right"
                          value={l.quantity_sent}
                          onChange={(e) => updateLine(idx, { quantity_sent: e.target.value })}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          className="h-8"
                          value={l.unit}
                          onChange={(e) => updateLine(idx, { unit: e.target.value })}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number" inputMode="decimal" min={0}
                          className="h-8 text-right"
                          value={l.unit_cost}
                          onChange={(e) => updateLine(idx, { unit_cost: e.target.value })}
                        />
                      </td>
                      <td className="px-1 py-1 text-center">
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={addLine}>
              <Plus className="h-3 w-3" /> Add item
            </Button>
          </div>

          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea rows={2} placeholder="Optional…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create Transfer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductPicker({
  products,
  value,
  onPick,
}: {
  products: Product[];
  value: string;
  onPick: (p: Product) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products.slice(0, 50);
    return products
      .filter((p) =>
        p.internal_product_name.toLowerCase().includes(s) ||
        p.internal_sku.toLowerCase().includes(s),
      )
      .slice(0, 50);
  }, [products, q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full h-8 px-2 text-left text-sm rounded-md border border-input bg-background hover:bg-accent/30 truncate"
        >
          {value || <span className="text-muted-foreground">Select item…</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[320px]" align="start">
        <div className="p-2 border-b border-border/40 flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            className="h-8 border-0 shadow-none focus-visible:ring-0 px-0"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">No matches.</div>
          ) : (
            filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onPick(p); setOpen(false); setQ(""); }}
                className="block w-full text-left px-3 py-1.5 text-sm hover:bg-accent/40"
              >
                <div className="font-medium truncate">{p.internal_product_name}</div>
                <div className="text-xs text-muted-foreground font-mono">{p.internal_sku}</div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ====================================================================== */
/*                            DETAIL VIEW                                 */
/* ====================================================================== */

function TransferDetail({ transferId, onBack }: { transferId: string; onBack: () => void }) {
  const { user } = useAuth();
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [items, setItems] = useState<TransferItem[]>([]);
  const [products, setProducts] = useState<Map<string, Product>>(new Map());
  const [locations, setLocations] = useState<Map<string, StockLocation>>(new Map());
  const [profiles, setProfiles] = useState<Map<string, { name: string | null; email: string | null }>>(new Map());
  const [tab, setTab] = useState<"items" | "details">("items");
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = async () => {
    const { data: t } = await supabase.from("transfers").select("*").eq("id", transferId).maybeSingle();
    if (!t) { onBack(); return; }
    setTransfer(t as Transfer);

    const { data: its } = await supabase
      .from("transfer_items").select("*").eq("transfer_id", transferId)
      .order("created_at", { ascending: true });
    const list = (its as TransferItem[]) ?? [];
    setItems(list);

    const productIds = Array.from(new Set(list.map((i) => i.product_master_id)));
    if (productIds.length) {
      const { data: pr } = await supabase
        .from("product_master")
        .select("id, internal_sku, internal_product_name, stock_uom, cost_per_stock_unit, status")
        .in("id", productIds);
      const pmap = new Map<string, Product>();
      for (const p of (pr as Product[]) ?? []) pmap.set(p.id, p);
      setProducts(pmap);
    } else {
      setProducts(new Map());
    }

    const locIds = [t.from_location_id, t.to_location_id].filter(Boolean) as string[];
    if (locIds.length) {
      const { data: ls } = await supabase.from("stock_locations").select("*").in("id", locIds);
      const lmap = new Map<string, StockLocation>();
      for (const l of (ls as StockLocation[]) ?? []) lmap.set(l.id, l);
      setLocations(lmap);
    }

    const userIds = [t.created_by, t.received_by].filter(Boolean) as string[];
    if (userIds.length) {
      const { data: ps } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);
      const pmap = new Map<string, { name: string | null; email: string | null }>();
      for (const p of (ps as any[]) ?? []) pmap.set(p.user_id, { name: p.display_name, email: null });
      setProfiles(pmap);
    }
  };

  useEffect(() => { load(); }, [transferId]);

  const totalValue = useMemo(
    () => items.reduce((s, i) => s + Number(i.quantity_sent || 0) * Number(i.unit_cost || 0), 0),
    [items],
  );

  if (!transfer) {
    return <div className="text-center py-20 text-muted-foreground">Loading…</div>;
  }

  const status = transfer.status;
  const hasAnyReceived = items.some((i) => i.quantity_received != null);

  const confirmTransfer = async () => {
    const { error } = await supabase.from("transfers").update({ status: "confirmed" }).eq("id", transfer.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Transfer confirmed");
    load();
  };
  const cancelTransfer = async () => {
    if (!confirm("Cancel this transfer?")) return;
    const { error } = await supabase.from("transfers").update({ status: "cancelled" }).eq("id", transfer.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Transfer cancelled");
    load();
  };

  return (
    <>
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
        <ArrowLeft className="h-4 w-4" /> Back
      </Button>

      <div className="flex justify-between items-start gap-4">
        <div>
          <div className="text-xl font-display font-bold flex items-center gap-2 flex-wrap">
            <span>{transfer.transfer_number}</span>
            <span className="text-muted-foreground">·</span>
            <span>{transfer.from_venue}</span>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <span>{transfer.to_venue}</span>
          </div>
          <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            <span>{transfer.transfer_date}</span>
            <span>·</span>
            <StatusBadge status={status} />
          </div>
        </div>
        <div className="flex gap-2">
          {status === "draft" && (
            <>
              <Button size="sm" variant="destructive" onClick={cancelTransfer} disabled={hasAnyReceived}>
                Cancel
              </Button>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={confirmTransfer}>
                Confirm Transfer
              </Button>
            </>
          )}
          {status === "confirmed" && (
            <Button className="bg-green-700 hover:bg-green-800 text-white" onClick={() => setReceiveOpen(true)}>
              Mark as Received
            </Button>
          )}
        </div>
      </div>

      <div className="border-b border-border/60 flex gap-6 mt-2">
        {(["items", "details"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`pb-2 text-sm font-medium border-b-2 -mb-px ${
              tab === k
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {k === "items" ? "Items" : "Details"}
          </button>
        ))}
      </div>

      {tab === "items" && (
        <ItemsTab
          transfer={transfer}
          items={items}
          products={products}
          totalValue={totalValue}
          editing={editing}
          setEditing={setEditing}
          reload={load}
        />
      )}

      {tab === "details" && (
        <DetailsTab transfer={transfer} locations={locations} profiles={profiles} />
      )}

      <ReceiveDialog
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        transfer={transfer}
        items={items}
        products={products}
        onDone={() => { setReceiveOpen(false); load(); }}
      />
    </>
  );
}

/* ====================================================================== */
/*                              ITEMS TAB                                 */
/* ====================================================================== */

function ItemsTab({
  transfer,
  items,
  products,
  totalValue,
  editing,
  setEditing,
  reload,
}: {
  transfer: Transfer;
  items: TransferItem[];
  products: Map<string, Product>;
  totalValue: number;
  editing: boolean;
  setEditing: (v: boolean) => void;
  reload: () => void;
}) {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!editing || allProducts.length) return;
    (async () => {
      const p = await fetchAllRows(
        "product_master",
        "id, internal_sku, internal_product_name, stock_uom, cost_per_stock_unit, status",
        { col: "internal_product_name", asc: true },
      );
      setAllProducts((p as Product[]).filter((x) => x.status === "Active"));
    })();
  }, [editing, allProducts.length]);

  const removeItem = async (id: string) => {
    const { error } = await supabase.from("transfer_items").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    reload();
  };

  const addItem = async (p: Product) => {
    setAdding(false);
    const { error } = await supabase.from("transfer_items").insert({
      transfer_id: transfer.id,
      product_master_id: p.id,
      quantity_sent: 0,
      unit: p.stock_uom || "each",
      unit_cost: p.cost_per_stock_unit ?? 0,
    });
    if (error) { toast.error(error.message); return; }
    reload();
  };

  const updateQtySent = async (id: string, val: string) => {
    const { error } = await supabase.from("transfer_items")
      .update({ quantity_sent: Number(val) || 0 }).eq("id", id);
    if (error) toast.error(error.message);
  };

  return (
    <div className="space-y-3">
      {transfer.status === "draft" && (
        <div className="flex justify-end gap-2">
          {editing && (
            <Popover open={adding} onOpenChange={setAdding}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm"><Plus className="h-3 w-3" /> Add item</Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="p-0 w-[320px]">
                <InlineProductSearch products={allProducts} onPick={addItem} />
              </PopoverContent>
            </Popover>
          )}
          <Button variant={editing ? "default" : "outline"} size="sm" onClick={() => setEditing(!editing)}>
            {editing ? "Done" : "Edit items"}
          </Button>
        </div>
      )}

      <div className="card-glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-primary text-primary-foreground text-xs font-semibold">
                <th className="px-3 py-2 text-left">SKU</th>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-center">Unit</th>
                <th className="px-3 py-2 text-right">Qty Sent</th>
                <th className="px-3 py-2 text-right">Qty Received</th>
                <th className="px-3 py-2 text-right">Unit Cost</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-left">Notes</th>
                {editing && <th className="px-3 py-2 w-8"></th>}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={editing ? 9 : 8} className="text-center py-8 text-muted-foreground">
                    No items.
                  </td>
                </tr>
              ) : items.map((it) => {
                const p = products.get(it.product_master_id);
                const total = Number(it.quantity_sent || 0) * Number(it.unit_cost || 0);
                let qtyRecvCls = "text-muted-foreground";
                if (transfer.status === "received") {
                  if (it.quantity_received == null) qtyRecvCls = "text-red-600";
                  else if (Number(it.quantity_received) === Number(it.quantity_sent)) qtyRecvCls = "text-green-700";
                  else qtyRecvCls = "text-amber-600";
                }
                return (
                  <tr key={it.id} className="border-b border-border/40">
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {p?.internal_sku || "—"}
                    </td>
                    <td className="px-3 py-2 font-medium text-foreground">
                      {p?.internal_product_name || "Unknown"}
                    </td>
                    <td className="px-3 py-2 text-center text-muted-foreground">{it.unit}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {editing ? (
                        <Input
                          type="number" inputMode="decimal" min={0}
                          className="h-8 w-20 text-right ml-auto"
                          defaultValue={it.quantity_sent}
                          onBlur={(e) => updateQtySent(it.id, e.target.value)}
                        />
                      ) : it.quantity_sent}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${qtyRecvCls}`}>
                      {transfer.status === "received"
                        ? (it.quantity_received ?? "—")
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                      {formatCurrency(Number(it.unit_cost))}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatCurrency(total)}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-sm">
                      {it.notes || "—"}
                    </td>
                    {editing && (
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(it.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr className="bg-muted/40 font-semibold">
                  <td colSpan={6} className="px-3 py-2 text-right">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(totalValue)}</td>
                  <td></td>
                  {editing && <td></td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

function InlineProductSearch({
  products,
  onPick,
}: {
  products: Product[];
  onPick: (p: Product) => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products.slice(0, 50);
    return products
      .filter((p) =>
        p.internal_product_name.toLowerCase().includes(s) ||
        p.internal_sku.toLowerCase().includes(s),
      )
      .slice(0, 50);
  }, [products, q]);
  return (
    <div>
      <div className="p-2 border-b border-border/40 flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus
          className="h-8 border-0 shadow-none focus-visible:ring-0 px-0"
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="max-h-64 overflow-y-auto">
        {filtered.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            className="block w-full text-left px-3 py-1.5 text-sm hover:bg-accent/40"
          >
            <div className="font-medium truncate">{p.internal_product_name}</div>
            <div className="text-xs text-muted-foreground font-mono">{p.internal_sku}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ====================================================================== */
/*                            DETAILS TAB                                 */
/* ====================================================================== */

function DetailsTab({
  transfer,
  locations,
  profiles,
}: {
  transfer: Transfer;
  locations: Map<string, StockLocation>;
  profiles: Map<string, { name: string | null; email: string | null }>;
}) {
  const fmtUser = (id: string | null) => {
    if (!id) return "—";
    const p = profiles.get(id);
    return p?.name || p?.email || id.slice(0, 8);
  };
  const Item = ({ label, value, full }: { label: string; value: React.ReactNode; full?: boolean }) => (
    <div className={full ? "col-span-2" : ""}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground font-medium mt-0.5">{value || "—"}</div>
    </div>
  );
  return (
    <div className="card-glass rounded-xl p-5">
      <div className="grid grid-cols-2 gap-4">
        <Item label="Transfer #" value={transfer.transfer_number} />
        <Item label="Status" value={<StatusBadge status={transfer.status} />} />
        <Item label="From venue" value={transfer.from_venue} />
        <Item label="To venue" value={transfer.to_venue} />
        <Item label="From location" value={transfer.from_location_id ? locations.get(transfer.from_location_id)?.name : "—"} />
        <Item label="To location" value={transfer.to_location_id ? locations.get(transfer.to_location_id)?.name : "—"} />
        <Item label="Transfer date" value={transfer.transfer_date} />
        <Item label="Created by" value={fmtUser(transfer.created_by)} />
        <Item label="Received by" value={fmtUser(transfer.received_by)} />
        <Item label="Received at" value={transfer.received_at ? new Date(transfer.received_at).toLocaleString() : "—"} />
        {transfer.notes && <Item label="Notes" value={transfer.notes} full />}
      </div>
    </div>
  );
}

/* ====================================================================== */
/*                           RECEIVE DIALOG                               */
/* ====================================================================== */

function ReceiveDialog({
  open,
  onOpenChange,
  transfer,
  items,
  products,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transfer: Transfer;
  items: TransferItem[];
  products: Map<string, Product>;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [received, setReceived] = useState<Map<string, string>>(new Map());
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const m = new Map<string, string>();
      for (const it of items) m.set(it.id, String(it.quantity_sent));
      setReceived(m);
      setDate(new Date().toISOString().slice(0, 10));
      setNotes("");
    }
  }, [open, items]);

  const submit = async () => {
    if (!user) return;
    setSaving(true);
    for (const it of items) {
      const v = received.get(it.id);
      const qty = v == null || v === "" ? null : Number(v);
      await supabase.from("transfer_items").update({ quantity_received: qty }).eq("id", it.id);
    }
    const { error } = await supabase.from("transfers").update({
      status: "received",
      received_by: user.id,
      received_at: new Date().toISOString(),
      transfer_date: date,
      notes: notes ? (transfer.notes ? `${transfer.notes}\n\nReceipt: ${notes}` : `Receipt: ${notes}`) : transfer.notes,
    }).eq("id", transfer.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Marked as received");
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Confirm Receipt</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="border border-border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs">
                <tr>
                  <th className="px-2 py-1 text-left">Item</th>
                  <th className="px-2 py-1 text-right w-16">Sent</th>
                  <th className="px-2 py-1 text-right w-20">Received</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const p = products.get(it.product_master_id);
                  return (
                    <tr key={it.id} className="border-t border-border/40">
                      <td className="px-2 py-1 truncate max-w-[180px]">{p?.internal_product_name || "—"}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{it.quantity_sent}</td>
                      <td className="px-2 py-1">
                        <Input
                          type="number" inputMode="decimal" min={0}
                          className="h-8 text-right"
                          value={received.get(it.id) ?? ""}
                          onChange={(e) => {
                            const m = new Map(received);
                            m.set(it.id, e.target.value);
                            setReceived(m);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="space-y-1">
            <Label>Received date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Confirm Receipt"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
