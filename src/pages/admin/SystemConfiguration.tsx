import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useVenues, Venue } from "@/hooks/useVenues";
import { useServicePeriods, ServicePeriod } from "@/hooks/useServicePeriods";
import { useRevenueSources, RevenueSource } from "@/hooks/useRevenueSources";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ChevronDown,
  Building2,
  Clock,
  Sparkles,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Lock,
  ClipboardCheck,
  GripVertical,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

const SectionShell = ({
  icon: Icon,
  title,
  subtitle,
  count,
  children,
}: {
  icon: typeof Building2;
  title: string;
  subtitle: string;
  count: number;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false); // collapsed by default
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="card-glass rounded-xl overflow-hidden">
      <CollapsibleTrigger className="w-full flex items-center justify-between p-5 hover:bg-muted/30 transition-colors group">
        <div className="flex items-center gap-3 text-left">
          <div className="h-10 w-10 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-display font-semibold text-foreground flex items-center gap-2">
              {title}
              <span className="text-xs font-normal text-muted-foreground tabular-nums">({count})</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border p-5 space-y-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
};

// ---------- Venues ----------
const VenuesSection = () => {
  const { venues, loading, create, update, remove } = useVenues();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; seats: string }>({ name: "", seats: "" });
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSeats, setNewSeats] = useState("");

  const startEdit = (v: Venue) => {
    setEditingId(v.id);
    setDraft({ name: v.name, seats: v.seats?.toString() ?? "" });
  };

  const saveEdit = async (v: Venue) => {
    const seatsNum = draft.seats.trim() === "" ? null : parseInt(draft.seats, 10);
    if (seatsNum !== null && (isNaN(seatsNum) || seatsNum < 0)) return;
    const ok = await update(v.id, { name: draft.name, seats: seatsNum });
    if (ok) setEditingId(null);
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const seatsNum = newSeats.trim() === "" ? null : parseInt(newSeats, 10);
    const ok = await create({ name: newName, seats: seatsNum });
    if (ok) {
      setNewName("");
      setNewSeats("");
      setAdding(false);
    }
  };

  const handleDelete = async (v: Venue) => {
    if (!confirm(`Delete venue "${v.name}"? This is blocked if any data references it.`)) return;
    await remove(v.id);
  };

  return (
    <SectionShell
      icon={Building2}
      title="Venues"
      subtitle="Operating locations. Used across Revenue, Forecast, HR, Procurement and Finance."
      count={venues.length}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Name</th>
                  <th className="text-left px-3 py-2 font-medium w-24">Seats</th>
                  <th className="text-left px-3 py-2 font-medium w-24">Active</th>
                  <th className="text-right px-3 py-2 font-medium w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {venues.map((v) => (
                  <tr key={v.id} className="border-t border-border">
                    {editingId === v.id ? (
                      <>
                        <td className="px-3 py-2">
                          <Input
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            className="h-8"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            value={draft.seats}
                            onChange={(e) => setDraft({ ...draft, seats: e.target.value })}
                            className="h-8"
                            placeholder="—"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Switch checked={v.is_active} onCheckedChange={(c) => update(v.id, { is_active: c })} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => saveEdit(v)}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 font-medium text-foreground flex items-center gap-2">
                          {v.name}
                          {v.is_system && (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                              <Lock className="h-3 w-3" /> system
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 td-num text-muted-foreground">
                          {v.seats ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <Switch
                            checked={v.is_active}
                            onCheckedChange={(c) => update(v.id, { is_active: c })}
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button size="sm" variant="ghost" onClick={() => startEdit(v)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(v)}
                            disabled={v.is_system}
                            title={v.is_system ? "System venues cannot be deleted" : "Delete"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {adding ? (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-border bg-muted/20">
              <Input
                placeholder="Venue name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-9"
              />
              <Input
                type="number"
                placeholder="Seats (optional)"
                value={newSeats}
                onChange={(e) => setNewSeats(e.target.value)}
                className="h-9 w-40"
              />
              <Button size="sm" onClick={handleAdd}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewName(""); setNewSeats(""); }}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add venue
            </Button>
          )}
        </>
      )}
    </SectionShell>
  );
};

