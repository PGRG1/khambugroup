import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldCheck, Check, Minus, ArrowRight } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ServicePeriods from "@/pages/revenue/ServicePeriods";
import RevenueMapping from "@/pages/revenue/Mapping";
import TodayClassification from "@/components/revenue-setup/TodayClassification";
import { RevenueSourcesCard } from "@/pages/admin/MasterData";
import { useVenues } from "@/hooks/useVenues";
import { useRevenueSources } from "@/hooks/useRevenueSources";
import { useVenueServicePeriods } from "@/hooks/useVenueServicePeriods";
import { useUnmappedVenues } from "@/hooks/useUnmappedVenues";
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

function ReadinessItem({ label, state, done }: { label: string; state: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className={`h-1.5 w-1.5 rounded-full shrink-0 ${done ? "bg-primary" : "bg-muted-foreground/40"}`}
        aria-hidden
      />
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground shrink-0">{label}</span>
      <span className={`text-[12px] truncate ${done ? "font-medium text-foreground" : "text-muted-foreground"}`}>
        {state}
      </span>
    </div>
  );
}

export default function RevenueSetup() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab") as TabKey | null;
  const tab: TabKey = raw && (TABS as readonly string[]).includes(raw) ? raw : "service-periods";

  const { venues, loading: venuesLoading } = useVenues();
  const { sources, loading: sourcesLoading } = useRevenueSources();
  const perms = useRevenueTargetPermissions();

  const activeVenues = useMemo(() => venues.filter((v) => v.is_active), [venues]);
  const activeSources = useMemo(() => sources.filter((s) => s.is_active), [sources]);
  const seatedVenues = activeVenues.filter((v) => (v.seats ?? 0) > 0);

  // Shared venue selection between the editor (left) and the preview (right).
  const [selectedVenueId, setSelectedVenueId] = useState<string>("");
  const selectedVenue = activeVenues.find((v) => v.id === selectedVenueId) ?? null;

  // Tenant-wide periods: drives both the coverage metric and the live preview.
  const { rows: allPeriods, loading: periodsLoading, refetch: refetchPeriods } = useVenueServicePeriods();
  const { unmappedCount, unmappedVenues, loading: mappingLoading } = useUnmappedVenues();

  const venuesWithPeriods = useMemo(() => {
    const ids = new Set(
      allPeriods.filter((p) => p.isActive && !p.isRollupOnly).map((p) => p.venueId),
    );
    return activeVenues.filter((v) => ids.has(v.id)).length;
  }, [allPeriods, activeVenues]);

  const selectedVenuePeriods = useMemo(
    () => allPeriods.filter((p) => p.venueId === selectedVenueId),
    [allPeriods, selectedVenueId],
  );

  const coverageComplete = activeVenues.length > 0 && venuesWithPeriods === activeVenues.length;
  const mappingComplete = activeVenues.length > 0 && unmappedCount === 0;
  const sourcesComplete = activeSources.length > 0;
  const venuesComplete = activeVenues.length > 0;
  const setupReady = coverageComplete && mappingComplete && sourcesComplete && venuesComplete;
  const statusLoading = venuesLoading || sourcesLoading || periodsLoading || mappingLoading;


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
        <TabsList className="h-auto w-full justify-start gap-4 rounded-none border-b border-border/60 bg-transparent p-0">
          <TabsTrigger value="service-periods" className="h-9 rounded-none border-b-2 border-transparent bg-transparent px-0.5 text-[13px] font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">Service Periods</TabsTrigger>
          <TabsTrigger value="mapping" className="h-9 rounded-none border-b-2 border-transparent bg-transparent px-0.5 text-[13px] font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">Revenue Mapping</TabsTrigger>
          <TabsTrigger value="sources" className="h-9 rounded-none border-b-2 border-transparent bg-transparent px-0.5 text-[13px] font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">Data Sources</TabsTrigger>
          <TabsTrigger value="venues" className="h-9 rounded-none border-b-2 border-transparent bg-transparent px-0.5 text-[13px] font-medium text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none">Venues</TabsTrigger>
        </TabsList>

        <TabsContent value="service-periods" className="mt-4 space-y-3.5">
          {tab === "service-periods" && (
            <>
              {/* SLIM STATUS STRIP — every value derived from live tenant data */}
              <div className="card-glass rounded-xl border border-border/60 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <StatusRow
                  done={setupReady}
                  label={statusLoading ? "Checking setup…" : setupReady ? "Ready" : "Incomplete setup"}
                  hint={
                    statusLoading
                      ? "Loading configuration"
                      : setupReady
                        ? "Venues, periods, sources and mapping configured"
                        : [
                            !venuesComplete ? "no active venues" : null,
                            !coverageComplete ? "missing service periods" : null,
                            !sourcesComplete ? "no active sources" : null,
                            !mappingComplete ? `${unmappedCount} venue${unmappedCount === 1 ? "" : "s"} unmapped` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                  }
                />
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
                  done={coverageComplete}
                  label={`${venuesWithPeriods} of ${activeVenues.length} venue${activeVenues.length === 1 ? "" : "s"} covered`}
                  hint={
                    seatedVenues.length > 0
                      ? `${seatedVenues.length} with seating configured`
                      : "Venues with at least one active service period"
                  }
                />
              </div>

              {/* 65 / 35 WORKSPACE */}
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] gap-3.5 items-start">
                <div className="card-glass rounded-xl border border-border/60 p-4 min-w-0">
                  <div className="text-[13px] font-semibold">Service Periods</div>
                  <p className="text-[11px] text-muted-foreground">
                    Define how each venue's trading day is classified
                  </p>
                  <div className="mt-3">
                    <ServicePeriods
                      embedded
                      hideIntro
                      venueId={selectedVenueId}
                      onVenueChange={setSelectedVenueId}
                      onDataChanged={refetchPeriods}
                    />
                  </div>
                </div>

                <TodayClassification
                  venueName={selectedVenue?.name ?? null}
                  periods={selectedVenuePeriods}
                  loading={periodsLoading}
                />
              </div>

              {/* SETUP READINESS */}
              <div className="card-glass rounded-xl border border-border/60 px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
                <ReadinessItem
                  label="Service periods"
                  done={coverageComplete}
                  state={`${venuesWithPeriods}/${activeVenues.length} venues`}
                />
                <ReadinessItem
                  label="Revenue mapping"
                  done={mappingComplete}
                  state={
                    mappingLoading
                      ? "Checking…"
                      : mappingComplete
                        ? "All venues mapped"
                        : `${unmappedCount} unmapped${unmappedVenues.length ? `: ${unmappedVenues.join(", ")}` : ""}`
                  }
                />
                <ReadinessItem
                  label="Data sources"
                  done={sourcesComplete}
                  state={`${activeSources.length} of ${sources.length} active`}
                />
                <ReadinessItem
                  label="Venues"
                  done={venuesComplete}
                  state={`${activeVenues.length} of ${venues.length} active`}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-8 text-[12px]"
                  onClick={() => setParams({ tab: "mapping" }, { replace: true })}
                >
                  <span>Review Revenue Mapping</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
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
