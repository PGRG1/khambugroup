/**
 * /admin/structure — Business Structure
 *
 * Single home for organizations + their venues. Venues are rendered nested
 * inside their owning org so the hierarchy is visible at a glance. Each venue
 * row shows org, active state, and service-period count and deep-links to the
 * per-venue service periods editor.
 */
import { useEffect, useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { Building2, Plus, Pencil, Trash2, Check, X, Lock, ExternalLink, Clock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizations, Organization } from "@/hooks/useOrganizations";
import { useVenues, Venue } from "@/hooks/useVenues";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PageHeader, KpiCard, KpiGrid, EmptyState } from "@/components/expenses/shared";

type ServicePeriodCounts = Record<string, number>;

function useServicePeriodCounts(venueIds: string[]) {
  const [counts, setCounts] = useState<ServicePeriodCounts>({});
  useEffect(() => {
    if (venueIds.length === 0) { setCounts({}); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("venue_service_periods")
        .select("venue_id, is_active")
        .in("venue_id", venueIds)
        .eq("is_active", true);
      if (cancelled) return;
      const next: ServicePeriodCounts = {};
      (data ?? []).forEach((r: any) => { next[r.venue_id] = (next[r.venue_id] ?? 0) + 1; });
      setCounts(next);
    })();
    return () => { cancelled = true; };
  }, [venueIds.join(",")]);
  return counts;
}

