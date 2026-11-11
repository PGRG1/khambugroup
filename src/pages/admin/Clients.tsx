import { useEffect, useMemo, useState, useCallback } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Plus, Loader2, LogIn, Search, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { useTenantSession } from "@/hooks/useTenantSession";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  ONBOARDING_PHASES, StepState, computeOverallProgress, currentPhase, displayClientStatus,
} from "@/lib/onboardingSteps";

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

const STATUS_LABELS: Record<string, string> = {
  setup: "In setup",
  active: "Active",
  suspended: "Suspended",
};
const STATUS_CHIP: Record<string, string> = {
  setup: "",
  active: "chip-success",
  suspended: "chip-neutral",
};

type Counts = { venues: number; users: number };

type Setup = { done: number; total: number; pct: number; phaseLabel: string };

/** Real onboarding progress from the Onboarding cockpit (skipped steps count as done, same as the cockpit). */
function setupFor(steps: Record<string, StepState> | null | undefined): Setup {
  const o = computeOverallProgress(steps);
  const done = o.done + o.skipped;
  if (done >= o.total) return { done, total: o.total, pct: 100, phaseLabel: "Complete" };
  const phaseNum = currentPhase(steps);
  const phase = ONBOARDING_PHASES.find((p) => p.phase === phaseNum);
  return { done, total: o.total, pct: o.pct, phaseLabel: `Phase ${phaseNum} · ${phase?.title ?? ""}` };
}

function SetupBar({ setup }: { setup: Setup }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex gap-[3px]" role="img" aria-label={`${setup.done} of ${setup.total} onboarding steps done`}>
        {Array.from({ length: setup.total }, (_, i) => (
          <span
            key={i}
            className={`h-2 w-2.5 rounded-[2px] ${i < setup.done ? "bg-primary" : "bg-[#DCE3DE] dark:bg-white/[0.10]"}`}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
        {setup.phaseLabel}
      </span>
    </div>
  );
}

function SetupBlocks({ setup }: { setup: Setup }) {
  return (
    <span className="flex gap-[3px]" role="img" aria-label={`${setup.done} of ${setup.total} onboarding steps done`}>
      {Array.from({ length: setup.total }, (_, i) => (
        <span key={i} className={`h-1.5 w-2.5 rounded-[2px] ${i < setup.done ? "bg-primary" : "bg-[#DCE3DE] dark:bg-white/[0.10]"}`} />
      ))}
    </span>
  );
}

const STATUS_TEXT: Record<string, string> = {
  setup: "text-muted-foreground",
  active: "text-success",
  suspended: "text-muted-foreground",
};

function StatusText({ status }: { status: string }) {
  return (
    <span className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${STATUS_TEXT[status] ?? "text-muted-foreground"}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />{STATUS_LABELS[status] ?? status}
    </span>
  );
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`chip whitespace-nowrap ${STATUS_CHIP[status] ?? "chip-neutral"}`}>
      <span className="dot" />{STATUS_LABELS[status] ?? status}
    </span>
  );
}

