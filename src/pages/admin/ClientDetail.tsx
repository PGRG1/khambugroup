import { useEffect, useState, useCallback } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, LogIn, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { useTenantSession } from "@/hooks/useTenantSession";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { ClientRoles } from "@/components/platform/ClientRoles";
import { SETUP_STEPS, loadClientSetup, setupSummary, type SetupState } from "@/utils/clientSetup";

// Control plane: a client's business setup, done by Bani — the company, its venues and what each role can do
// (the client only assigns roles to people). Everything else
// (accounts, tax, suppliers, team…) is set up inside the client's own Settings, by their team or by
// Bani support after "Enter client"; here it is only shown as read-only setup status.

type Tenant = { id: string; name: string; slug: string; status: string; country?: string | null; base_currency?: string | null; timezone?: string | null; users_managed_by?: "bani" | "client" };
type Org = { id: string; name: string | null; legal_name: string | null; registration_number: string | null; incorporation_date: string | null; registered_address: string | null; auditor: string | null };
type Venue = { id: string; name: string; is_active: boolean; organization_id: string | null };
type OrgKey = Exclude<keyof Org, "id">;

const ORG_FIELDS: { key: OrgKey; label: string; type?: string }[] = [
  { key: "name", label: "Company name" }, { key: "legal_name", label: "Legal name" }, { key: "registration_number", label: "BR number" },
  { key: "incorporation_date", label: "Incorporated", type: "date" }, { key: "registered_address", label: "Registered address" }, { key: "auditor", label: "Auditor" },
];
const HAIR = "border-t border-[#ECEFED]";
const Card = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <section className="card-glass rounded-xl overflow-hidden">
    <div className="flex items-center justify-between px-4 sm:px-5 py-3.5"><h2 className="text-sm font-semibold">{title}</h2>{action}</div>
    {children}
  </section>
);

