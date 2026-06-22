import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { downloadCSV } from "@/utils/csvDownload";
import { formatCurrency } from "@/utils/salesUtils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  ChevronRight,
  ArrowLeft,
  StickyNote,
  Download,
  Check,
} from "lucide-react";

type Session = {
  id: string;
  session_number: string;
  venue: string;
  count_date: string;
  count_type: "full" | "category" | "spot";
  status: "in_progress" | "pending_review" | "approved";
  reference_mode: "none" | "last_count" | "expected";
  notes: string | null;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
};

type StockLocation = {
  id: string;
  venue: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

type Item = {
  id: string;
  session_id: string;
  product_master_id: string;
  location_id: string | null;
  last_count_qty: number | null;
  counted_qty: number | null;
  unit: string;
  unit_cost: number;
  notes: string | null;
};

type Product = {
  id: string;
  internal_sku: string;
  internal_product_name: string;
  level1_category: string;
  stock_uom: string;
  cost_per_stock_unit: number;
  status: string;
};

const VENUES = ["Assembly", "Caliente", "Hanabi"] as const;

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  full: { label: "Full", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  category: { label: "Category", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  spot: { label: "Spot", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  in_progress: { label: "In Progress", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  pending_review: { label: "Pending Review", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  approved: { label: "Approved", cls: "bg-green-50 text-green-700 border-green-200" },
};

const LOC_COLORS = [
  "bg-teal-50 text-teal-700 border-teal-200",
  "bg-blue-50 text-blue-700 border-blue-200",
  "bg-purple-50 text-purple-700 border-purple-200",
  "bg-orange-50 text-orange-700 border-orange-200",
];

export default function StockCounts() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      {selectedSessionId ? (
        <DetailView sessionId={selectedSessionId} onBack={() => setSelectedSessionId(null)} />
      ) : (
        <ListView onOpen={setSelectedSessionId} />
      )}
    </div>
  );
}

/* ============================================================
 * LIST VIEW
 * ============================================================ */
function ListView({ onOpen }: { onOpen: (id: string) => void }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [itemStats, setItemStats] = useState<Record<string, { total: number; counted: number; value: number }>>({});
  const [venueFilter, setVenueFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showNew, setShowNew] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("stock_count_sessions")
      .select("*")
      .order("count_date", { ascending: false })
      .order("created_at", { ascending: false });
    const sess = (data as Session[]) ?? [];
    setSessions(sess);

    if (sess.length > 0) {
      const ids = sess.map((s) => s.id);
      const { data: items } = await supabase
        .from("stock_count_items")
        .select("session_id, counted_qty, unit_cost")
        .in("session_id", ids);
      const stats: Record<string, { total: number; counted: number; value: number }> = {};
      (items ?? []).forEach((it: any) => {
        const s = (stats[it.session_id] ??= { total: 0, counted: 0, value: 0 });
        s.total += 1;
        if (it.counted_qty != null) {
          s.counted += 1;
          s.value += Number(it.counted_qty) * Number(it.unit_cost || 0);
        }
      });
      setItemStats(stats);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = sessions.filter(
    (s) =>
      (venueFilter === "all" || s.venue === venueFilter) &&
      (statusFilter === "all" || s.status === statusFilter)
  );

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold font-display">
          <span className="text-gradient-gold">Stock Counts</span>
        </h1>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Count
        </Button>
      </div>

      <div className="flex gap-2 mb-4">
        <Select value={venueFilter} onValueChange={setVenueFilter}>
          <SelectTrigger className="w-36 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All venues</SelectItem>
            {VENUES.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="pending_review">Pending Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="card-glass rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary text-primary-foreground text-xs font-semibold">
            <tr>
              <th className="text-left px-3 py-2">Session #</th>
              <th className="text-left px-3 py-2">Venue</th>
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Type</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Progress</th>
              <th className="text-right px-3 py-2">Value</th>
              <th className="w-8 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                  No stock counts yet.
                </td>
              </tr>
            ) : (
              filtered.map((s) => {
                const stats = itemStats[s.id] ?? { total: 0, counted: 0, value: 0 };
                const pct = stats.total ? (stats.counted / stats.total) * 100 : 0;
                const t = TYPE_BADGE[s.count_type];
                const st = STATUS_BADGE[s.status];
                return (
                  <tr
                    key={s.id}
                    onClick={() => onOpen(s.id)}
                    className="hover:bg-accent/30 cursor-pointer text-sm border-t border-border/40"
                  >
                    <td className="px-3 py-2 font-mono text-xs">{s.session_number}</td>
                    <td className="px-3 py-2">{s.venue}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(s.count_date).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={t.cls}>
                        {t.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={st.cls}>
                        {st.label}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full ${s.status === "approved" ? "bg-green-500" : "bg-amber-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {stats.counted}/{stats.total}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {s.status === "approved" ? (
                        `HK$ ${formatCurrency(stats.value)}`
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showNew && (
        <NewCountDialog
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            onOpen(id);
          }}
        />
      )}
    </>
  );
}

/* ============================================================
 * NEW COUNT DIALOG
 * ============================================================ */
function NewCountDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { user } = useAuth();
  const { tenantId } = useActiveTenant();
  const [venue, setVenue] = useState<string>("Assembly");
  const [countDate, setCountDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [countType, setCountType] = useState<"full" | "category" | "spot">("full");
  const [notes, setNotes] = useState("");
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [selectedLocs, setSelectedLocs] = useState<string[]>([]);
  const [noLocs, setNoLocs] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("stock_locations")
        .select("*")
        .eq("venue", venue)
        .order("sort_order");
      setLocations((data as StockLocation[]) ?? []);
      setSelectedLocs([]);
      setNoLocs(false);
    })();
  }, [venue]);

  const toggleLoc = (id: string) => {
    setNoLocs(false);
    setSelectedLocs((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const submit = async () => {
    if (!user) {
      toast.error("Not signed in");
      return;
    }
    setBusy(true);
    try {
      // 1. Read reference_mode from app_config
      let refMode: "none" | "last_count" | "expected" = "last_count";
      if (tenantId) {
        const { data: cfg } = await supabase
          .from("app_config")
          .select("value")
          .eq("tenant_id", tenantId)
          .eq("key", "stock_count_reference_mode")
          .maybeSingle();
        if (cfg?.value) {
          const v = typeof cfg.value === "string" ? cfg.value : (cfg.value as any);
          if (v === "none" || v === "last_count" || v === "expected") refMode = v;
        }
      }

      // 2. Insert session
      const { data: sess, error: sessErr } = await supabase
        .from("stock_count_sessions")
        .insert({
          venue,
          count_date: countDate,
          count_type: countType,
          reference_mode: refMode,
          notes: notes || null,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (sessErr || !sess) throw sessErr ?? new Error("Failed to create session");

      // 3. Fetch active products
      const products = (await fetchAllRows(
        "product_master",
        "id, internal_sku, internal_product_name, stock_uom, cost_per_stock_unit, status"
      )) as Product[];
      const active = products.filter((p) => p.status === "Active");

      // 4. Look up last approved counted qty per product for this venue
      let lastQtyMap = new Map<string, number>();
      if (refMode === "last_count") {
        const { data: lastApproved } = await supabase
          .from("stock_count_sessions")
          .select("id")
          .eq("venue", venue)
          .eq("status", "approved")
          .order("count_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastApproved?.id) {
          const { data: lastItems } = await supabase
            .from("stock_count_items")
            .select("product_master_id, counted_qty")
            .eq("session_id", lastApproved.id);
          (lastItems ?? []).forEach((r: any) => {
            if (r.counted_qty != null) lastQtyMap.set(r.product_master_id, Number(r.counted_qty));
          });
        }
      }

      // 5. Bulk insert items
      const rows = active.map((p) => ({
        session_id: sess.id,
        product_master_id: p.id,
        unit: p.stock_uom || "each",
        unit_cost: Number(p.cost_per_stock_unit || 0),
        last_count_qty: lastQtyMap.get(p.id) ?? null,
      }));
      const insertedItemIds: string[] = [];
      if (rows.length > 0) {
        // chunk to be safe
        const CHUNK = 500;
        for (let i = 0; i < rows.length; i += CHUNK) {
          const { data: inserted, error } = await supabase
            .from("stock_count_items")
            .insert(rows.slice(i, i + CHUNK))
            .select("id");
          if (error) throw error;
          (inserted ?? []).forEach((r: any) => insertedItemIds.push(r.id));
        }
      }

      // 6. If locations were selected, seed stock_count_location_qtys (one row per item × location)
      if (selectedLocs.length > 0 && insertedItemIds.length > 0) {
        const locRows: Array<{ count_item_id: string; location_id: string; qty: null }> = [];
        for (const itemId of insertedItemIds) {
          for (const locId of selectedLocs) {
            locRows.push({ count_item_id: itemId, location_id: locId, qty: null });
          }
        }
        const CHUNK = 500;
        for (let i = 0; i < locRows.length; i += CHUNK) {
          const { error } = await supabase
            .from("stock_count_location_qtys")
            .insert(locRows.slice(i, i + CHUNK));
          if (error) throw error;
        }
      }

      toast.success("Stock count started");
      onCreated(sess.id);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to start count");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">New stock count</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Venue</label>
              <Select value={venue} onValueChange={setVenue}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VENUES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Count date</label>
              <Input
                type="date"
                value={countDate}
                onChange={(e) => setCountDate(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Count type</label>
            <Select value={countType} onValueChange={(v) => setCountType(v as any)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full count</SelectItem>
                <SelectItem value="category">Category count</SelectItem>
                <SelectItem value="spot">Spot check</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {locations.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Locations{" "}
                <span className="text-muted-foreground">
                  (optional — for splitting work between staff)
                </span>
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {locations.map((loc) => {
                  const sel = !noLocs && selectedLocs.includes(loc.id);
                  return (
                    <div
                      key={loc.id}
                      onClick={() => toggleLoc(loc.id)}
                      className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer text-sm ${
                        sel ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <div
                        className={`h-[14px] w-[14px] rounded-sm border-2 flex items-center justify-center ${
                          sel ? "border-primary bg-primary" : "border-muted-foreground/40"
                        }`}
                      >
                        {sel && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                      </div>
                      <span>{loc.name}</span>
                    </div>
                  );
                })}
                <div
                  onClick={() => {
                    setNoLocs(true);
                    setSelectedLocs([]);
                  }}
                  className={`flex items-center gap-2 p-2 rounded-md border border-dashed cursor-pointer text-sm text-muted-foreground ${
                    noLocs ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div
                    className={`h-[14px] w-[14px] rounded-sm border-2 flex items-center justify-center ${
                      noLocs ? "border-primary bg-primary" : "border-muted-foreground/40"
                    }`}
                  >
                    {noLocs && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                  </div>
                  <span>No locations</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-sm"
              placeholder="Optional notes for this count…"
            />
          </div>
        </div>

        <DialogFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Starting…" : "Start count"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
 * DETAIL VIEW
 * ============================================================ */
function DetailView({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const { user, isAdmin } = useAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [products, setProducts] = useState<Map<string, Product>>(new Map());
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [tab, setTab] = useState<"count" | "summary">("count");

  const load = async () => {
    const { data: s } = await supabase
      .from("stock_count_sessions")
      .select("*")
      .eq("id", sessionId)
      .maybeSingle();
    setSession(s as Session);

    const { data: its } = await supabase
      .from("stock_count_items")
      .select("*")
      .eq("session_id", sessionId);
    const itemsArr = (its as Item[]) ?? [];
    setItems(itemsArr);

    if (s) {
      const { data: locs } = await supabase
        .from("stock_locations")
        .select("*")
        .eq("venue", (s as Session).venue)
        .order("sort_order");
      setLocations((locs as StockLocation[]) ?? []);
    }

    if (itemsArr.length > 0) {
      const ids = Array.from(new Set(itemsArr.map((i) => i.product_master_id)));
      const map = new Map<string, Product>();
      const CHUNK = 200;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { data } = await supabase
          .from("product_master")
          .select("id, internal_sku, internal_product_name, level1_category, stock_uom, cost_per_stock_unit, status")
          .in("id", ids.slice(i, i + CHUNK));
        (data ?? []).forEach((p: any) => map.set(p.id, p));
      }
      setProducts(map);
    }
  };

  useEffect(() => {
    load();
  }, [sessionId]);

  const advanceStatus = async (status: Session["status"]) => {
    const patch: any = { status };
    if (status === "approved") {
      patch.approved_by = user?.id;
      patch.approved_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from("stock_count_sessions")
      .update(patch)
      .eq("id", sessionId);
    if (error) toast.error(error.message);
    else {
      toast.success(status === "approved" ? "Count approved" : "Submitted for review");
      load();
    }
  };

  if (!session) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  const st = STATUS_BADGE[session.status];
  const counted = items.filter((i) => i.counted_qty != null).length;
  const total = items.length;
  const readonly = session.status !== "in_progress";

  return (
    <>
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Button>

      <div className="flex justify-between items-start mt-2">
        <div>
          <div className="text-xl font-bold font-display">
            {session.session_number} <span className="text-muted-foreground">·</span> {session.venue}
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
            <span>
              {new Date(session.count_date).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
            <span>·</span>
            <span className="capitalize">{session.count_type} count</span>
            <Badge variant="outline" className={st.cls}>
              {st.label}
            </Badge>
          </div>
        </div>

        <div className="flex gap-2">
          {session.status === "in_progress" && (
            <Button
              className="bg-blue-700 hover:bg-blue-800 text-white"
              onClick={() => advanceStatus("pending_review")}
            >
              Submit for review
            </Button>
          )}
          {session.status === "pending_review" && isAdmin && (
            <Button
              className="bg-green-800 hover:bg-green-900 text-white"
              onClick={() => advanceStatus("approved")}
            >
              Approve
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-border mt-4 mb-4">
        {(["count", "summary"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm border-b-2 -mb-px transition-colors capitalize ${
              tab === t
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "count" ? (
        <CountTab
          session={session}
          items={items}
          setItems={setItems}
          products={products}
          locations={locations}
          counted={counted}
          total={total}
          readonly={readonly}
          userId={user?.id ?? null}
        />
      ) : (
        <SummaryTab session={session} items={items} products={products} />
      )}
    </>
  );
}

/* ============================================================
 * COUNT TAB
 * ============================================================ */
function CountTab({
  session,
  items,
  setItems,
  products,
  locations,
  counted,
  total,
  readonly,
  userId,
}: {
  session: Session;
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  products: Map<string, Product>;
  locations: StockLocation[];
  counted: number;
  total: number;
  readonly: boolean;
  userId: string | null;
}) {
  const [filter, setFilter] = useState<"all" | "uncounted">("all");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [groupsOpen, setGroupsOpen] = useState<Record<string, boolean>>({});
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savedCellKeys, setSavedCellKeys] = useState<Set<string>>(new Set());
  const [locQtys, setLocQtys] = useState<Map<string, Map<string, number | null>>>(new Map());
  const [locQtysLoaded, setLocQtysLoaded] = useState(false);

  const refMode = session.reference_mode;
  const showRef = refMode !== "none";
  const refLabel = refMode === "expected" ? "Expected" : "Last count";

  const DOT_COLORS = ["bg-teal-500", "bg-blue-500", "bg-purple-500", "bg-orange-500"];

  const locById = useMemo(() => {
    const m = new Map<string, StockLocation>();
    locations.forEach((l) => m.set(l.id, l));
    return m;
  }, [locations]);

  // Load location qtys for this session
  useEffect(() => {
    (async () => {
      if (items.length === 0) {
        setLocQtys(new Map());
        setLocQtysLoaded(true);
        return;
      }
      const ids = items.map((i) => i.id);
      const all: any[] = [];
      const CHUNK = 200;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { data } = await supabase
          .from("stock_count_location_qtys")
          .select("count_item_id, location_id, qty")
          .in("count_item_id", ids.slice(i, i + CHUNK));
        (data ?? []).forEach((r) => all.push(r));
      }
      const map = new Map<string, Map<string, number | null>>();
      all.forEach((r) => {
        if (!map.has(r.count_item_id)) map.set(r.count_item_id, new Map());
        map
          .get(r.count_item_id)!
          .set(r.location_id, r.qty == null ? null : Number(r.qty));
      });
      setLocQtys(map);
      setLocQtysLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, items.length]);

  const multiMode = locQtys.size > 0;

  // Locations actually used in this session (ordered by sort_order)
  const activeLocations = useMemo(() => {
    if (!multiMode) return [] as StockLocation[];
    const ids = new Set<string>();
    locQtys.forEach((m) => m.forEach((_v, k) => ids.add(k)));
    return locations
      .filter((l) => ids.has(l.id))
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [locQtys, locations, multiMode]);

  // Legacy single-zone column items (only relevant when not multiMode)
  const hasZones = !multiMode && items.some((i) => i.location_id);

  const visibleItems = items.filter((it) => {
    if (filter === "uncounted" && it.counted_qty != null) return false;
    if (!multiMode && zoneFilter !== "all" && it.location_id !== zoneFilter) return false;
    return true;
  });

  // Group by level1_category
  const groups = useMemo(() => {
    const g: Record<string, Item[]> = {};
    visibleItems.forEach((it) => {
      const p = products.get(it.product_master_id);
      const cat = p?.level1_category || "Uncategorized";
      (g[cat] ??= []).push(it);
    });
    Object.keys(g).forEach((k) =>
      g[k].sort((a, b) => {
        const pa = products.get(a.product_master_id)?.internal_product_name ?? "";
        const pb = products.get(b.product_master_id)?.internal_product_name ?? "";
        return pa.localeCompare(pb);
      })
    );
    return g;
  }, [visibleItems, products]);

  const pct = total ? (counted / total) * 100 : 0;

  const saveItem = async (id: string, patch: Partial<Item>) => {
    const { error } = await supabase.from("stock_count_items").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    setSavedIds((prev) => new Set(prev).add(id));
    setTimeout(() => {
      setSavedIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }, 1500);
  };

  const onCountBlur = (it: Item, raw: string) => {
    if (readonly) return;
    const newVal = raw === "" ? null : Number(raw);
    if (newVal === it.counted_qty) return;
    if (newVal != null && isNaN(newVal)) return;
    saveItem(it.id, {
      counted_qty: newVal,
      counted_by: userId,
      counted_at: new Date().toISOString(),
    } as any);
  };

  const onLocBlur = async (it: Item, locId: string, raw: string) => {
    if (readonly) return;
    const newVal = raw === "" ? null : Number(raw);
    if (newVal != null && isNaN(newVal)) return;
    const curMap = locQtys.get(it.id);
    const cur = curMap?.get(locId);
    if ((cur ?? null) === newVal) return;

    const { error } = await supabase
      .from("stock_count_location_qtys")
      .upsert(
        {
          count_item_id: it.id,
          location_id: locId,
          qty: newVal,
          counted_by: userId,
          counted_at: new Date().toISOString(),
        },
        { onConflict: "count_item_id,location_id" }
      );
    if (error) {
      toast.error(error.message);
      return;
    }

    // Update local locQtys map
    const next = new Map(locQtys);
    const itemMap = new Map(next.get(it.id) ?? new Map());
    itemMap.set(locId, newVal);
    next.set(it.id, itemMap);
    setLocQtys(next);

    // Sum non-null and patch counted_qty on stock_count_items
    let sum: number | null = null;
    itemMap.forEach((v) => {
      if (v != null) sum = (sum ?? 0) + (v as number);
    });
    const { error: updErr } = await supabase
      .from("stock_count_items")
      .update({
        counted_qty: sum,
        counted_by: userId,
        counted_at: new Date().toISOString(),
      })
      .eq("id", it.id);
    if (updErr) {
      toast.error(updErr.message);
      return;
    }
    setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, counted_qty: sum } : x)));

    const key = `${it.id}|${locId}`;
    setSavedCellKeys((p) => new Set(p).add(key));
    setTimeout(() => {
      setSavedCellKeys((p) => {
        const n = new Set(p);
        n.delete(key);
        return n;
      });
    }, 1500);
  };

  // Single-mode grid cols
  const gridCols = showRef
    ? "65px 1fr 55px 100px 80px 85px 28px"
    : "65px 1fr 55px 100px 85px 28px";

  const tableMinWidth = 600 + activeLocations.length * 90;

  return (
    <div>
      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-full h-2 rounded-full bg-muted overflow-hidden flex-1">
          <div
            className={`h-full ${session.status === "in_progress" ? "bg-amber-500" : "bg-green-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-sm text-muted-foreground tabular-nums">
          {counted} / {total} items
        </span>
      </div>

      {/* Filter row */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1 rounded-md text-sm ${filter === "all" ? "bg-secondary" : "text-muted-foreground hover:bg-secondary/50"}`}
        >
          All items
        </button>
        <button
          onClick={() => setFilter("uncounted")}
          className={`px-3 py-1 rounded-md text-sm ${filter === "uncounted" ? "bg-secondary" : "text-muted-foreground hover:bg-secondary/50"}`}
        >
          Uncounted only
        </button>
      </div>

      {/* Pills: locations in multi mode, legacy zones otherwise */}
      {multiMode ? (
        activeLocations.length > 0 && (
          <div className="flex gap-2 mb-4 flex-wrap">
            <ZonePill active={zoneFilter === "all"} onClick={() => setZoneFilter("all")}>
              All zones
            </ZonePill>
            {activeLocations.map((l, i) => (
              <ZonePill
                key={l.id}
                active={zoneFilter === l.id}
                onClick={() => setZoneFilter(l.id)}
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full mr-1.5 align-middle ${DOT_COLORS[i % DOT_COLORS.length]}`}
                />
                {l.name}
              </ZonePill>
            ))}
          </div>
        )
      ) : (
        hasZones && (
          <div className="flex gap-2 mb-4 flex-wrap">
            <ZonePill active={zoneFilter === "all"} onClick={() => setZoneFilter("all")}>
              All zones
            </ZonePill>
            {Array.from(new Set(items.filter((i) => i.location_id).map((i) => i.location_id!))).map((lid) => {
              const loc = locById.get(lid);
              if (!loc) return null;
              return (
                <ZonePill key={lid} active={zoneFilter === lid} onClick={() => setZoneFilter(lid)}>
                  {loc.name}
                </ZonePill>
              );
            })}
          </div>
        )
      )}

      {/* Groups */}
      <div className="space-y-1">
        {Object.entries(groups)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([cat, list]) => {
            const allCounted = list.every((x) => x.counted_qty != null);
            const open = groupsOpen[cat] ?? !allCounted;
            const countedInGroup = list.filter((x) => x.counted_qty != null).length;
            return (
              <div key={cat} className="rounded-md overflow-hidden border border-border/60">
                <div
                  onClick={() => setGroupsOpen((p) => ({ ...p, [cat]: !open }))}
                  className="flex justify-between items-center px-4 py-2 bg-muted/40 border-y border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer"
                >
                  <span>
                    {cat} · {list.length} items
                  </span>
                  <span>
                    {allCounted ? (
                      <span className="text-green-600">✓ All counted</span>
                    ) : (
                      <span className="text-muted-foreground">
                        {countedInGroup} / {list.length} counted
                      </span>
                    )}
                  </span>
                </div>

                {open &&
                  (multiMode ? (
                    /* ====== MULTI-LOCATION GRID ====== */
                    <div className="overflow-x-auto">
                      <table
                        className="text-sm border-collapse"
                        style={{ minWidth: `${tableMinWidth}px`, width: "100%" }}
                      >
                        <thead>
                          <tr className="bg-muted/20 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                            <th className="text-left px-2 py-1 w-[80px]">SKU</th>
                            <th className="text-left px-2 py-1">Item</th>
                            <th className="text-center px-2 py-1 w-[55px]">Unit</th>
                            {showRef && (
                              <th className="text-right px-2 py-1 w-[90px]">{refLabel}</th>
                            )}
                            {activeLocations.map((l, i) => {
                              const dim =
                                zoneFilter !== "all" && zoneFilter !== l.id
                                  ? "opacity-40"
                                  : "";
                              return (
                                <th
                                  key={l.id}
                                  className={`text-right px-2 py-1 w-[90px] ${dim}`}
                                >
                                  <span className="inline-flex items-center justify-end gap-1.5">
                                    <span
                                      className={`inline-block w-2 h-2 rounded-full ${DOT_COLORS[i % DOT_COLORS.length]}`}
                                    />
                                    {l.name}
                                  </span>
                                </th>
                              );
                            })}
                            <th className="text-right px-2 py-1 w-[80px]">Total</th>
                            <th className="px-2 py-1 w-[28px]"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((it) => {
                            const p = products.get(it.product_master_id);
                            const itemMap = locQtys.get(it.id) ?? new Map<string, number | null>();
                            let liveTotal: number | null = null;
                            itemMap.forEach((v) => {
                              if (v != null) liveTotal = (liveTotal ?? 0) + (v as number);
                            });
                            return (
                              <tr
                                key={it.id}
                                className="border-b border-border/40 hover:bg-accent/30 align-middle"
                              >
                                <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground truncate">
                                  {p?.internal_sku ?? "—"}
                                </td>
                                <td className="px-2 py-1.5 font-medium text-foreground truncate pr-2">
                                  {p?.internal_product_name ?? "Unknown"}
                                </td>
                                <td className="px-2 py-1.5 text-muted-foreground text-center text-xs">
                                  {it.unit}
                                </td>
                                {showRef && (
                                  <td className="px-2 py-1.5 text-right text-sm italic">
                                    {it.last_count_qty != null ? (
                                      <span className="text-muted-foreground">
                                        {it.last_count_qty}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground/50">—</span>
                                    )}
                                  </td>
                                )}
                                {activeLocations.map((l) => {
                                  const v = itemMap.get(l.id);
                                  const key = `${it.id}|${l.id}`;
                                  const saved = savedCellKeys.has(key);
                                  const dim =
                                    zoneFilter !== "all" && zoneFilter !== l.id
                                      ? "opacity-40"
                                      : "";
                                  return (
                                    <td key={l.id} className={`px-2 py-1.5 text-right ${dim}`}>
                                      <Input
                                        type="number"
                                        step="any"
                                        defaultValue={v == null ? "" : String(v)}
                                        placeholder="—"
                                        disabled={readonly}
                                        onBlur={(e) => onLocBlur(it, l.id, e.target.value)}
                                        className={`h-7 w-20 text-right text-sm ml-auto ${
                                          saved ? "ring-1 ring-green-500" : ""
                                        }`}
                                      />
                                    </td>
                                  );
                                })}
                                <td className="text-right font-semibold bg-muted/30 px-3 py-2 tabular-nums">
                                  {liveTotal == null ? (
                                    <span className="text-muted-foreground">—</span>
                                  ) : (
                                    liveTotal
                                  )}
                                </td>
                                <td className="px-2 py-1.5">
                                  <NotesCell
                                    value={it.notes ?? ""}
                                    disabled={readonly}
                                    onSave={(v) => saveItem(it.id, { notes: v || null } as any)}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    /* ====== LEGACY SINGLE-ZONE GRID ====== */
                    <div>
                      <div
                        className="grid bg-muted/20 text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-1"
                        style={{ gridTemplateColumns: gridCols }}
                      >
                        <div>SKU</div>
                        <div>Item</div>
                        <div className="text-center">Unit</div>
                        <div>Zone</div>
                        {showRef && <div className="text-right">{refLabel}</div>}
                        <div className="text-right">Counted</div>
                        <div></div>
                      </div>

                      {list.map((it) => {
                        const p = products.get(it.product_master_id);
                        const loc = it.location_id ? locById.get(it.location_id) : null;
                        const locIdx = loc ? locations.findIndex((l) => l.id === loc.id) : -1;
                        const locColor = locIdx >= 0 ? LOC_COLORS[locIdx % LOC_COLORS.length] : "";
                        const saved = savedIds.has(it.id);
                        return (
                          <div
                            key={it.id}
                            className="grid items-center px-2 py-1.5 border-b border-border/40 hover:bg-accent/30 text-sm"
                            style={{ gridTemplateColumns: gridCols }}
                          >
                            <div className="font-mono text-xs text-muted-foreground truncate">
                              {p?.internal_sku ?? "—"}
                            </div>
                            <div className="font-medium text-foreground truncate pr-2">
                              {p?.internal_product_name ?? "Unknown"}
                            </div>
                            <div className="text-muted-foreground text-center text-xs">{it.unit}</div>
                            <div>
                              {loc ? (
                                <Badge variant="outline" className={`${locColor} text-[10px]`}>
                                  {loc.name}
                                </Badge>
                              ) : locations.length > 0 ? (
                                <Select
                                  value={it.location_id ?? ""}
                                  onValueChange={(v) =>
                                    saveItem(it.id, { location_id: v || null } as any)
                                  }
                                  disabled={readonly}
                                >
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue placeholder="— assign —" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {locations.map((l) => (
                                      <SelectItem key={l.id} value={l.id}>
                                        {l.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </div>
                            {showRef && (
                              <div className="text-right text-sm italic">
                                {it.last_count_qty != null ? (
                                  <span className="text-muted-foreground">{it.last_count_qty}</span>
                                ) : (
                                  <span className="text-muted-foreground/50">—</span>
                                )}
                              </div>
                            )}
                            <div className="text-right">
                              <Input
                                type="number"
                                step="any"
                                defaultValue={it.counted_qty ?? ""}
                                placeholder="—"
                                disabled={readonly}
                                onBlur={(e) => onCountBlur(it, e.target.value)}
                                className={`h-7 w-16 text-right text-sm ml-auto ${
                                  saved ? "ring-1 ring-green-500" : ""
                                }`}
                              />
                            </div>
                            <NotesCell
                              value={it.notes ?? ""}
                              disabled={readonly}
                              onSave={(v) => saveItem(it.id, { notes: v || null } as any)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))}
              </div>
            );
          })}
      </div>
    </div>
  );
}

function ZonePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-background text-muted-foreground border-border hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function NotesCell({
  value,
  disabled,
  onSave,
}: {
  value: string;
  disabled: boolean;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <StickyNote
            className={`h-3.5 w-3.5 ${value ? "text-amber-600" : "text-muted-foreground"}`}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <Textarea
          rows={3}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== value) onSave(draft);
          }}
          placeholder="Notes…"
          className="text-sm"
        />
      </PopoverContent>
    </Popover>
  );
}

/* ============================================================
 * SUMMARY TAB
 * ============================================================ */
function SummaryTab({
  session,
  items,
  products,
}: {
  session: Session;
  items: Item[];
  products: Map<string, Product>;
}) {
  const countedItems = items.filter((i) => i.counted_qty != null);
  const actualValue = countedItems.reduce(
    (s, i) => s + Number(i.counted_qty || 0) * Number(i.unit_cost || 0),
    0
  );
  const varianceValue = items.reduce((s, i) => {
    if (i.counted_qty == null || i.last_count_qty == null) return s;
    return s + (Number(i.counted_qty) - Number(i.last_count_qty)) * Number(i.unit_cost || 0);
  }, 0);
  const varianceCount = items.filter(
    (i) =>
      i.counted_qty != null &&
      i.last_count_qty != null &&
      Number(i.counted_qty) !== Number(i.last_count_qty)
  ).length;

  const exportCSV = () => {
    const rows = items
      .map((it) => {
        const p = products.get(it.product_master_id);
        const variance =
          it.counted_qty != null && it.last_count_qty != null
            ? Number(it.counted_qty) - Number(it.last_count_qty)
            : null;
        const valueDiff = variance != null ? variance * Number(it.unit_cost || 0) : null;
        return {
          sku: p?.internal_sku ?? "",
          item: p?.internal_product_name ?? "",
          last: it.last_count_qty ?? "",
          counted: it.counted_qty ?? "",
          variance: variance ?? "",
          value_diff: valueDiff != null ? valueDiff.toFixed(2) : "",
        };
      })
      .filter((r) => r.item);
    downloadCSV(
      rows,
      [
        { key: "sku", label: "SKU" },
        { key: "item", label: "Item" },
        { key: "last", label: "Last count" },
        { key: "counted", label: "Counted" },
        { key: "variance", label: "Variance" },
        { key: "value_diff", label: "Value diff" },
      ],
      `stock_count_${session.session_number}`
    );
  };

  return (
    <div>
      <div className="grid grid-cols-4 gap-3 mb-6">
        <KpiCard label="Items counted" value={String(countedItems.length)} />
        <KpiCard
          label="Actual value"
          value={`HK$ ${formatCurrency(actualValue)}`}
          cls="text-green-700"
        />
        <KpiCard
          label="Variance vs last"
          value={`${varianceValue >= 0 ? "+" : ""}HK$ ${formatCurrency(varianceValue)}`}
          cls={varianceValue < 0 ? "text-amber-700" : varianceValue > 0 ? "text-blue-700" : ""}
        />
        <KpiCard
          label="Items with variance"
          value={String(varianceCount)}
          cls="text-destructive"
        />
      </div>

      <div className="flex justify-end mb-2">
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
      </div>

      <div className="card-glass rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary text-primary-foreground text-xs font-semibold">
            <tr>
              <th className="text-left px-3 py-2">SKU</th>
              <th className="text-left px-3 py-2">Item</th>
              <th className="text-right px-3 py-2">Last count</th>
              <th className="text-right px-3 py-2">Counted</th>
              <th className="text-center px-3 py-2">Variance</th>
              <th className="text-right px-3 py-2">Value diff</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const p = products.get(it.product_master_id);
              const last = it.last_count_qty;
              const counted = it.counted_qty;
              let varianceNode: React.ReactNode = (
                <span className="text-green-600 text-base">✓</span>
              );
              let valueDiffNode: React.ReactNode = <span className="text-muted-foreground">$0</span>;
              if (counted != null && last != null) {
                const diff = Number(counted) - Number(last);
                const valDiff = diff * Number(it.unit_cost || 0);
                if (diff === 0) {
                  varianceNode = <span className="text-green-600 text-base">✓</span>;
                } else if (diff < 0) {
                  const ratio = last > 0 ? Math.abs(diff) / Number(last) : 1;
                  const isSevere = ratio > 0.2;
                  varianceNode = (
                    <Badge
                      variant="outline"
                      className={
                        isSevere
                          ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }
                    >
                      {diff}
                    </Badge>
                  );
                  valueDiffNode = (
                    <span className={isSevere ? "text-red-700" : "text-amber-700"}>
                      HK$ {formatCurrency(valDiff)}
                    </span>
                  );
                } else {
                  varianceNode = (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                      +{diff}
                    </Badge>
                  );
                  valueDiffNode = (
                    <span className="text-blue-700">+HK$ {formatCurrency(valDiff)}</span>
                  );
                }
              }
              return (
                <tr
                  key={it.id}
                  className="text-sm border-b border-border/40 hover:bg-accent/30"
                >
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {p?.internal_sku ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-medium">{p?.internal_product_name ?? "Unknown"}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                    {last ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-foreground tabular-nums">
                    {counted ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-center">{varianceNode}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{valueDiffNode}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({ label, value, cls = "" }: { label: string; value: string; cls?: string }) {
  return (
    <div className="card-glass rounded-xl p-4 text-center">
      <div className={`text-2xl font-bold ${cls}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}