export default function Clients() {
  const { isPlatformAdmin, loading: gateLoading } = usePlatformAdmin();
  const navigate = useNavigate();
  const { enterClient } = useTenantSession();
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [onboarding, setOnboarding] = useState<Record<string, Record<string, StepState>>>({});
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "setup">("all");

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("tenants")
      .select("id, name, slug, status, created_at")
      .order("created_at", { ascending: false });
    const tenants = (data ?? []) as ClientRow[];
    setRows(tenants);
    if (tenants.length) {
      const ids = tenants.map((d) => d.id);
      const [{ data: vs }, { data: us }, { data: ob }] = await Promise.all([
        supabase.from("venues").select("tenant_id").in("tenant_id", ids),
        supabase.from("tenant_members").select("tenant_id, user_id").in("tenant_id", ids),
        supabase.from("tenant_onboarding").select("tenant_id, steps").in("tenant_id", ids),
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
      const steps: Record<string, Record<string, StepState>> = {};
      (ob ?? []).forEach((o: any) => { steps[o.tenant_id] = (o.steps ?? {}) as Record<string, StepState>; });
      setOnboarding(steps);
    } else {
      setCounts({});
      setOnboarding({});
    }
  }, []);

  useEffect(() => { if (isPlatformAdmin) refresh(); }, [isPlatformAdmin, refresh]);

  const list = useMemo(() => {
    return (rows ?? [])
      .map((r) => ({
        ...r,
        shownStatus: displayClientStatus(r.status, onboarding[r.id]),
        setup: setupFor(onboarding[r.id]),
        c: counts[r.id] ?? { venues: 0, users: 0 },
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, onboarding, counts]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? list.filter((r) => r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q)) : list;
  }, [list, query]);

  if (gateLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isPlatformAdmin) return <Navigate to="/" replace />;

  const totalClients = list.length;
  const totalActive = list.filter((r) => r.shownStatus === "active").length;
  const totalSetup = list.filter((r) => r.shownStatus === "setup").length;
  const totalVenues = list.reduce((sum, r) => sum + r.c.venues, 0);
  const totalUsers = list.reduce((sum, r) => sum + r.c.users, 0);

  const kpis: { label: string; short: string; value: number; extra?: string; accent?: boolean }[] = [
    { label: "Total clients", short: "Clients", value: totalClients },
    { label: "Active", short: "Active", value: totalActive, accent: true },
    { label: "In setup", short: "In setup", value: totalSetup },
    { label: "Total venues", short: "Venues", value: totalVenues, extra: `${totalUsers} ${totalUsers === 1 ? "user" : "users"}` },
  ];

  const MANY = 10;
  const showFilters = totalClients > MANY;
  const filters: { key: "all" | "active" | "setup"; label: string; n: number }[] = [
    { key: "all", label: "All", n: totalClients },
    { key: "active", label: "Active", n: totalActive },
    { key: "setup", label: "In setup", n: totalSetup },
  ];
  const visible = showFilters && filter !== "all" ? shown.filter((r) => r.shownStatus === filter) : shown;

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

  const filterPills = showFilters && (
    <div className="flex gap-2 overflow-x-auto">
      {filters.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => setFilter(f.key)}
          aria-pressed={filter === f.key}
          className={`h-9 px-3.5 rounded-full border text-[13px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            filter === f.key ? "bg-primary border-primary text-primary-foreground" : "bg-card border-border text-foreground hover:bg-muted/60"
          }`}
        >
          {f.label}<span className="opacity-70 tabular-nums">{f.n}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="w-full">
      {/* Title row */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display font-medium tracking-tight text-[30px] sm:text-[32px] lg:text-[34px] leading-none dark:text-white">
          Clients
        </h1>
        <div className="flex items-center gap-3">
          {searchBox("hidden xl:flex w-[280px]")}
          <Button onClick={() => setOpen(true)} aria-label="Add Client" className="h-11 w-11 sm:w-auto sm:px-[18px] p-0 rounded-xl text-[15px] shrink-0">
            <Plus className="h-5 w-5 sm:h-[18px] sm:w-[18px] sm:mr-1.5" /><span className="hidden sm:inline">Add Client</span>
          </Button>
        </div>
      </div>

      {/* KPIs: plain numbers on phone/tablet, one strip on desktop */}
      <div className="mt-5 md:hidden card-glass rounded-2xl grid grid-cols-4 overflow-hidden">
        {kpis.map((k, i) => (
          <div key={k.label} className={`min-w-0 flex flex-col items-center gap-1.5 py-3.5 border-border/70 dark:border-white/[0.06] ${i ? "border-l" : ""}`}>
            <span className={`text-[22px] leading-none font-medium tabular-nums ${k.accent ? "text-primary" : "dark:text-white"}`}>{k.value}</span>
            <span className="text-[12px] text-muted-foreground whitespace-nowrap">{k.short}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 xl:mt-7 hidden md:grid card-glass rounded-2xl grid-cols-4 overflow-hidden">
        {kpis.map((k, i) => (
          <div key={k.label} className={`px-[18px] py-4 xl:px-6 xl:py-[18px] flex flex-col gap-2.5 min-w-0 border-border/70 dark:border-white/[0.06] ${i ? "border-l" : ""}`}>
            <div className="font-plex text-[10.5px] xl:text-[11px] uppercase tracking-[0.14em] text-muted-foreground truncate">{k.label}</div>
            <div className="flex items-baseline gap-2 min-w-0">
              <span className={`font-display font-medium tabular-nums leading-none tracking-tight text-[28px] xl:text-[32px] ${k.accent ? "text-primary dark:text-primary" : "dark:text-white"}`}>
                {k.value}
              </span>
              {k.extra && <span className="text-[14px] text-muted-foreground tabular-nums whitespace-nowrap">{k.extra}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Phone / tablet: search, filters, one list */}
      <div className="xl:hidden mt-5 flex flex-col gap-2.5">
        {searchBox("w-full")}
        {filterPills}
      </div>
      <div className="md:hidden mt-4 card-glass rounded-2xl overflow-hidden divide-y divide-border/70 dark:divide-white/[0.06]">
        {empty && <div className="px-5 py-8 text-center text-muted-foreground">{empty}</div>}
        {visible.map((r) => (
          <div key={r.id} className="flex items-center gap-3 min-h-[92px] px-4">
            <button
              type="button"
              onClick={() => navigate(`/platform/clients/${r.id}`)}
              className="flex-1 min-w-0 flex flex-col gap-[7px] text-left py-3"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-[15.5px] leading-5 truncate dark:text-white">{r.name}</span>
                <StatusText status={r.shownStatus} />
              </span>
              <SetupBlocks setup={r.setup} />
              <span className="text-[12.5px] text-muted-foreground truncate tabular-nums">
                {r.setup.phaseLabel} · {plural(r.c.venues, "venue")} · {plural(r.c.users, "user")}
              </span>
            </button>
            <Button size="icon" className="h-11 w-11 rounded-xl shrink-0 bg-accent text-accent-foreground hover:bg-[#DCE8E0]" aria-label={`Enter ${r.name}`} onClick={() => enterClient(r.id, "/")}>
              <LogIn className="h-[18px] w-[18px]" />
            </Button>
          </div>
        ))}
      </div>

      {/* Tablet: two columns of cards */}
      <div className="hidden md:grid xl:hidden mt-4 grid-cols-2 gap-3">
        {empty && <div className="col-span-2 card-glass rounded-2xl px-5 py-8 text-center text-muted-foreground">{empty}</div>}
        {visible.map((r) => (
          <div key={r.id} className="card-glass rounded-[14px] p-4 flex flex-col gap-3.5 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex flex-col gap-0.5">
                <span className="font-medium text-[15px] leading-5 truncate dark:text-white">{r.name}</span>
                <span className="text-[12.5px] leading-[18px] text-muted-foreground truncate">/{r.slug}</span>
              </div>
              <StatusChip status={r.shownStatus} />
            </div>
            <SetupBar setup={r.setup} />
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/70 dark:border-white/[0.06]">
              <span className="text-[13px] text-muted-foreground whitespace-nowrap tabular-nums">
                {plural(r.c.venues, "venue")} · {plural(r.c.users, "user")}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-11 px-2.5 rounded-[10px] whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={() => navigate(`/platform/clients/${r.id}`)}
                >
                  Manage <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                </Button>
                <Button size="sm" className="h-11 px-4 rounded-[10px] whitespace-nowrap bg-accent text-accent-foreground hover:bg-[#DCE8E0]" onClick={() => enterClient(r.id, "/")}>
                  <LogIn className="h-4 w-4 mr-1.5" /> Enter
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: filters (more than 10 clients) + table */}
      {showFilters && <div className="hidden xl:block mt-6">{filterPills}</div>}
      <div className={`hidden xl:block card-glass rounded-2xl overflow-hidden ${showFilters ? "mt-3" : "mt-7"}`}>
        <div className="w-full overflow-x-auto" onScroll={(e) => setScrolled(e.currentTarget.scrollLeft > 0)}>
          <table className="w-full text-sm min-w-[860px]">
            <thead className="font-plex text-[11px] uppercase tracking-[0.14em] text-muted-foreground whitespace-nowrap">
              <tr className="border-b border-border/70 dark:border-white/[0.06]">
                <th scope="col" className={`sticky left-0 z-10 bg-card text-left px-5 py-3.5 font-medium transition-shadow ${scrolled ? "shadow-[8px_0_12px_-8px_rgba(20,45,43,0.18)]" : ""}`}>Client group</th>
                <th scope="col" className="text-center px-4 py-3.5 font-medium">Venues</th>
                <th scope="col" className="text-center px-4 py-3.5 font-medium">Users</th>
                <th scope="col" className="text-left pl-6 pr-4 py-3.5 font-medium">Setup</th>
                <th scope="col" className="text-left px-4 py-3.5 font-medium">Status</th>
                <th scope="col" className="text-right px-5 py-3.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {empty && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">{empty}</td></tr>
              )}
              {visible.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/platform/clients/${r.id}`)}
                  className="group h-[76px] border-b last:border-b-0 border-border/60 dark:border-white/[0.045] cursor-pointer transition-colors hover:bg-[rgba(20,45,43,0.04)] dark:hover:bg-white/[0.025]"
                >
                  <td className={`sticky left-0 z-10 bg-card px-5 py-0 transition-[background-color,box-shadow] group-hover:bg-[#F6F8F6] dark:group-hover:bg-[hsl(96_8%_13%)] ${scrolled ? "shadow-[8px_0_12px_-8px_rgba(20,45,43,0.18)]" : ""}`}>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-[15px] leading-5 whitespace-nowrap dark:text-white">{r.name}</span>
                      <span className="text-[12.5px] leading-[18px] text-muted-foreground whitespace-nowrap">/{r.slug}</span>
                    </div>
                  </td>
                  <td className="px-4 py-0 text-center text-[15px] tabular-nums dark:text-white">{r.c.venues}</td>
                  <td className="px-4 py-0 text-center text-[15px] tabular-nums dark:text-white">{r.c.users}</td>
                  <td className="pl-6 pr-4 py-0"><SetupBar setup={r.setup} /></td>
                  <td className="px-4 py-0"><StatusChip status={r.shownStatus} /></td>
                  <td className="px-5 py-0">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-[38px] px-2.5 rounded-[10px] whitespace-nowrap text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        onClick={(e) => { e.stopPropagation(); navigate(`/platform/clients/${r.id}`); }}
                      >
                        Manage <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                      </Button>
                      <Button
                        size="sm"
                        className="h-[38px] px-4 rounded-[10px] whitespace-nowrap bg-accent text-accent-foreground hover:bg-[#DCE8E0]"
                        onClick={(e) => { e.stopPropagation(); enterClient(r.id, "/"); }}
                      >
                        <LogIn className="h-4 w-4 mr-1.5" /> Enter
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
  const valid = Object.values(form).every((v) => String(v).trim().length > 0)
    && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.admin_email);

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
          <Field label="Client administrator name">
            <Input value={form.admin_name} onChange={(e) => set("admin_name")(e.target.value)} />
          </Field>
          <Field label="Client administrator email">
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