export default function ClientDetail() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { isPlatformAdmin, loading: gateLoading } = usePlatformAdmin();
  const { enterClient } = useTenantSession();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [setup, setSetup] = useState<SetupState | undefined>();
  const [editOrg, setEditOrg] = useState<Partial<Org> | null>(null);
  const [newVenue, setNewVenue] = useState("");
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const [toggle, setToggle] = useState<Venue | null>(null);
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState(0);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    const [{ data: t }, { data: os }, { data: vs }, s, { count: us }] = await Promise.all([
      supabase.from("tenants").select("id, name, slug, status, country, base_currency, timezone, users_managed_by" as "*").eq("id", tenantId).maybeSingle(),
      supabase.from("organizations").select("id, name, legal_name, registration_number, incorporation_date, registered_address, auditor").eq("tenant_id", tenantId).order("created_at").limit(1),
      supabase.from("venues").select("id, name, is_active, organization_id").eq("tenant_id", tenantId).order("name"),
      loadClientSetup(tenantId),
      supabase.from("tenant_members").select("user_id", { count: "exact", head: true }).eq("tenant_id", tenantId).not("role", "in", "(platform_admin,super_admin)"),
    ]);
    setUsers(us ?? 0);
    setTenant((t as Tenant) ?? null); setOrg(((os ?? [])[0] as Org) ?? null); setVenues((vs ?? []) as Venue[]); setSetup(s);
  }, [tenantId]);
  useEffect(() => { if (isPlatformAdmin && tenantId) void refresh(); }, [isPlatformAdmin, tenantId, refresh]);

  if (gateLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isPlatformAdmin) return <Navigate to="/" replace />;
  if (!tenantId) return <Navigate to="/platform/clients" replace />;

  const done = (ok: boolean, msg: string, err?: { message: string } | null) => {
    if (err) toast({ title: "Not saved", description: err.message, variant: "destructive" }); else if (ok) toast({ title: msg });
    return !err;
  };
  const saveOrg = async () => {
    if (!editOrg) return;
    const body = Object.fromEntries(ORG_FIELDS.map((f) => [f.key, String(editOrg[f.key] ?? "").trim() || null])) as Partial<Org>;
    if (!body.name) return toast({ title: "Add the company name", variant: "destructive" });
    setBusy(true);
    const { error } = org
      ? await supabase.from("organizations").update(body).eq("id", org.id).eq("tenant_id", tenantId)
      : await supabase.from("organizations").insert({ ...body, name: body.name!, tenant_id: tenantId });
    setBusy(false);
    if (done(true, "Company saved", error)) { setEditOrg(null); void refresh(); }
  };
  const addVenue = async () => {
    const name = newVenue.trim(); if (!name) return;
    if (venues.some((v) => v.name.toLowerCase() === name.toLowerCase())) return toast({ title: `${name} already exists`, variant: "destructive" });
    setBusy(true);
    const { error } = await supabase.from("venues").insert({ tenant_id: tenantId, name, organization_id: org?.id ?? null, is_active: true });
    setBusy(false);
    if (done(true, `${name} added`, error)) { setNewVenue(""); void refresh(); }
  };
  const saveRename = async () => {
    if (!rename) return; const name = rename.name.trim(); if (!name) return;
    if (venues.some((v) => v.id !== rename.id && v.name.toLowerCase() === name.toLowerCase())) return toast({ title: `${name} already exists`, variant: "destructive" });
    setBusy(true);
    const { error } = await supabase.from("venues").update({ name }).eq("id", rename.id).eq("tenant_id", tenantId);
    setBusy(false);
    if (done(true, "Venue renamed", error)) { setRename(null); void refresh(); }
  };
  const saveToggle = async () => {
    if (!toggle) return; setBusy(true);
    const { error } = await supabase.from("venues").update({ is_active: !toggle.is_active }).eq("id", toggle.id).eq("tenant_id", tenantId);
    setBusy(false);
    if (done(true, `${toggle.name} ${toggle.is_active ? "closed" : "reopened"}`, error)) { setToggle(null); void refresh(); }
  };

  // Who adds and changes this client's users. Bani for now; hand it to the client later.
  const setUsersBy = async (by: "bani" | "client") => {
    if (!tenant || tenant.users_managed_by === by) return; setBusy(true);
    const { error } = await supabase.from("tenants").update({ users_managed_by: by } as never).eq("id", tenantId);
    setBusy(false);
    if (done(true, by === "bani" ? "Bani manages users" : "Client manages users", error)) void refresh();
  };
  const sum = setupSummary(setup);
  const details = [tenant?.country, tenant?.base_currency, tenant?.timezone].filter(Boolean).join(" · ");
  const row = "flex h-11 items-center justify-between gap-3 px-4 sm:px-5 text-[13px] " + HAIR;

  return (
    <div className="px-4 py-5 sm:p-6 space-y-5 max-w-[900px] mx-auto">
      <div className="space-y-3">
        <button type="button" onClick={() => navigate("/platform/clients")} className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Clients</button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-[22px] sm:text-2xl font-semibold tracking-tight">{tenant?.name ?? "…"}</h1>
            {details && <p className="mt-1 text-[13px] text-muted-foreground">{details}</p>}
          </div>
          <Button className="w-full sm:w-auto shrink-0" onClick={() => enterClient(tenantId, "/")}><LogIn className="h-4 w-4 mr-1.5" /> Enter client</Button>
        </div>
      </div>

      <Card title="Company" action={!editOrg && <button type="button" className="text-[13px] font-medium text-[#1F6B5E]" onClick={() => setEditOrg({ ...(org ?? {}) })}>{org ? "Edit" : "Add"}</button>}>
        {editOrg ? <div className={`space-y-3 px-4 sm:px-5 py-4 ${HAIR}`}>
          {ORG_FIELDS.map((f) => <label key={f.key} className="grid gap-1 text-[12px] text-muted-foreground">{f.label}
            <Input type={f.type ?? "text"} value={String(editOrg[f.key] ?? "")} onChange={(e) => setEditOrg({ ...editOrg, [f.key]: e.target.value })} className="h-10 text-[13px] text-foreground" /></label>)}
          <div className="flex justify-end gap-2 pt-1"><Button variant="ghost" onClick={() => setEditOrg(null)}>Cancel</Button><Button disabled={busy} onClick={() => void saveOrg()}>Save</Button></div>
        </div> : ORG_FIELDS.map((f) => <div key={f.key} className={row}><span className="text-muted-foreground whitespace-nowrap">{f.label}</span><span className="truncate text-right">{(f.type === "date" && org?.[f.key] ? new Date(`${org[f.key]}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : org?.[f.key]) || <span className="text-muted-foreground">—</span>}</span></div>)}
      </Card>

      <Card title={`Venues · ${venues.filter((v) => v.is_active).length} open`}>
        {venues.map((v) => <div key={v.id} className={row}>
          {rename?.id === v.id
            ? <><Input autoFocus aria-label="Venue name" value={rename.name} onChange={(e) => setRename({ ...rename, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && void saveRename()} className="h-8 max-w-[260px] text-[13px]" />
                <span className="flex gap-3 whitespace-nowrap"><button type="button" className="text-muted-foreground" onClick={() => setRename(null)}>Cancel</button><button type="button" disabled={busy} className="font-medium text-[#1F6B5E]" onClick={() => void saveRename()}>Save</button></span></>
            : <><span className={`truncate ${v.is_active ? "" : "text-muted-foreground"}`}>{v.name}{!v.is_active && " · Closed"}</span>
                <span className="flex gap-4 whitespace-nowrap text-muted-foreground"><button type="button" onClick={() => setRename({ id: v.id, name: v.name })}>Rename</button><button type="button" onClick={() => setToggle(v)}>{v.is_active ? "Close" : "Reopen"}</button></span></>}
        </div>)}
        <div className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 ${HAIR}`}>
          <Input aria-label="New venue name" placeholder="New venue name" value={newVenue} onChange={(e) => setNewVenue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void addVenue()} className="h-9 max-w-[260px] text-[13px]" />
          <Button size="sm" variant="outline" disabled={!newVenue.trim() || busy} onClick={() => void addVenue()}>Add venue</Button>
        </div>
      </Card>

      <Card title={`Users · ${users}`} action={<button type="button" className="text-[13px] font-medium text-[#1F6B5E]" onClick={() => enterClient(tenantId, "/settings?tab=users")}>Manage users</button>}>
        <div className={row}><span className="text-muted-foreground whitespace-nowrap">Who adds people and assigns roles</span>
          <span className="flex gap-4 whitespace-nowrap">{(["bani", "client"] as const).map((k) => <button key={k} type="button" disabled={busy} onClick={() => void setUsersBy(k)}
            className={(tenant?.users_managed_by ?? "bani") === k ? "font-medium text-foreground underline underline-offset-4" : "text-muted-foreground"}>{k === "bani" ? "Bani" : "Client"}</button>)}</span></div>
      </Card>

      {tenantId && <ClientRoles tenantId={tenantId} />}

      <Card title="Setup" action={<span className="text-[12px] text-muted-foreground tabular-nums">{sum.done} of {sum.total}</span>}>
        {SETUP_STEPS.map((s) => <div key={s.key} className={row}><span>{s.label}</span>
          {setup?.[s.key] ? <Check className="h-4 w-4 text-[#1F6B5E]" aria-label="Done" /> : <span className="text-muted-foreground">Not yet</span>}</div>)}
        <p className={`px-4 sm:px-5 py-3 text-[12px] text-muted-foreground ${HAIR}`}>Set up in the client's own Settings, by their team or by Bani support after Enter client.</p>
      </Card>

      <Dialog open={!!toggle} onOpenChange={(o) => !o && setToggle(null)}>
        <DialogContent><DialogHeader><DialogTitle>{toggle?.is_active ? "Close" : "Reopen"} {toggle?.name}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{toggle?.is_active ? "It stops appearing for new entries. All records are kept." : "It appears again for new entries."}</p>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setToggle(null)}>Cancel</Button><Button disabled={busy} onClick={() => void saveToggle()}>{toggle?.is_active ? "Close venue" : "Reopen venue"}</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
