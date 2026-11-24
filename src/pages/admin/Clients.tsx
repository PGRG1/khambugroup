import { useEffect, useMemo, useState, useCallback } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Plus, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { Num, useHomePlay } from "@/components/home/HomeMotion";
import { useTenantSession } from "@/hooks/useTenantSession";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { clientStatus, loadClientSetup, type SetupState } from "@/utils/clientSetup";

type ClientRow = { id: string; name: string; slug: string; status: string; created_at: string };

const COUNTRIES = ["Hong Kong","Singapore","Macau","United Kingdom","France","Nepal","India","Thailand","Vietnam","Other"];
const CURRENCIES = ["HKD","USD","EUR","GBP","SGD","MOP","INR","NPR","THB","VND"];
const TIMEZONES = ["Asia/Hong_Kong","Asia/Singapore","Asia/Macau","Europe/London","Europe/Paris","Asia/Kathmandu","Asia/Kolkata","Asia/Bangkok","Asia/Ho_Chi_Minh","UTC"];
const FY_OPTIONS = [
  { value: "01-01", label: "1 January (calendar year)" },
  { value: "04-01", label: "1 April" },
  { value: "07-01", label: "1 July" },
  { value: "10-01", label: "1 October" },
];

type Counts = { venues: number; users: number };

function Dot({ status }: { status: "active" | "setup" | "suspended" }) {
  const label = status === "active" ? "Active" : status === "suspended" ? "Suspended" : "In setup";
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-normal ${status === "active" ? "" : "text-muted-foreground"}`}>
    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${status === "active" ? "bg-[#3E9B6B]" : status === "suspended" ? "bg-[#C26A12]" : "bg-[#B8C0BB]"}`} />{label}</span>;
}

