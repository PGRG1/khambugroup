import { useEffect, useMemo, useState, useCallback } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Plus, Loader2, LogIn, Clock, Search } from "lucide-react";
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

const fmtDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
};

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
  setup: "chip-warn",
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

function SetupBar({ setup, wide = false }: { setup: Setup; wide?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center gap-2.5" role="img" aria-label={`Onboarding ${setup.pct}% done`}>
        <div className={`${wide ? "flex-1" : "w-[120px]"} h-1.5 rounded-full bg-muted dark:bg-white/[0.06] overflow-hidden`}>
          <div className="h-full bg-primary rounded-full" style={{ width: `${setup.pct}%` }} />
        </div>
        <span className="text-[13px] font-medium tabular-nums text-foreground">{setup.pct}%</span>
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
        {setup.done} of {setup.total} · {setup.phaseLabel}
      </span>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`chip whitespace-nowrap ${STATUS_CHIP[status] ?? "chip-neutral"}`}>
      <span className="dot" />{STATUS_LABELS[status] ?? status}
    </span>
  );
}

function LastEntered() {
  return (
    <span className="inline-flex items-center gap-1 font-plex text-[10px] uppercase tracking-[0.12em] text-muted-foreground border border-border bg-card rounded-full px-2 py-0.5 whitespace-nowrap">
      <Clock className="h-3 w-3" /> Last entered
    </span>
  );
}

