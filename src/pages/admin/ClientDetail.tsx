import { useEffect, useState, useCallback } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Building2, Rocket, ChevronRight, LogIn } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { useTenantOnboarding } from "@/hooks/useTenantOnboarding";
import { useTenantSession } from "@/hooks/useTenantSession";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  { value: "single_venue", label: "Single Venue", desc: "One venue for the whole client. Simplifies COGS/inventory reporting." },
  { value: "multi_venue", label: "Multi-Venue", desc: "Costs are split and reported per venue." },
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
    const [{ data: t }, { data: vs }, { data: bs }, { data: is }, { data: ms }, { data: os }] = await Promise.all([
      supabase.from("tenants").select("*").eq("id", tenantId).maybeSingle(),
      supabase.from("venues").select("id").eq("tenant_id", tenantId),
      supabase.from("bank_accounts").select("id").eq("tenant_id", tenantId),
      supabase.from("invoices").select("id").eq("tenant_id", tenantId),
      supabase.from("tenant_members").select("user_id").eq("tenant_id", tenantId),
      supabase.from("organizations").select("legal_name, name").eq("tenant_id", tenantId).limit(1),
    ]);
    setTenant((t as Tenant) ?? null);
    setCounts({
      venues: (vs ?? []).length,
      users: new Set((ms ?? []).map((x: any) => x.user_id)).size,
      banks: (bs ?? []).length,
      invoices: (is ?? []).length,
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

  return (
    <div className="p-6 space-y-6 max-w-[1100px] mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/platform/clients")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Clients
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-2xl font-semibold tracking-tight">{tenant?.name ?? "…"}</h1>
              <Badge variant="outline" className="text-[10px]">/{tenant?.slug}</Badge>
              <Badge className={
                tenant?.status === "active" ? "bg-primary/15 text-primary border-primary/30"
                : tenant?.status === "setup" ? "bg-warning/15 text-warning border-warning/30"
                : "bg-muted text-muted-foreground"
              }>{tenant?.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {orgName || "No organization yet"} · {tenant?.country ?? "—"} · {tenant?.base_currency ?? "—"} · {tenant?.timezone ?? "—"}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => tenantId && enterClient(tenantId, "/")}>
          <LogIn className="h-4 w-4 mr-1.5" /> Enter client
        </Button>
      </div>

      {/* Continue Onboarding card — replaces the old fake 8-boolean checklist. */}
      <section
        className="card-glass rounded-xl p-5 flex items-center justify-between gap-4 border border-primary/30 cursor-pointer hover:border-primary/60 transition"
        onClick={() => navigate(`/platform/clients/${tenantId}/onboarding`)}
        role="button"
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="h-12 w-12 rounded-lg bg-primary/10 ring-1 ring-primary/25 flex items-center justify-center shrink-0">
            <Rocket className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Continue onboarding</div>
            <div className="text-xs text-muted-foreground">
              {overall.pct}% complete · Currently in Phase {onboarding?.current_phase ?? 1} · {overall.done} done, {overall.skipped} skipped, {overall.total - overall.done - overall.skipped} to go
            </div>
            <div className="mt-2 w-64 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${overall.pct}%` }} />
            </div>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </section>

      {/* At-a-glance counts */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Venues", value: counts.venues },
          { label: "Users", value: counts.users },
          { label: "Bank accounts", value: counts.banks },
          { label: "Invoices", value: counts.invoices },
        ].map((k) => (
          <div key={k.label} className="card-glass rounded-xl border border-border/60 p-4">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{k.label}</div>
            <div className="mt-1 text-xl md:text-2xl font-semibold td-num tabular-nums">{k.value}</div>
          </div>
        ))}
      </section>

      {/* Cost reporting mode (kept — this is client-level policy, not onboarding). */}
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