export default function Clients() {
  const { isPlatformAdmin, loading: gateLoading } = usePlatformAdmin();
  const navigate = useNavigate();
  const { enterClient } = useTenantSession();
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [onboarding, setOnboarding] = useState<Record<string, SetupState>>({});
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "setup">("all");

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("tenants")
      .select("id, name, slug, status, created_at")
      .neq("status", "internal") // the internal Bani business (Bani team) is not a client
      .order("created_at", { ascending: false });
    const tenants = (data ?? []) as ClientRow[];
    if (tenants.length) {
      const ids = tenants.map((d) => d.id);
      const [{ data: vs }, { data: us }, setups] = await Promise.all([
        supabase.from("venues").select("tenant_id").in("tenant_id", ids),
        supabase.from("tenant_members").select("tenant_id, user_id").in("tenant_id", ids),
        Promise.all(ids.map((id) => loadClientSetup(id))), // read from each client's data, not ticked by hand
      ]);
      const next: Record<string, Counts> = {};
      for (const id of ids) next[id] = { venues: 0, users: 0 };
      (vs ?? []).forEach((v: any) => { if (next[v.tenant_id]) next[v.tenant_id].venues += 1; });
      // Distinct users per tenant
      const userSets: Record<string, Set<string>> = {};
      (us ?? []).forEach((m: any) => {
        userSets[m.tenant_id] = userSets[m.tenant_id] || new Set();
        userSets[m.tenant_id].add(m.user_id);
      });
      for (const id of ids) next[id].users = userSets[id]?.size ?? 0;
      setCounts(next);
      setOnboarding(Object.fromEntries(ids.map((id, i) => [id, setups[i]])));
      setRows(tenants);
    } else {
      setCounts({});
      setOnboarding({});
      setRows(tenants);
    }
  }, []);

  useEffect(() => { if (isPlatformAdmin) refresh(); }, [isPlatformAdmin, refresh]);

  const list = useMemo(() => {
    return (rows ?? [])
      .map((r) => ({
        ...r,
        shownStatus: clientStatus(r.status, onboarding[r.id]),
        c: counts[r.id] ?? { venues: 0, users: 0 },
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, onboarding, counts]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? list.filter((r) => r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q)) : list;
  }, [list, query]);

  const loaded = rows !== null;
  const [go, setGo] = useState(loaded);
  useEffect(() => {
    if (go) return;
    if (loaded) { setGo(true); return; }
    const t = window.setTimeout(() => setGo(true), 2500);
    return () => window.clearTimeout(t);
  }, [loaded, go]);
  const play = useHomePlay("platform-clients", go && loaded);

  // Like Home: hold the page until the list and its counts are in (up to 2.5s), then one entrance.
  if (gateLoading) return <div className="min-h-[50vh]" role="status" aria-busy="true" aria-label="Loading" />;
  if (!isPlatformAdmin) return <Navigate to="/" replace />;

  // All four figures appear together once the client list and its counts are both loaded (never as 0 first).
  const ready = rows !== null;
  const totalClients = list.length;
  const totalActive = list.filter((r) => r.shownStatus === "active").length;
  const totalSetup = list.filter((r) => r.shownStatus === "setup").length;
  const totalVenues = list.reduce((sum, r) => sum + r.c.venues, 0);
  const totalUsers = list.reduce((sum, r) => sum + r.c.users, 0);

  const kpis: { label: string; short: string; value: number; extra?: string; accent?: boolean }[] = [
    { label: "Total clients", short: "Clients", value: totalClients },
    { label: "Active", short: "Active", value: totalActive, accent: true },
    { label: "In setup", short: "In setup", value: totalSetup },
    { label: "Total venues", short: "Venues", value: totalVenues },
    { label: "Total users", short: "Users", value: totalUsers },
  ];

  const filters: { key: "all" | "active" | "setup"; label: string; n: number }[] = [
    { key: "all", label: "All", n: totalClients },
    { key: "active", label: "Active", n: totalActive },
    { key: "setup", label: "In setup", n: totalSetup },
  ];
  const visible = filter !== "all" ? shown.filter((r) => r.shownStatus === filter) : shown;

  const empty = rows === null ? "Loading…" : rows.length === 0 ? "No clients yet." : visible.length === 0 ? "No clients match." : null;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

  const searchBox = (cls: string) => (
    <label className={`flex items-center gap-2 h-11 px-3.5 rounded-xl border border-border bg-card text-muted-foreground ${cls}`}>
      <Search className="h-4 w-4 shrink-0" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search clients"
        aria-label="Search clients"
        className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[15px] text-foreground placeholder:text-muted-foreground"
      />
    </label>
  );

  return (
    <div className={`w-full clients-page ${go ? `cl-go ${play ? "cl-play" : ""}` : "cl-hold"}`}>
      {/* Title row */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display font-medium tracking-tight text-[30px] sm:text-[32px] lg:text-[34px] leading-none dark:text-white">
          Clients
        </h1>
        <div className="flex items-center gap-3">
          <Button onClick={() => setOpen(true)} aria-label="Add Client" className="h-11 w-11 sm:w-auto sm:px-[18px] p-0 rounded-xl text-[15px] shrink-0">
            <Plus className="h-5 w-5 sm:h-[18px] sm:w-[18px] sm:mr-1.5" /><span className="hidden sm:inline">Add Client</span>
          </Button>
        </div>
      </div>

      {/* KPIs: plain numbers on phone/tablet, one strip on desktop */}
      <div className="mt-5 md:hidden card-glass rounded-2xl grid grid-cols-5 overflow-hidden">
        {kpis.map((k, i) => (
          <div key={k.label} className={`min-w-0 flex flex-col items-center gap-1.5 py-3.5 border-border/70 dark:border-white/[0.06] ${i ? "border-l" : ""}`}>
            <span className={`text-[22px] leading-none font-medium tabular-nums ${k.accent ? "text-primary" : "dark:text-white"}`}>{ready ? <span className="clients-fade"><Num value={k.value} format={(n) => String(Math.round(n))} play={play} delay={260 + i * 70} duration={700} /></span> : <span className="clients-sk" aria-hidden="true">&nbsp;</span>}</span>
            <span className="text-[12px] text-muted-foreground whitespace-nowrap">{k.short}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 xl:mt-7 hidden md:grid card-glass rounded-2xl grid-cols-5 overflow-hidden">
        {kpis.map((k, i) => (
          <div key={k.label} className={`px-[18px] py-4 xl:px-6 xl:py-[18px] flex flex-col gap-2.5 min-w-0 border-border/70 dark:border-white/[0.06] ${i ? "border-l" : ""}`}>
            <div className="font-plex text-[10.5px] xl:text-[11px] uppercase tracking-[0.14em] text-muted-foreground truncate">{k.label}</div>
            <div className="flex items-baseline gap-2 min-w-0">
              <span className={`font-display font-medium tabular-nums leading-none tracking-tight text-[28px] xl:text-[32px] ${k.accent ? "text-primary dark:text-primary" : "dark:text-white"}`}>
                {ready ? <span className="clients-fade"><Num value={k.value} format={(n) => String(Math.round(n))} play={play} delay={260 + i * 70} duration={700} /></span> : <span className="clients-sk" aria-hidden="true">&nbsp;</span>}
              </span>
              {k.extra && ready && <span className="clients-fade text-[14px] text-muted-foreground tabular-nums whitespace-nowrap">{k.extra}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* One list card for every screen size, like Bani team: the count, filter and search, then one row per client.
          Phone shows name, status and counts; tablet and computer show the table. Tap a row to manage; Enter goes in. */}
      <section className="mt-5 card-glass rounded-2xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Clients">
        <h2 className="text-base font-semibold px-1 flex flex-wrap gap-x-1.5"><span>{plural(totalClients, "client")}</span>{totalSetup > 0 && <span className="text-[13px] text-muted-foreground font-normal">· {totalSetup} in setup</span>}</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex gap-1 rounded-full bg-black/[0.05] p-[3px] self-start">
            {filters.map((f) => <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
              className={`h-8 px-3 rounded-full text-[13px] whitespace-nowrap ${filter === f.key ? "bg-white font-semibold shadow-sm" : "text-muted-foreground"}`}>{f.label}</button>)}
          </div>
          {searchBox("flex-1 h-10 rounded-full")}
        </div>
        {empty ? <p className="p-10 text-center text-sm text-muted-foreground">{empty}</p> : <>
          <ul className="md:hidden">{visible.map((r) => <li key={r.id} className="flex items-center gap-3 min-h-[60px] border-b border-[#ECEAE3] last:border-b-0">
            <button type="button" onClick={() => navigate(`/platform/clients/${r.id}`)} className="flex-1 min-w-0 text-left py-2">
              <span className="flex items-center gap-2"><span className="font-medium text-[15px] truncate">{r.name}</span><Dot status={r.shownStatus} /></span>
              <span className="block text-[12.5px] text-muted-foreground tabular-nums">{plural(r.c.venues, "venue")} · {plural(r.c.users, "user")}</span>
            </button>
            <button type="button" className="text-[13px] font-medium text-[#1F6B5E] px-2 h-10" onClick={() => enterClient(r.id, "/")}>Enter</button>
          </li>)}</ul>
          <div className="hidden md:block overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-[13px]" aria-label="Clients">
            <thead><tr className="text-[12px] text-muted-foreground">
              <th scope="col" className="h-9 px-2 text-left font-medium border-b border-[#ECEAE3]">Client</th>
              <th scope="col" className="h-9 px-2 text-left font-medium border-b border-[#ECEAE3]">Status</th>
              <th scope="col" className="h-9 px-2 text-right font-medium border-b border-[#ECEAE3]">Venues</th>
              <th scope="col" className="h-9 px-2 text-right font-medium border-b border-[#ECEAE3]">Users</th>
              <th scope="col" className="h-9 px-2 pl-6 text-left font-medium border-b border-[#ECEAE3]">Added</th>
              <th className="border-b border-[#ECEAE3]"><span className="sr-only">Enter</span></th>
            </tr></thead>
            <tbody>{visible.map((r) => <tr key={r.id} tabIndex={0} onClick={() => navigate(`/platform/clients/${r.id}`)} onKeyDown={(e) => e.key === "Enter" && navigate(`/platform/clients/${r.id}`)} className="cursor-pointer hover:bg-black/[0.025]">
              <td className="h-11 px-2 font-medium whitespace-nowrap border-b border-[#ECEAE3]">{r.name}</td>
              <td className="h-11 px-2 whitespace-nowrap border-b border-[#ECEAE3]"><Dot status={r.shownStatus} /></td>
              <td className="h-11 px-2 text-right tabular-nums border-b border-[#ECEAE3]">{r.c.venues}</td>
              <td className="h-11 px-2 text-right tabular-nums border-b border-[#ECEAE3]">{r.c.users}</td>
              <td className="h-11 px-2 pl-6 whitespace-nowrap text-muted-foreground border-b border-[#ECEAE3]">{new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Hong_Kong" })}</td>
              <td className="h-11 px-2 text-right border-b border-[#ECEAE3]"><button type="button" className="text-[13px] font-medium text-[#1F6B5E]" onClick={(e) => { e.stopPropagation(); enterClient(r.id, "/"); }}>Enter</button></td>
            </tr>)}</tbody></table></div>
        </>}
      </section>

      <div className="h-16" />

      <AddClientDialog open={open} onOpenChange={setOpen} onCreated={refresh} />
    </div>
  );
}

function AddClientDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    client_group_name: "",
    legal_entity_name: "",
    country: "Hong Kong",
    base_currency: "HKD",
    timezone: "Asia/Hong_Kong",
    financial_year_start: "04-01",
    initial_venue_name: "",
    admin_name: "",
    admin_email: "",
  });

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  // The client administrator is optional for now; a filled email must still be a real address.
  const valid = Object.entries(form).every(([k, v]) => k === "admin_name" || k === "admin_email" || String(v).trim().length > 0)
    && (!form.admin_email.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.admin_email.trim()));

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("provision-tenant", { body: form });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Client created", description: `${form.client_group_name} is ready.` });
      onOpenChange(false);
      setForm({
        client_group_name: "", legal_entity_name: "", country: "Hong Kong",
        base_currency: "HKD", timezone: "Asia/Hong_Kong", financial_year_start: "04-01",
        initial_venue_name: "", admin_name: "", admin_email: "",
      });
      onCreated();
    } catch (e: any) {
      toast({ title: "Provisioning failed", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Client</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <Field label="Client group name">
            <Input value={form.client_group_name} onChange={(e) => set("client_group_name")(e.target.value)} />
          </Field>
          <Field label="Legal entity name">
            <Input value={form.legal_entity_name} onChange={(e) => set("legal_entity_name")(e.target.value)} />
          </Field>
          <Field label="Country">
            <Select value={form.country} onValueChange={set("country")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Base currency">
            <Select value={form.base_currency} onValueChange={set("base_currency")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Timezone">
            <Select value={form.timezone} onValueChange={set("timezone")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIMEZONES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Financial year start">
            <Select value={form.financial_year_start} onValueChange={set("financial_year_start")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{FY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Initial venue name">
            <Input value={form.initial_venue_name} onChange={(e) => set("initial_venue_name")(e.target.value)} />
          </Field>
          <div className="hidden sm:block" />
          <Field label="Client administrator name (optional)">
            <Input value={form.admin_name} onChange={(e) => set("admin_name")(e.target.value)} />
          </Field>
          <Field label="Client administrator email (optional)">
            <Input type="email" value={form.admin_email} onChange={(e) => set("admin_email")(e.target.value)} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Create Client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
