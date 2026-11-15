import { useEffect, useState, useCallback } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, LogIn } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { useTenantOnboarding } from "@/hooks/useTenantOnboarding";
import { useTenantSession } from "@/hooks/useTenantSession";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
  country?: string | null;
  base_currency?: string | null;
  timezone?: string | null;
  cost_reporting_mode?: "single_venue" | "multi_venue" | null;
  created_at: string;
};

const COST_MODES: { value: "single_venue" | "multi_venue"; label: string; desc: string }[] = [
  { value: "single_venue", label: "Single venue", desc: "One venue for the whole client." },
  { value: "multi_venue", label: "Multi-venue", desc: "Costs split and reported per venue." },
];

export default function ClientDetail() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { isPlatformAdmin, loading: gateLoading } = usePlatformAdmin();
  const { enterClient } = useTenantSession();
  const { overall, row: onboarding } = useTenantOnboarding(tenantId);

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [orgName, setOrgName] = useState<string>("");
  const [counts, setCounts] = useState({ venues: 0, users: 0, banks: 0, invoices: 0 });
  const [savingMode, setSavingMode] = useState(false);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    const [{ data: t }, { data: vs }, { data: bs }, { count: invoiceCount }, { data: ms }, { data: os }] = await Promise.all([
      supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle(),
      supabase.from("venues").select("id").eq("tenant_id", tenantId),
      supabase.from("bank_accounts").select("id").eq("tenant_id", tenantId),
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      supabase.from("tenant_members").select("user_id").eq("tenant_id", tenantId),
      supabase.from("organizations").select("legal_name, name").eq("tenant_id", tenantId).limit(1),
    ]);
    setTenant((t as Tenant) ?? null);
    setCounts({
      venues: (vs ?? []).length,
      users: new Set((ms ?? []).map((x: any) => x.user_id)).size,
      banks: (bs ?? []).length,
      invoices: invoiceCount ?? 0,
    });
    setOrgName(os?.[0]?.legal_name ?? os?.[0]?.name ?? "");
  }, [tenantId]);

  useEffect(() => { if (isPlatformAdmin && tenantId) refresh(); }, [isPlatformAdmin, tenantId, refresh]);

  if (gateLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isPlatformAdmin) return <Navigate to="/" replace />;
  if (!tenantId) return <Navigate to="/platform/clients" replace />;

  const handleCostModeChange = async (value: "single_venue" | "multi_venue") => {
    if (!tenant) return;
    setSavingMode(true);
    const { error } = await supabase.from("tenants").update({ cost_reporting_mode: value }).eq("id", tenantId);
    setSavingMode(false);
    if (error) return toast({ title: "Save failed", description: error.message, variant: "destructive" });
    setTenant({ ...tenant, cost_reporting_mode: value });
    toast({ title: "Cost reporting mode updated" });
  };

  const toGo = overall.total - overall.done - overall.skipped;
  const details = [tenant?.slug ? `/${tenant.slug}` : null, orgName || null, tenant?.country, tenant?.base_currency, tenant?.timezone].filter(Boolean).join(" · ");
  const status = tenant?.status ?? "";

  return (
    <div className="px-4 py-5 sm:p-6 space-y-5 max-w-[1100px] mx-auto">
      <div className="space-y-3">
        <button type="button" onClick={() => navigate("/platform/clients")} className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Clients
        </button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[22px] sm:text-2xl font-semibold tracking-tight">{tenant?.name ?? "…"}</h1>
              {status && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                status === "active" ? "bg-primary/10 text-primary" : status === "setup" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"
              }`}>{status}</span>}
            </div>
            {details && <p className="mt-1 text-[13px] text-muted-foreground">{details}</p>}
          </div>
          <Button className="w-full sm:w-auto shrink-0" onClick={() => tenantId && enterClient(tenantId, "/")}>
            <LogIn className="h-4 w-4 mr-1.5" /> Enter client
          </Button>
        </div>
      </div>

      <section
        className="card-glass rounded-xl p-4 sm:p-5 flex items-center gap-4 border border-border/60 cursor-pointer hover:border-primary/40 transition"
        onClick={() => navigate(`/platform/clients/${tenantId}/onboarding`)}
        role="button"
        aria-label="Open onboarding"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold">Onboarding</span>
            <span className="text-sm font-semibold tabular-nums">{overall.pct}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${overall.pct}%` }} />
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {toGo > 0 ? `Phase ${onboarding?.current_phase ?? 1} · ${toGo} step${toGo === 1 ? "" : "s"} to go` : "All steps done"}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </section>

      {/* At-a-glance counts */}
      <section className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Venues", value: counts.venues },
          { label: "Users", value: counts.users },
          { label: "Bank accounts", value: counts.banks },
          { label: "Invoices", value: counts.invoices },
        ].map((k) => (
          <div key={k.label} className="glass-surface rounded-xl border border-border/60 p-4">
            <div className="text-[12px] text-muted-foreground">{k.label}</div>
            <div className="mt-1 text-xl md:text-2xl font-semibold td-num tabular-nums">{k.value}</div>
          </div>
        ))}
      </section>

      {/* Cost reporting mode (kept — this is client-level policy, not onboarding). */}
      <section className="card-glass rounded-xl p-4 sm:p-5">
        <div className="mb-3">
          <div className="text-sm font-semibold">Cost reporting</div>
          <div className="text-xs text-muted-foreground">How purchasing costs and stock are reported.</div>
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
                  type="radio" name="cost-mode" className="mt-1"
                  checked={active} disabled={savingMode}
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
    </div>
  );
}