// ---------- Org card ----------
function OrgCard({
  org, venues, spCounts, updateOrg, deleteOrg, addVenue, updateVenue, deleteVenue,
}: {
  org: Organization;
  venues: Venue[];
  spCounts: ServicePeriodCounts;
  updateOrg: (id: string, p: Partial<Organization>) => Promise<boolean>;
  deleteOrg: (id: string) => Promise<boolean>;
  addVenue: (name: string, seats: number | null) => Promise<boolean>;
  updateVenue: (id: string, p: Partial<Pick<Venue, "name" | "seats" | "is_active">>) => Promise<boolean>;
  deleteVenue: (v: Venue) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Organization>>(org);
  const [addingVenue, setAddingVenue] = useState(false);
  const [newVenueName, setNewVenueName] = useState("");
  const [newVenueSeats, setNewVenueSeats] = useState("");
  const [editingVenueId, setEditingVenueId] = useState<string | null>(null);
  const [venueDraft, setVenueDraft] = useState<{ name: string; seats: string }>({ name: "", seats: "" });

  const saveVenue = async (v: Venue) => {
    const seatsNum = venueDraft.seats.trim() === "" ? null : parseInt(venueDraft.seats, 10);
    if (seatsNum !== null && (isNaN(seatsNum) || seatsNum < 0)) return;
    if (await updateVenue(v.id, { name: venueDraft.name, seats: seatsNum })) setEditingVenueId(null);
  };
  const submitNewVenue = async () => {
    if (!newVenueName.trim()) return;
    const seats = newVenueSeats.trim() === "" ? null : parseInt(newVenueSeats, 10);
    if (await addVenue(newVenueName, seats)) {
      setNewVenueName(""); setNewVenueSeats(""); setAddingVenue(false);
    }
  };

  return (
    <div className="card-glass rounded-xl border border-border/60 overflow-hidden">
      {/* Org header */}
      <div className="p-5 border-b border-border/60 flex items-start justify-between gap-3">
        {editing ? (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
            <Input placeholder="Name" value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-8"/>
            <Input placeholder="Legal name" value={draft.legal_name ?? ""} onChange={(e) => setDraft({ ...draft, legal_name: e.target.value })} className="h-8"/>
            <Input placeholder="Registration #" value={draft.registration_number ?? ""} onChange={(e) => setDraft({ ...draft, registration_number: e.target.value })} className="h-8"/>
            <Input type="date" value={draft.incorporation_date ?? ""} onChange={(e) => setDraft({ ...draft, incorporation_date: e.target.value })} className="h-8"/>
            <Input placeholder="Registered address" value={draft.registered_address ?? ""} onChange={(e) => setDraft({ ...draft, registered_address: e.target.value })} className="h-8 md:col-span-2"/>
            <Input placeholder="Auditor" value={draft.auditor ?? ""} onChange={(e) => setDraft({ ...draft, auditor: e.target.value })} className="h-8 md:col-span-2"/>
          </div>
        ) : (
          <div className="min-w-0 flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-primary"/>
            </div>
            <div className="min-w-0">
              <div className="text-base font-display font-semibold flex items-center gap-2">
                {org.name}
                <span className="text-xs text-muted-foreground tabular-nums">({venues.length} venue{venues.length === 1 ? "" : "s"})</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 space-x-3">
                {org.legal_name && <span>Legal: {org.legal_name}</span>}
                {org.registration_number && <span>Reg #: {org.registration_number}</span>}
                {org.incorporation_date && <span>Inc: {org.incorporation_date}</span>}
                {org.auditor && <span>Auditor: {org.auditor}</span>}
              </div>
              {org.registered_address && (
                <div className="text-xs text-muted-foreground mt-0.5">{org.registered_address}</div>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center gap-1 shrink-0">
          {editing ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(org); }}><X className="h-4 w-4"/></Button>
              <Button size="sm" onClick={async () => { if (await updateOrg(org.id, draft)) setEditing(false); }}><Check className="h-4 w-4 mr-1"/>Save</Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(true); setDraft(org); }}><Pencil className="h-4 w-4"/></Button>
              <Button size="sm" variant="ghost" onClick={async () => {
                if (confirm(`Delete organization "${org.name}"? Blocked if any venues or bank accounts reference it.`)) await deleteOrg(org.id);
              }}><Trash2 className="h-4 w-4"/></Button>
            </>
          )}
        </div>
      </div>

      {/* Venues list */}
      <div className="p-4 space-y-2">
        {venues.length === 0 && !addingVenue && (
          <EmptyState
            title="No venues in this organization yet"
            action={<Button size="sm" onClick={() => setAddingVenue(true)}><Plus className="h-4 w-4 mr-1"/>Add venue</Button>}
          />
        )}
        {venues.map((v) => (
          <div key={v.id} className="rounded-lg border border-border/60 p-3 flex items-center gap-3">
            {editingVenueId === v.id ? (
              <>
                <Input value={venueDraft.name} onChange={(e) => setVenueDraft({ ...venueDraft, name: e.target.value })} className="h-8 flex-1"/>
                <Input type="number" placeholder="Seats" value={venueDraft.seats} onChange={(e) => setVenueDraft({ ...venueDraft, seats: e.target.value })} className="h-8 w-24"/>
                <Button size="sm" variant="ghost" onClick={() => saveVenue(v)}><Check className="h-4 w-4"/></Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingVenueId(null)}><X className="h-4 w-4"/></Button>
              </>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium flex items-center gap-2">
                    {v.name}
                    {v.is_system && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <Lock className="h-3 w-3"/> system
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                    <span>Seats: <span className="text-foreground tabular-nums">{v.seats ?? "—"}</span></span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3"/>
                      <span className="tabular-nums">{spCounts[v.id] ?? 0}</span> service period{(spCounts[v.id] ?? 0) === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch checked={v.is_active} onCheckedChange={(c) => updateVenue(v.id, { is_active: c })}/>
                    {v.is_active ? "Active" : "Inactive"}
                  </label>
                  <Button asChild size="sm" variant="ghost" title="Configure service periods">
                    <Link to={`/revenue/service-periods?venue=${v.id}`}><Clock className="h-4 w-4"/></Link>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingVenueId(v.id); setVenueDraft({ name: v.name, seats: v.seats?.toString() ?? "" }); }}>
                    <Pencil className="h-4 w-4"/>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={async () => {
                    if (v.is_system) return;
                    if (confirm(`Delete venue "${v.name}"? Blocked if any data references it.`)) await deleteVenue(v);
                  }} disabled={v.is_system} title={v.is_system ? "System venues cannot be deleted" : "Delete"}>
                    <Trash2 className="h-4 w-4"/>
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}

        {addingVenue ? (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-border bg-muted/20">
            <Input placeholder="Venue name" value={newVenueName} onChange={(e) => setNewVenueName(e.target.value)} className="h-9 flex-1" autoFocus/>
            <Input type="number" placeholder="Seats" value={newVenueSeats} onChange={(e) => setNewVenueSeats(e.target.value)} className="h-9 w-28"/>
            <Button size="sm" onClick={submitNewVenue} disabled={!newVenueName.trim()}>Add</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAddingVenue(false); setNewVenueName(""); setNewVenueSeats(""); }}>Cancel</Button>
          </div>
        ) : venues.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setAddingVenue(true)}>
            <Plus className="h-4 w-4 mr-1"/>Add venue to this organization
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------- Add-Organization inline ----------
function AddOrgForm({ onCancel, onSave }: { onCancel: () => void; onSave: (o: Partial<Organization>) => Promise<boolean> }) {
  const [draft, setDraft] = useState<Partial<Organization>>({ name: "" });
  return (
    <div className="card-glass rounded-xl border border-dashed border-border p-5 space-y-3 bg-muted/20">
      <div className="text-sm font-medium">New organization</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Input placeholder="Name *" value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-8"/>
        <Input placeholder="Legal name" value={draft.legal_name ?? ""} onChange={(e) => setDraft({ ...draft, legal_name: e.target.value })} className="h-8"/>
        <Input placeholder="Registration #" value={draft.registration_number ?? ""} onChange={(e) => setDraft({ ...draft, registration_number: e.target.value })} className="h-8"/>
        <Input type="date" value={draft.incorporation_date ?? ""} onChange={(e) => setDraft({ ...draft, incorporation_date: e.target.value })} className="h-8"/>
        <Input placeholder="Registered address" value={draft.registered_address ?? ""} onChange={(e) => setDraft({ ...draft, registered_address: e.target.value })} className="h-8 md:col-span-2"/>
        <Input placeholder="Auditor" value={draft.auditor ?? ""} onChange={(e) => setDraft({ ...draft, auditor: e.target.value })} className="h-8 md:col-span-2"/>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={async () => { if (!draft.name?.trim()) return; if (await onSave(draft)) onCancel(); }}>Add organization</Button>
      </div>
    </div>
  );
}

export default function BusinessStructure() {
  const { isAdmin } = useAuth();
  const { tenantId } = useActiveTenant();
  const { organizations, loading: orgLoading, create: createOrg, update: updateOrg, remove: removeOrg } = useOrganizations();
  const { venues, loading: venuesLoading, create: createVenue, update: updateVenue, remove: removeVenue } = useVenues();
  const [adding, setAdding] = useState(false);

  const venueIds = useMemo(() => venues.map((v) => v.id), [venues]);
  const spCounts = useServicePeriodCounts(venueIds);

  if (!isAdmin) return <Navigate to="/" replace/>;

  const venuesByOrg = useMemo(() => {
    const map = new Map<string, Venue[]>();
    for (const v of venues) {
      const key = v.organization_id ?? "__none__";
      const arr = map.get(key) ?? [];
      arr.push(v);
      map.set(key, arr);
    }
    return map;
  }, [venues]);

  const orphans = venuesByOrg.get("__none__") ?? [];
  const activeVenues = venues.filter((v) => v.is_active).length;
  const totalPeriods = Object.values(spCounts).reduce((s, n) => s + n, 0);

  return (
    <div className="p-6 space-y-6 max-w-[1100px] mx-auto">
      <PageHeader
        title="Business Structure"
        description="Organizations (legal entities) and the venues they operate. Venues, bank accounts and reporting all roll up through this hierarchy."
        actions={
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1"/>Add organization
          </Button>
        }
      />

      <KpiGrid>
        <KpiCard label="Organizations" value={organizations.length}/>
        <KpiCard label="Venues" value={venues.length}/>
        <KpiCard label="Active venues" value={activeVenues}/>
        <KpiCard label="Service periods" value={totalPeriods}/>
      </KpiGrid>

      {adding && (
        <AddOrgForm
          onCancel={() => setAdding(false)}
          onSave={async (o) => !!(await createOrg(o as any))}
        />
      )}

      {orgLoading || venuesLoading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : organizations.length === 0 ? (
        <EmptyState
          title="No organizations yet"
          description="Add a legal entity to start. Every venue must belong to an organization."
          action={<Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1"/>Add organization</Button>}
        />
      ) : (
        <div className="space-y-4">
          {organizations.map((org) => (
            <OrgCard
              key={org.id}
              org={org}
              venues={(venuesByOrg.get(org.id) ?? []).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))}
              spCounts={spCounts}
              updateOrg={updateOrg}
              deleteOrg={removeOrg}
              addVenue={(name, seats) => createVenue({ name, seats, organization_id: org.id })}
              updateVenue={updateVenue}
              deleteVenue={(v) => removeVenue(v.id)}
            />
          ))}
        </div>
      )}

      {orphans.length > 0 && (
        <div className="card-glass rounded-xl border border-warning/30 p-5 space-y-3">
          <div className="text-sm font-semibold text-warning flex items-center gap-2">
            <Building2 className="h-4 w-4"/>Venues without an organization
          </div>
          <div className="text-xs text-muted-foreground">
            These venues predate the organization layer. Assign each to an organization above.
          </div>
          <div className="space-y-1">
            {orphans.map((v) => (
              <div key={v.id} className="text-sm border border-border/60 rounded-md p-2 flex items-center justify-between">
                <span>{v.name}</span>
                <Link to={`/revenue/service-periods?venue=${v.id}`} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                  Service periods <ExternalLink className="h-3 w-3"/>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