// ---------- Service Periods ----------
const ServicePeriodsSection = () => {
  const { periods, loading, create, update, remove } = useServicePeriods();
  const { sources } = useRevenueSources();
  const activeSources = sources.filter((s) => s.is_active);
  const sourceName = (id: string | null) => sources.find((s) => s.id === id)?.name ?? "—";

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; revenue_source_id: string }>({ name: "", revenue_source_id: "" });
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSourceId, setNewSourceId] = useState<string>("");

  const startEdit = (p: ServicePeriod) => {
    setEditingId(p.id);
    setDraft({ name: p.name, revenue_source_id: p.revenue_source_id ?? "" });
  };

  const saveEdit = async (p: ServicePeriod) => {
    if (!draft.revenue_source_id) {
      return;
    }
    const ok = await update(p.id, { name: draft.name, revenue_source_id: draft.revenue_source_id });
    if (ok) setEditingId(null);
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newSourceId) return;
    const ok = await create({ name: newName, revenue_source_id: newSourceId });
    if (ok) { setNewName(""); setNewSourceId(""); setAdding(false); }
  };

  const handleDelete = async (p: ServicePeriod) => {
    if (!confirm(`Delete service period "${p.name}"? Blocked if any sales reference it.`)) return;
    await remove(p.id);
  };

  const noSourcesYet = activeSources.length === 0;

  return (
    <SectionShell
      icon={Clock}
      title="Service Periods"
      subtitle="Children of Revenue Sources (e.g. Restaurant Sales → Breakfast, Lunch, Dinner). Hidden across the app until at least one is created."
      count={periods.length}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : noSourcesYet ? (
        <div className="text-center py-6 rounded-lg border border-dashed border-border bg-muted/10">
          <p className="text-sm text-muted-foreground">
            Create a <span className="text-foreground font-medium">Revenue Source</span> first — service periods are children of a Revenue Source.
          </p>
        </div>
      ) : periods.length === 0 && !adding ? (
        <div className="text-center py-6 rounded-lg border border-dashed border-border bg-muted/10">
          <p className="text-sm text-muted-foreground mb-3">
            No service periods yet. Pick a parent Revenue Source, then add your first child period.
          </p>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add first service period
          </Button>
        </div>
      ) : (
        <>
          {periods.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Revenue Source</th>
                    <th className="text-left px-3 py-2 font-medium">Period Name</th>
                    <th className="text-left px-3 py-2 font-medium w-24">Active</th>
                    <th className="text-right px-3 py-2 font-medium w-32">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      {editingId === p.id ? (
                        <>
                          <td className="px-3 py-2">
                            <select
                              value={draft.revenue_source_id}
                              onChange={(e) => setDraft({ ...draft, revenue_source_id: e.target.value })}
                              className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                            >
                              <option value="" disabled>Select source…</option>
                              {activeSources.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-8" />
                          </td>
                          <td className="px-3 py-2">
                            <Switch checked={p.is_active} onCheckedChange={(c) => update(p.id, { is_active: c })} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" variant="ghost" onClick={() => saveEdit(p)} disabled={!draft.revenue_source_id || !draft.name.trim()}><Check className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-muted-foreground">{sourceName(p.revenue_source_id)}</td>
                          <td className="px-3 py-2 font-medium text-foreground">{p.name}</td>
                          <td className="px-3 py-2">
                            <Switch checked={p.is_active} onCheckedChange={(c) => update(p.id, { is_active: c })} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" variant="ghost" onClick={() => startEdit(p)}><Pencil className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(p)}><Trash2 className="h-4 w-4" /></Button>
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
              <select
                value={newSourceId}
                onChange={(e) => setNewSourceId(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm min-w-[180px]"
              >
                <option value="" disabled>Parent (Revenue Source)…</option>
                {activeSources.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <Input
                placeholder="e.g. Breakfast, Lunch, Dinner"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-9"
                autoFocus
              />
              <Button size="sm" onClick={handleAdd} disabled={!newSourceId || !newName.trim()}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewName(""); setNewSourceId(""); }}>Cancel</Button>
            </div>
          ) : periods.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add period
            </Button>
          ) : null}
        </>
      )}
    </SectionShell>
  );
};

// ---------- Revenue Sources ----------
const RevenueSourcesSection = () => {
  const { sources, loading, create, update, remove } = useRevenueSources();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; description: string }>({ name: "", description: "" });
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const startEdit = (s: RevenueSource) => {
    setEditingId(s.id);
    setDraft({ name: s.name, description: s.description });
  };

  const saveEdit = async (s: RevenueSource) => {
    const ok = await update(s.id, { name: draft.name, description: draft.description });
    if (ok) setEditingId(null);
  };

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const ok = await create({ name: newName, description: newDesc });
    if (ok) { setNewName(""); setNewDesc(""); setAdding(false); }
  };

  const handleDelete = async (s: RevenueSource) => {
    if (!confirm(`Delete revenue source "${s.name}"?`)) return;
    await remove(s.id);
  };

  return (
    <SectionShell
      icon={Sparkles}
      title="Revenue Sources"
      subtitle="Sales channels (e.g. Dine-in, Delivery, Catering, Private Event). For future tagging on Forecasts and Events."
      count={sources.length}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : sources.length === 0 && !adding ? (
        <div className="text-center py-6 rounded-lg border border-dashed border-border bg-muted/10">
          <p className="text-sm text-muted-foreground mb-3">
            No revenue sources yet. Add channels like Dine-in, Delivery, or Catering.
          </p>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add first revenue source
          </Button>
        </div>
      ) : (
        <>
          {sources.length > 0 && (
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
                          <td className="px-3 py-2">
                            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-8" />
                          </td>
                          <td className="px-3 py-2">
                            <Input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="h-8" />
                          </td>
                          <td className="px-3 py-2">
                            <Switch checked={s.is_active} onCheckedChange={(c) => update(s.id, { is_active: c })} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" variant="ghost" onClick={() => saveEdit(s)}><Check className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 font-medium text-foreground">{s.name}</td>
                          <td className="px-3 py-2 text-muted-foreground text-xs">{s.description || "—"}</td>
                          <td className="px-3 py-2">
                            <Switch checked={s.is_active} onCheckedChange={(c) => update(s.id, { is_active: c })} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button size="sm" variant="ghost" onClick={() => startEdit(s)}><Pencil className="h-4 w-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(s)}><Trash2 className="h-4 w-4" /></Button>
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
              <Input placeholder="Name (e.g. Delivery)" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-9" autoFocus />
              <Input placeholder="Description (optional)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="h-9" />
              <Button size="sm" onClick={handleAdd}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewName(""); setNewDesc(""); }}>Cancel</Button>
            </div>
          ) : sources.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add revenue source
            </Button>
          ) : null}
        </>
      )}
    </SectionShell>
  );
};

// ---------- Page ----------
const SystemConfiguration = () => {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="max-w-[1100px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display tracking-tight">
          <span className="text-gradient-gold">System Configuration</span>
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Manage venues, service periods and revenue sources used throughout the dashboard. Sections are collapsed by default — click to expand.
        </p>
      </div>

      <VenuesSection />
      <ServicePeriodsSection />
      <RevenueSourcesSection />
    </div>
  );
};

export default SystemConfiguration;