function ClientTile({ name }: { name: string }) {
  return (
    <span className="shrink-0 h-[38px] w-[38px] rounded-[10px] bg-[#F2F5F3] text-[#1F3F3B] dark:bg-white/[0.05] dark:text-white inline-flex items-center justify-center text-[15px] font-semibold" aria-hidden="true">
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export default function Clients() {
  const { isPlatformAdmin, loading: gateLoading } = usePlatformAdmin();
  const navigate = useNavigate();
  const { enterClient, lastEnteredTenantId } = useTenantSession();
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [onboarding, setOnboarding] = useState<Record<string, Record<string, StepState>>>({});
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

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

  const kpis: { label: string; value: number; hint: string; accent?: boolean }[] = [
    { label: "Total clients", value: totalClients, hint: "Client groups on Bani" },
    { label: "Active", value: totalActive, hint: "Live after go-live steps", accent: true },
    { label: "In setup", value: totalSetup, hint: "Onboarding still open" },
    { label: "Total venues", value: totalVenues, hint: `${totalUsers} ${totalUsers === 1 ? "user" : "users"} across all clients` },
  ];

  const empty = rows === null ? "Loading…" : rows.length === 0 ? "No clients yet." : shown.length === 0 ? "No client groups match your search." : null;

  return (
    <div className="w-full">
      {/* Title row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display font-medium tracking-tight text-[28px] sm:text-[32px] lg:text-[34px] leading-none dark:text-white">
            Clients
          </h1>
          <p className="text-[15px] text-muted-foreground mt-2.5 max-w-xl leading-relaxed">
            Bani client groups provisioned on the platform.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="h-11 px-[18px] rounded-xl text-[15px] shrink-0 w-full sm:w-auto">
          <Plus className="h-[18px] w-[18px] mr-1.5" /> Add Client
        </Button>
      </div>

      {/* KPI strip */}
      <div className="mt-7 card-glass rounded-2xl grid grid-cols-2 lg:grid-cols-4 overflow-hidden">
        {kpis.map((k, i) => (
          <div
            key={k.label}
            className={`px-5 sm:px-6 py-5 sm:py-[22px] flex flex-col gap-2.5 min-w-0 border-border/70 dark:border-white/[0.06] ${
              i % 2 === 1 ? "border-l" : ""
            } ${i >= 2 ? "border-t lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}
          >
            <div className="font-plex text-[11px] uppercase tracking-[0.14em] text-muted-foreground truncate">
              {k.label}
            </div>
            <div className={`font-display font-medium tabular-nums leading-none tracking-tight text-[28px] sm:text-[34px] ${k.accent ? "text-primary dark:text-primary" : "dark:text-white"}`}>
              {k.value}
            </div>
            <div className="text-[12.5px] text-muted-foreground truncate">{k.hint}</div>
          </div>
        ))}
      </div>

      {/* Client list */}
      <div className="mt-7 card-glass rounded-2xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-border/70 dark:border-white/[0.06]">
          <span className="text-[15px] font-medium whitespace-nowrap">
            Client groups <span className="text-muted-foreground font-normal tabular-nums">· {totalClients}</span>
          </span>
          <label className="flex items-center gap-2 h-[38px] px-3 w-full sm:w-[280px] rounded-[10px] border border-border bg-card text-muted-foreground">
            <Search className="h-4 w-4 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search client groups"
              aria-label="Search client groups"
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm text-foreground placeholder:text-muted-foreground"
            />
          </label>
        </div>

        {/* Mobile / tablet cards */}
        <div className="xl:hidden divide-y divide-border/70 dark:divide-white/[0.06]">
          {empty && <div className="px-5 py-8 text-center text-muted-foreground">{empty}</div>}
          {shown.map((r) => {
            const isLast = r.id === lastEnteredTenantId;
            return (
              <div key={r.id} className={`p-4 sm:p-5 ${isLast ? "bg-[#F7FAF8] dark:bg-white/[0.02]" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ClientTile name={r.name} />
                    <div className="min-w-0">
                      <div className="font-medium text-[15px] truncate dark:text-white">{r.name}</div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">/{r.slug}</div>
                    </div>
                  </div>
                  <StatusChip status={r.shownStatus} />
                </div>
                {isLast && <div className="mt-3"><LastEntered /></div>}
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <div className="font-plex text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Venues</div>
                    <div className="text-[15px] mt-1 tabular-nums dark:text-white">{r.c.venues}</div>
                  </div>
                  <div>
                    <div className="font-plex text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Users</div>
                    <div className="text-[15px] mt-1 tabular-nums dark:text-white">{r.c.users}</div>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="font-plex text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2">Setup</div>
                  <SetupBar setup={r.setup} wide />
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground tabular-nums">Created {fmtDate(r.created_at)}</span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-11 sm:h-9 px-3.5 rounded-[10px]" onClick={() => navigate(`/platform/clients/${r.id}`)}>
                      Manage
                    </Button>
                    <Button size="sm" className="h-11 sm:h-9 px-3.5 rounded-[10px]" onClick={() => enterClient(r.id, "/")}>
                      <LogIn className="h-3.5 w-3.5 mr-1.5" /> Enter
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden xl:block w-full overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead className="font-plex text-[11px] uppercase tracking-[0.14em] text-muted-foreground whitespace-nowrap">
              <tr className="border-b border-border/70 dark:border-white/[0.06]">
                <th scope="col" className="text-left px-5 py-3.5 font-medium">Client group</th>
                <th scope="col" className="text-right px-4 py-3.5 font-medium">Venues</th>
                <th scope="col" className="text-right px-4 py-3.5 font-medium">Users</th>
                <th scope="col" className="text-left pl-8 pr-4 py-3.5 font-medium">Setup</th>
                <th scope="col" className="text-left px-4 py-3.5 font-medium">Status</th>
                <th scope="col" className="text-left px-4 py-3.5 font-medium">Created</th>
                <th scope="col" className="text-right px-5 py-3.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {empty && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">{empty}</td></tr>
              )}
              {shown.map((r) => {
                const isLast = r.id === lastEnteredTenantId;
                return (
                  <tr
                    key={r.id}
                    onClick={() => navigate(`/platform/clients/${r.id}`)}
                    className={`border-b last:border-b-0 border-border/60 dark:border-white/[0.045] cursor-pointer transition-colors hover:bg-[rgba(20,45,43,0.04)] dark:hover:bg-white/[0.025] ${
                      isLast ? "bg-[#F7FAF8] dark:bg-white/[0.02]" : ""
                    }`}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3.5">
                        <ClientTile name={r.name} />
                        <div className="min-w-0 flex flex-col gap-0.5">
                          <div className="flex items-center gap-2.5 flex-nowrap">
                            <span className="font-medium text-[15px] whitespace-nowrap dark:text-white">{r.name}</span>
                            {isLast && <LastEntered />}
                          </div>
                          <span className="text-[12.5px] text-muted-foreground whitespace-nowrap">/{r.slug}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right text-[15px] tabular-nums dark:text-white">{r.c.venues}</td>
                    <td className="px-4 py-4 text-right text-[15px] tabular-nums dark:text-white">{r.c.users}</td>
                    <td className="pl-8 pr-4 py-4"><SetupBar setup={r.setup} /></td>
                    <td className="px-4 py-4"><StatusChip status={r.shownStatus} /></td>
                    <td className="px-4 py-4 text-muted-foreground tabular-nums whitespace-nowrap">{fmtDate(r.created_at)}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-[38px] px-3.5 rounded-[10px] whitespace-nowrap"
                          onClick={(e) => { e.stopPropagation(); navigate(`/platform/clients/${r.id}`); }}
                        >
                          Manage
                        </Button>
                        <Button
                          size="sm"
                          className="h-[38px] px-4 rounded-[10px] whitespace-nowrap"
                          onClick={(e) => { e.stopPropagation(); enterClient(r.id, "/"); }}
                        >
                          <LogIn className="h-4 w-4 mr-1.5" /> Enter
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
