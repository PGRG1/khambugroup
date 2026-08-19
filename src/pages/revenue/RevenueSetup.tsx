import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldCheck, Check, Minus } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import ServicePeriods from "@/pages/revenue/ServicePeriods";
import RevenueMapping from "@/pages/revenue/Mapping";
import { RevenueSourcesCard } from "@/pages/admin/MasterData";
import { useVenues } from "@/hooks/useVenues";
import { useRevenueSources } from "@/hooks/useRevenueSources";
import { useRevenueTargetPermissions } from "@/hooks/useRevenueTargetPermissions";

const TABS = ["service-periods", "mapping", "sources", "venues"] as const;
type TabKey = (typeof TABS)[number];

function StatusRow({ done, label, hint }: { done: boolean; label: string; hint: string }) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span
        className={`mt-0.5 h-4 w-4 rounded-full flex items-center justify-center shrink-0 ${
          done ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
        }`}
      >
        {done ? <Check className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-medium leading-tight">{label}</div>
        <div className="text-[11px] text-muted-foreground truncate">{hint}</div>
      </div>
    </div>
  );
}

export default function RevenueSetup() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab") as TabKey | null;
  const tab: TabKey = raw && (TABS as readonly string[]).includes(raw) ? raw : "service-periods";

  const { venues, loading: venuesLoading } = useVenues();
  const { sources } = useRevenueSources();
  const perms = useRevenueTargetPermissions();

  const activeVenues = useMemo(() => venues.filter((v) => v.is_active), [venues]);
  const activeSources = useMemo(() => sources.filter((s) => s.is_active), [sources]);
  const seatedVenues = activeVenues.filter((v) => (v.seats ?? 0) > 0);

  return (
    <div className="w-full mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-semibold tracking-tight">
            <span className="text-gradient-gold">Revenue</span>
            <span className="text-muted-foreground ml-2 text-[13px] font-normal">Revenue Setup</span>
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Configure how revenue is captured, classified and reported
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 h-7 text-[11px] font-medium">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Bani Operations · {perms.canEditManagerTargets ? "Configuration access" : "Read only"}
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="service-periods">Service Periods</TabsTrigger>
          <TabsTrigger value="mapping">Revenue Mapping</TabsTrigger>
          <TabsTrigger value="sources">Data Sources</TabsTrigger>
          <TabsTrigger value="venues">Venues</TabsTrigger>
        </TabsList>

        <TabsContent value="service-periods" className="mt-4 space-y-4">
          {tab === "service-periods" && (
            <>
              <div className="card-glass rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatusRow
                  done={activeVenues.length > 0}
                  label={`${activeVenues.length} active venue${activeVenues.length === 1 ? "" : "s"}`}
                  hint="Venues available for revenue capture"
                />
                <StatusRow
                  done={activeSources.length > 0}
                  label={`${activeSources.length} revenue source${activeSources.length === 1 ? "" : "s"}`}
                  hint="Channels revenue can be classified into"
                />
                <StatusRow
                  done={seatedVenues.length > 0}
                  label={`${seatedVenues.length} venue${seatedVenues.length === 1 ? "" : "s"} with seating`}
                  hint="Required for seat-based analytics"
                />
              </div>
              <ServicePeriods embedded />
            </>
          )}
        </TabsContent>

        <TabsContent value="mapping" className="mt-4">
          {tab === "mapping" && <RevenueMapping embedded />}
        </TabsContent>

        <TabsContent value="sources" className="mt-4">
          {tab === "sources" && <RevenueSourcesCard />}
        </TabsContent>

        <TabsContent value="venues" className="mt-4">
          {tab === "venues" && (
            <div className="card-glass rounded-xl p-4">
              <div className="text-[13px] font-semibold mb-1">Venues</div>
              <p className="text-[11px] text-muted-foreground mb-3">
                Venues are maintained in Business Structure. Seating drives occupancy analytics.
              </p>
              {venuesLoading ? (
                <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
              ) : venues.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">No venues configured yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px] min-w-[480px]">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
                        <th className="text-left font-medium py-2">Venue</th>
                        <th className="text-right font-medium py-2">Seats</th>
                        <th className="text-right font-medium py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {venues.map((v) => (
                        <tr key={v.id} className="border-b border-border/40">
                          <td className="py-2">{v.name}</td>
                          <td className="py-2 text-right td-num">{v.seats ?? "—"}</td>
                          <td className="py-2 text-right">
                            <Badge variant={v.is_active ? "outline" : "secondary"} className="text-[10px]">
                              {v.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
