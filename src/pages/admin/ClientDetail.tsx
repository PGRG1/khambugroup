import { useEffect, useState, useCallback } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Building2, CheckCircle2, Circle, Loader2, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { CreateUserDialog } from "@/components/access-control/CreateUserDialog";
import { UserEditorPanel } from "@/components/access-control/UserEditorPanel";
import {
  ALL_PAGES,
  type UserAccessRecord,
  type UserPosition,
  type UserStatus,
} from "@/utils/permissions";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
  legal_entity_name?: string | null;
  country?: string | null;
  base_currency?: string | null;
  timezone?: string | null;
  cost_reporting_mode?: "single_venue" | "multi_venue" | null;
  created_at: string;
};

type Venue = { id: string; name: string };

const COST_MODES: { value: "single_venue" | "multi_venue"; label: string; desc: string }[] = [
  { value: "single_venue", label: "Single Venue", desc: "One venue for the whole client. Simplifies COGS/inventory reporting." },
  { value: "multi_venue", label: "Multi-Venue", desc: "Costs are split and reported per venue." },
];

export default function ClientDetail() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { isPlatformAdmin, loading: gateLoading } = usePlatformAdmin();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [users, setUsers] = useState<UserAccessRecord[]>([]);
  const [banksCount, setBanksCount] = useState(0);
  const [invoicesCount, setInvoicesCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [showAddVenue, setShowAddVenue] = useState(false);
  const [newVenueName, setNewVenueName] = useState("");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccessRecord | null>(null);
  const [savingMode, setSavingMode] = useState(false);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [{ data: t }, { data: vs }, { data: bs }, { data: is }, { data: members }, { data: pageRows }, { data: acRows }, { data: profileRows }, { data: venueAccess }, emailRes] = await Promise.all([
      supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle(),
      supabase.from("venues").select("id, name").eq("tenant_id", tenantId).order("name"),
      supabase.from("bank_accounts").select("id").eq("tenant_id", tenantId),
      supabase.from("invoices").select("id").eq("tenant_id", tenantId),
      supabase.from("tenant_members").select("user_id, role").eq("tenant_id", tenantId),
      supabase.from("user_page_permissions").select("*").eq("tenant_id", tenantId),
      supabase.from("user_access_control").select("*").eq("tenant_id", tenantId),
      supabase.from("profiles").select("user_id, display_name"),
      supabase.from("user_venue_access").select("user_id, venue_id").eq("tenant_id", tenantId),
      supabase.functions.invoke("list-users"),
    ]);

    setTenant((t as Tenant) ?? null);
    setVenues((vs as Venue[]) ?? []);
    setBanksCount((bs ?? []).length);
    setInvoicesCount((is ?? []).length);

    const emailMap = new Map<string, string>();
    if ((emailRes as any)?.data?.users) {
      for (const u of (emailRes as any).data.users) emailMap.set(u.id, u.email);
    }
    const profMap = new Map<string, string | null>();
    (profileRows ?? []).forEach((p: any) => profMap.set(p.user_id, p.display_name));

    const acMap = new Map<string, any>();
    (acRows ?? []).forEach((a: any) => acMap.set(a.user_id, a));

    const venueByUser = new Map<string, string[]>();
    (venueAccess ?? []).forEach((r: any) => {
      const arr = venueByUser.get(r.user_id) || [];
      arr.push(r.venue_id);
      venueByUser.set(r.user_id, arr);
    });

    const pagesByUser = new Map<string, any[]>();
    (pageRows ?? []).forEach((p: any) => {
      const arr = pagesByUser.get(p.user_id) || [];
      arr.push({
        page_key: p.page_key,
        show_in_sidebar: p.show_in_sidebar,
        can_access: p.can_access,
        authority: p.authority,
        hidden_actions: (p.hidden_actions as string[]) || [],
      });
      pagesByUser.set(p.user_id, arr);
    });

    const list: UserAccessRecord[] = (members ?? []).map((m: any) => {
      const ac = acMap.get(m.user_id);
      return {
        user_id: m.user_id,
        email: emailMap.get(m.user_id) || m.user_id.slice(0, 8),
        display_name: profMap.get(m.user_id) ?? null,
        position: (ac?.position ?? (m.role === "admin" ? "owner" : "viewer")) as UserPosition,
        status: (ac?.status ?? "active") as UserStatus,
        is_approver: false,
        pages: pagesByUser.get(m.user_id) ?? [],
        venue_ids: venueByUser.get(m.user_id) ?? [],
      };
    });
    setUsers(list);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { if (isPlatformAdmin && tenantId) refresh(); }, [isPlatformAdmin, tenantId, refresh]);

  if (gateLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isPlatformAdmin) return <Navigate to="/" replace />;
  if (!tenantId) return <Navigate to="/admin/clients" replace />;

  const handleAddVenue = async () => {
    if (!newVenueName.trim()) return;
    const { error } = await supabase.from("venues").insert({
      tenant_id: tenantId,
      name: newVenueName.trim(),
    });
    if (error) {
      toast({ title: "Failed to add venue", description: error.message, variant: "destructive" });
      return;
    }
    setNewVenueName("");
    setShowAddVenue(false);
    toast({ title: "Venue added" });
    refresh();
  };

  const handleDeleteVenue = async (venueId: string, name: string) => {
    if (!confirm(`Delete venue "${name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("venues").delete().eq("id", venueId);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Venue deleted" });
    refresh();
  };

  const handleCostModeChange = async (value: "single_venue" | "multi_venue") => {
    if (!tenant) return;
    setSavingMode(true);
    const { error } = await supabase.from("tenants").update({ cost_reporting_mode: value }).eq("id", tenantId);
    setSavingMode(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    setTenant({ ...tenant, cost_reporting_mode: value });
    toast({ title: "Cost reporting mode updated" });
  };

  // Setup checklist ---------------------------------------------------
  const hasAdminUser = users.some(u => u.position === "owner" || u.position === "gm" || u.position === "finance");
  const hasPagePerms = users.some(u => u.pages.length > 0);
  const checklist = [
    { key: "client",   label: "Client group created",       done: true },
    { key: "venue",    label: "At least one venue defined", done: venues.length > 0 },
    { key: "admin",    label: "Client admin user added",    done: hasAdminUser },
    { key: "pages",    label: "Page permissions configured", done: hasPagePerms },
    { key: "cost",     label: "Cost reporting mode chosen",  done: !!tenant?.cost_reporting_mode },
    { key: "bank",     label: "Bank account added",          done: banksCount > 0 },
    { key: "invoice",  label: "First invoice processed",     done: invoicesCount > 0 },
    { key: "active",   label: "Client marked Active",        done: tenant?.status === "active" },
  ];
  const done = checklist.filter(c => c.done).length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/clients")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Clients
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-2xl font-semibold tracking-tight">{tenant?.name ?? "…"}</h1>
              <Badge variant="outline" className="text-[10px]">/{tenant?.slug}</Badge>
              <Badge className={
                tenant?.status === "active" ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                : tenant?.status === "setup" ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
                : "bg-muted text-muted-foreground"
              }>{tenant?.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {tenant?.legal_entity_name} · {tenant?.country} · {tenant?.base_currency} · {tenant?.timezone}
            </p>
          </div>
        </div>
      </div>

      {/* Setup progress */}
      <section className="card-glass rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-semibold">Setup Progress</div>
            <div className="text-xs text-muted-foreground">{done} of {checklist.length} steps complete</div>
          </div>
          <div className="w-40 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={done === checklist.length ? "h-full bg-emerald-500" : "h-full bg-amber-500"}
              style={{ width: `${(done / checklist.length) * 100}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {checklist.map(c => (
            <div key={c.key} className="flex items-center gap-2 text-sm">
              {c.done
                ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                : <Circle className="h-4 w-4 text-muted-foreground" />}
              <span className={c.done ? "" : "text-muted-foreground"}>{c.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Cost reporting mode */}
      <section className="card-glass rounded-lg p-5">
        <div className="mb-3">
          <div className="text-sm font-semibold">Cost Reporting Mode</div>
          <div className="text-xs text-muted-foreground">Controls how procurement costs and inventory are reported.</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {COST_MODES.map(m => {
            const active = tenant?.cost_reporting_mode === m.value;
            return (
              <label
                key={m.value}
                className={`border rounded-lg p-3 cursor-pointer flex items-start gap-3 transition ${
                  active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
                }`}
              >
                <input
                  type="radio"
                  name="cost-mode"
                  className="mt-1"
                  checked={active}
                  disabled={savingMode}
                  onChange={() => handleCostModeChange(m.value)}
                />
                <div>
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{m.desc}</div>
                </div>
              </label>
            );
          })}
        </div>
      </section>

      {/* Venues */}
      <section className="card-glass rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-semibold">Venues</div>
            <div className="text-xs text-muted-foreground">{venues.length} venue{venues.length === 1 ? "" : "s"}</div>
          </div>
          <Button size="sm" onClick={() => setShowAddVenue(v => !v)}>
            <Plus className="h-4 w-4 mr-1" /> Add Venue
          </Button>
        </div>

        {showAddVenue && (
          <div className="flex items-end gap-2 mb-4 p-3 border border-border rounded-lg bg-muted/20">
            <div className="flex-1">
              <Label className="text-xs">Venue name</Label>
              <Input
                value={newVenueName}
                onChange={e => setNewVenueName(e.target.value)}
                placeholder="e.g. KHAMBU Central"
                autoFocus
              />
            </div>
            <Button size="sm" onClick={handleAddVenue} disabled={!newVenueName.trim()}>Create</Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowAddVenue(false); setNewVenueName(""); }}>Cancel</Button>
          </div>
        )}

        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Name</th>
                <th className="text-left px-3 py-2 font-medium">Currency</th>
                <th className="text-left px-3 py-2 font-medium">Timezone</th>
                <th className="text-right px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {venues.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No venues yet.</td></tr>
              )}
              {venues.map((v, idx) => (
                <tr key={v.id} className={`border-t border-border/40 ${idx % 2 === 1 ? "bg-muted/10" : ""}`}>
                  <td className="px-3 py-2 font-medium">{v.name}</td>
                  <td className="px-3 py-2 td-num">{v.base_currency ?? "—"}</td>
                  <td className="px-3 py-2">{v.timezone ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => handleDeleteVenue(v.id, v.name)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Users */}
      <section className="card-glass rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-sm font-semibold">Users</div>
              <div className="text-xs text-muted-foreground">{users.length} member{users.length === 1 ? "" : "s"} of this client</div>
            </div>
          </div>
          <Button size="sm" onClick={() => setShowCreateUser(true)}>
            <UserPlus className="h-4 w-4 mr-1" /> Add User
          </Button>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Email</th>
                <th className="text-left px-3 py-2 font-medium">Name</th>
                <th className="text-left px-3 py-2 font-medium">Position</th>
                <th className="text-left px-3 py-2 font-medium">Venues</th>
                <th className="text-left px-3 py-2 font-medium">Pages</th>
                <th className="text-right px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…
                </td></tr>
              )}
              {!loading && users.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No users yet.</td></tr>
              )}
              {users.map((u, idx) => {
                const venueLabel = u.venue_ids.length === 0
                  ? "All venues"
                  : u.venue_ids.map(id => venues.find(v => v.id === id)?.name).filter(Boolean).slice(0, 2).join(", ")
                    + (u.venue_ids.length > 2 ? ` + ${u.venue_ids.length - 2}` : "");
                return (
                  <tr key={u.user_id} className={`border-t border-border/40 ${idx % 2 === 1 ? "bg-muted/10" : ""}`}>
                    <td className="px-3 py-2 font-mono text-xs">{u.email}</td>
                    <td className="px-3 py-2">{u.display_name ?? "—"}</td>
                    <td className="px-3 py-2"><Badge variant="outline" className="capitalize text-[10px]">{u.position}</Badge></td>
                    <td className="px-3 py-2 text-xs">{venueLabel}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {u.pages.filter(p => p.can_access).slice(0, 4).map(p => (
                          <Badge key={p.page_key} variant="secondary" className="text-[10px]">
                            {ALL_PAGES.find(ap => ap.key === p.page_key)?.label ?? p.page_key}
                          </Badge>
                        ))}
                        {u.pages.filter(p => p.can_access).length > 4 && (
                          <span className="text-[10px] text-muted-foreground">+{u.pages.filter(p => p.can_access).length - 4}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button size="sm" variant="outline" onClick={() => setEditingUser(u)}>Edit</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <CreateUserDialog
        open={showCreateUser}
        onOpenChange={setShowCreateUser}
        tenantId={tenantId}
        onCreated={refresh}
      />
      {editingUser && (
        <UserEditorPanel
          user={editingUser}
          tenantId={tenantId}
          onClose={() => setEditingUser(null)}
          onSaved={() => { setEditingUser(null); refresh(); }}
        />
      )}
    </div>
  );
}
