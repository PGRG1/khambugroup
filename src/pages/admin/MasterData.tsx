/**
 * /admin/master-data — Tenant master data (module-level configuration).
 *
 * Distinct from Business Structure: this is the master data each *module*
 * needs to operate (revenue channels, procurement stock counting behaviour,
 * counting locations, etc.).
 */
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Sparkles, Plus, Pencil, Trash2, Check, X, ClipboardCheck, GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useRevenueSources, RevenueSource } from "@/hooks/useRevenueSources";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { PageHeader, EmptyState } from "@/components/expenses/shared";

// ---------- Revenue Sources ----------
function RevenueSourcesCard() {
  const { sources, loading, create, update, remove } = useRevenueSources();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", description: "" });
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  return (
    <div className="card-glass rounded-xl border border-border/60 overflow-hidden">
      <div className="p-5 border-b border-border/60 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-primary"/>
        </div>
        <div>
          <div className="text-base font-display font-semibold">Revenue Sources <span className="text-xs text-muted-foreground tabular-nums">({sources.length})</span></div>
          <div className="text-xs text-muted-foreground">Sales channels (Dine-in, Delivery, Catering, Private Event). Used to tag forecasts and events.</div>
        </div>
      </div>
      <div className="p-5 space-y-3">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : sources.length === 0 && !adding ? (
          <EmptyState
            title="No revenue sources yet"
            description="Add channels like Dine-in, Delivery, or Catering."
            action={<Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1"/>Add first revenue source</Button>}
          />
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium">Description</th>
                  <th className="text-left px-3 py-2 font-medium w-24">Active</th>
                  <th className="text-right px-3 py-2 font-medium w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    {editingId === s.id ? (
                      <>
                        <td className="px-3 py-2"><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-8"/></td>
                        <td className="px-3 py-2"><Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="h-8"/></td>
                        <td className="px-3 py-2"><Switch checked={s.is_active} onCheckedChange={(c) => update(s.id, { is_active: c })}/></td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="ghost" onClick={async () => { if (await update(s.id, draft)) setEditingId(null); }}><Check className="h-4 w-4"/></Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4"/></Button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 font-medium">{s.name}</td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{s.description || "—"}</td>
                        <td className="px-3 py-2"><Switch checked={s.is_active} onCheckedChange={(c) => update(s.id, { is_active: c })}/></td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => { setEditingId(s.id); setDraft({ name: s.name, description: s.description }); }}><Pencil className="h-4 w-4"/></Button>
                          <Button size="sm" variant="ghost" onClick={async () => { if (confirm(`Delete revenue source "${s.name}"?`)) await remove(s.id); }}><Trash2 className="h-4 w-4"/></Button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {adding ? (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-border bg-muted/20">
            <Input placeholder="Name (e.g. Delivery)" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-9" autoFocus/>
            <Input placeholder="Description (optional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="h-9"/>
            <Button size="sm" onClick={async () => { if (!newName.trim()) return; if (await create({ name: newName, description: newDesc })) { setNewName(""); setNewDesc(""); setAdding(false); } }}>Add</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewName(""); setNewDesc(""); }}>Cancel</Button>
          </div>
        ) : sources.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1"/>Add revenue source</Button>
        )}
      </div>
    </div>
  );
}

// ---------- Procurement configuration ----------
type StockLocation = { id: string; venue: string; name: string; sort_order: number; is_active: boolean };
const VENUES = ["Assembly", "Caliente", "Hanabi"] as const;
const REF_MODES = [
  { value: "none", title: "None — blind count", desc: "No reference shown. Best for unbiased counts.", pill: null as null | { label: string; cls: string }, disabled: false },
  { value: "last_count", title: "Last count qty", desc: "Shows qty from the most recent approved count.", pill: { label: "Recommended", cls: "bg-primary/10 text-primary" }, disabled: false },
  { value: "expected", title: "Expected on hand", desc: "Requires Stock Movements module.", pill: { label: "Coming soon", cls: "bg-muted text-muted-foreground" }, disabled: true },
];

function ProcurementCard() {
  const { tenantId } = useActiveTenant();
  const [refMode, setRefMode] = useState<string>("last_count");
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [activeVenue, setActiveVenue] = useState<string>("Assembly");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [newName, setNewName] = useState("");

  const loadLocations = async () => {
    const { data } = await supabase.from("stock_locations").select("*").order("venue").order("sort_order");
    setLocations((data as StockLocation[]) ?? []);
  };
  const loadRefMode = async () => {
    if (!tenantId) return;
    const { data } = await supabase.from("app_config").select("value").eq("tenant_id", tenantId).eq("key", "stock_count_reference_mode").maybeSingle();
    if (data?.value) {
      const v = typeof data.value === "string" ? data.value : (data.value as any);
      setRefMode(typeof v === "string" ? v : String(v));
    }
  };
  useEffect(() => { loadLocations(); }, []);
  useEffect(() => { loadRefMode(); }, [tenantId]);

  const saveRefMode = async (value: string) => {
    if (!tenantId) { toast.error("No active tenant"); return; }
    setRefMode(value);
    const { error } = await supabase.from("app_config").upsert({ tenant_id: tenantId, key: "stock_count_reference_mode", value: value as any }, { onConflict: "tenant_id,key" });
    if (error) toast.error(error.message);
  };

  const venueLocations = locations.filter((l) => l.venue === activeVenue).sort((a, b) => a.sort_order - b.sort_order);

  const move = async (idx: number, dir: -1 | 1) => {
    const next = idx + dir; if (next < 0 || next >= venueLocations.length) return;
    const a = venueLocations[idx], b = venueLocations[next];
    await supabase.from("stock_locations").update({ sort_order: b.sort_order }).eq("id", a.id);
    await supabase.from("stock_locations").update({ sort_order: a.sort_order }).eq("id", b.id);
    await loadLocations();
  };
  const saveEdit = async (loc: StockLocation) => {
    const name = editDraft.trim();
    if (!name || name === loc.name) { setEditingId(null); return; }
    const { error } = await supabase.from("stock_locations").update({ name }).eq("id", loc.id);
    if (error) toast.error(error.message); else await loadLocations();
    setEditingId(null);
  };
  const handleDelete = async (loc: StockLocation) => {
    const { count } = await supabase.from("stock_count_items").select("id", { count: "exact", head: true }).eq("location_id", loc.id);
    if ((count ?? 0) > 0) { toast.error("Cannot delete — this location is used in an existing count."); return; }
    if (!confirm(`Delete location "${loc.name}"?`)) return;
    const { error } = await supabase.from("stock_locations").delete().eq("id", loc.id);
    if (error) toast.error(error.message); else await loadLocations();
  };
  const handleAdd = async () => {
    const name = newName.trim(); if (!name) return;
    const maxOrder = venueLocations.reduce((m, l) => Math.max(m, l.sort_order), 0);
    const { error } = await supabase.from("stock_locations").insert({ venue: activeVenue, name, sort_order: maxOrder + 1 });
    if (error) { toast.error(error.message); return; }
    setNewName(""); await loadLocations();
  };

  return (
    <div className="card-glass rounded-xl border border-border/60 overflow-hidden">
      <div className="p-5 border-b border-border/60 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
          <ClipboardCheck className="h-5 w-5 text-primary"/>
        </div>
        <div>
          <div className="text-base font-display font-semibold">Procurement</div>
          <div className="text-xs text-muted-foreground">Stock count behaviour and location management.</div>
        </div>
      </div>
      <div className="p-5 space-y-5">
        <div>
          <div className="text-sm font-medium">Stock count reference quantity</div>
          <div className="text-xs text-muted-foreground mb-3">Controls what counters see alongside each item.</div>
          <div className="space-y-2">
            {REF_MODES.map((opt) => {
              const selected = refMode === opt.value;
              return (
                <div
                  key={opt.value}
                  onClick={() => !opt.disabled && saveRefMode(opt.value)}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"} ${opt.disabled ? "opacity-40 pointer-events-none" : ""}`}
                >
                  <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center ${selected ? "border-primary" : "border-muted-foreground/40"}`}>
                    {selected && <div className="h-2 w-2 rounded-full bg-primary"/>}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium flex items-center">
                      {opt.title}
                      {opt.pill && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ml-2 ${opt.pill.cls}`}>{opt.pill.label}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Separator/>

        <div>
          <div className="text-sm font-medium">Stock count locations</div>
          <div className="text-xs text-muted-foreground mb-3">Define counting zones per venue. Optional.</div>
          <div className="flex gap-1 border-b border-border mb-3">
            {VENUES.map((v) => (
              <button
                key={v}
                onClick={() => setActiveVenue(v)}
                className={`px-3 py-1.5 text-sm border-b-2 -mb-px transition-colors ${activeVenue === v ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >{v}</button>
            ))}
          </div>
          <div className="rounded-lg border border-border bg-card">
            {venueLocations.length === 0 ? (
              <div className="text-xs text-muted-foreground p-3 text-center">No locations for {activeVenue} yet.</div>
            ) : venueLocations.map((loc, idx) => (
              <div key={loc.id} className="flex items-center gap-2 px-3 py-2 border-b border-border last:border-0">
                <GripVertical className="h-4 w-4 text-muted-foreground"/>
                <div className="flex flex-col">
                  <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowUp className="h-3 w-3"/></button>
                  <button onClick={() => move(idx, 1)} disabled={idx === venueLocations.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30"><ArrowDown className="h-3 w-3"/></button>
                </div>
                {editingId === loc.id ? (
                  <Input autoFocus value={editDraft} onChange={(e) => setEditDraft(e.target.value)} onBlur={() => saveEdit(loc)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveEdit(loc); if (e.key === "Escape") setEditingId(null); }}
                    className="h-7 text-sm flex-1"/>
                ) : (
                  <div className="flex-1 text-sm">{loc.name}</div>
                )}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(loc.id); setEditDraft(loc.name); }}><Pencil className="h-3.5 w-3.5"/></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-destructive" onClick={() => handleDelete(loc)}><Trash2 className="h-3.5 w-3.5"/></Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-3 border-t border-border mt-3">
            <Input placeholder={`New location for ${activeVenue}`} value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }} className="h-8 text-sm"/>
            <Button size="sm" onClick={handleAdd} disabled={!newName.trim()}><Plus className="h-4 w-4 mr-1"/>Add</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MasterData() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace/>;
  return (
    <div className="p-6 space-y-6 max-w-[1100px] mx-auto">
      <PageHeader
        title="Master Data"
        description="Module-level master data — revenue channels and procurement configuration. Organizations and venues live in Business Structure."
      />
      <RevenueSourcesCard/>
      <ProcurementCard/>
    </div>
  );
}
