import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTenantPreview } from "@/contexts/TenantPreviewContext";
import { ArrowLeft, ChevronRight, CircleDashed, CheckCircle2, MinusCircle, PlayCircle } from "lucide-react";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { useTenantOnboarding } from "@/hooks/useTenantOnboarding";
import { ONBOARDING_PHASES, OnboardingStepDef, StepState } from "@/lib/onboardingSteps";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  PageHeader, KpiCard, KpiGrid, StatusPill,
} from "@/components/expenses/shared";
import {
  StepOrganizations, StepVenues, StepLocalisation,
  StepCoA, StepSuppliers, StepRevenue,
  StepFirstSale, StepFirstInvoice,
  StepGLOpening, StepAROpening, StepAPOpening,
  StepTeam,
} from "@/components/onboarding/OnboardingSteps";

const STEP_COMPONENTS: Record<string, React.ComponentType<any>> = {
  org_entities: StepOrganizations,
  venues: StepVenues,
  localisation: StepLocalisation,
  coa: StepCoA,
  suppliers: StepSuppliers,
  revenue: StepRevenue,
  first_sale: StepFirstSale,
  first_invoice: StepFirstInvoice,
  gl_opening: StepGLOpening,
  ar_opening: StepAROpening,
  ap_opening: StepAPOpening,
  team: StepTeam,
};

function StatusIcon({ status }: { status: StepState["status"] }) {
  if (status === "complete") return <CheckCircle2 className="h-4 w-4 text-primary"/>;
  if (status === "skipped") return <MinusCircle className="h-4 w-4 text-warning"/>;
  if (status === "in_progress") return <PlayCircle className="h-4 w-4 text-primary"/>;
  return <CircleDashed className="h-4 w-4 text-muted-foreground"/>;
}

function stepVariant(status: StepState["status"]): React.ComponentProps<typeof StatusPill>["variant"] {
  return status === "complete" ? "success" : status === "skipped" ? "warning" : status === "in_progress" ? "info" : "muted";
}

export default function ClientOnboarding() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const { isPlatformAdmin, loading: gateLoading } = usePlatformAdmin();
  const { row, loading, markStep, setStartingFresh, setConversionDate, overall, phaseProgress, getStepState } = useTenantOnboarding(tenantId);

  if (gateLoading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isPlatformAdmin) return <Navigate to="/" replace/>;
  if (!tenantId) return <Navigate to="/platform/clients" replace/>;

  const skip = (key: string) => {
    const reason = prompt("Reason for skipping?") || "";
    markStep(key, "skipped", { skipped_reason: reason });
  };

  return (
    <div className="p-6 space-y-6 max-w-[1100px] mx-auto">
      <Button variant="ghost" size="sm" onClick={() => navigate(`/platform/clients/${tenantId}`)}>
        <ArrowLeft className="h-4 w-4 mr-1"/>Back to client
      </Button>
      <PageHeader
        title="Onboarding cockpit"
        description="White-glove implementation driver. Every step is resumable and can be skipped with a reason."
      />
      <KpiGrid>
        <KpiCard label="Overall complete" value={`${overall.pct}%`} hint={`${overall.done} done · ${overall.skipped} skipped`}/>
        <KpiCard label="Current phase" value={`Phase ${row?.current_phase ?? 1}`}/>
        <KpiCard label="Steps done" value={String(overall.done)}/>
        <KpiCard label="Steps skipped" value={String(overall.skipped)} tone={overall.skipped ? "warning" : "default"}/>
      </KpiGrid>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading state…</div>
      ) : (
        <Accordion type="multiple" defaultValue={[`phase-${row?.current_phase ?? 1}`]} className="space-y-3">
          {ONBOARDING_PHASES.map((phase) => {
            const prog = phaseProgress(phase.phase);
            return (
              <AccordionItem key={phase.phase} value={`phase-${phase.phase}`} className="card-glass rounded-xl border border-border/60 overflow-hidden">
                <AccordionTrigger className="px-5 py-4 hover:no-underline">
                  <div className="flex-1 flex items-center justify-between gap-4">
                    <div className="text-left">
                      <div className="text-sm font-semibold flex items-center gap-2">
                        Phase {phase.phase} · {phase.title}
                        {phase.optional && <Badge variant="outline" className="text-[10px]">Optional</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">{phase.subtitle}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-xs text-muted-foreground tabular-nums">{prog.done}/{prog.total}</div>
                      <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${prog.pct}%` }}/>
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-5 pb-5 space-y-4">
                  {phase.phase === 4 && (
                    <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-muted/20">
                      <div>
                        <div className="text-sm font-medium">Starting fresh — no prior system</div>
                        <div className="text-xs text-muted-foreground">Marks the whole phase as skipped. Reopen individual steps anytime.</div>
                      </div>
                      <Switch checked={!!row?.starting_fresh} onCheckedChange={setStartingFresh}/>
                    </div>
                  )}
                  {phase.phase === 4 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-end">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Conversion date</div>
                        <input
                          type="date"
                          value={row?.conversion_date ?? ""}
                          onChange={(e) => setConversionDate(e.target.value)}
                          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                        />
                      </div>
                    </div>
                  )}
                  {phase.steps.map((step) => {
                    const st = getStepState(step.key);
                    const Comp = STEP_COMPONENTS[step.key];
                    return (
                      <StepRow
                        key={step.key}
                        step={step}
                        state={st}
                        onMark={(status) => markStep(step.key, status)}
                        onSkip={() => skip(step.key)}
                      >
                        {Comp ? (
                          <Comp
                            tenantId={tenantId}
                            onComplete={() => markStep(step.key, "complete")}
                            onProgress={() => markStep(step.key, "in_progress")}
                          />
                        ) : (
                          <div className="text-xs text-muted-foreground">Step handler not yet implemented.</div>
                        )}
                      </StepRow>
                    );
                  })}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}

function StepRow({
  step, state, onMark, onSkip, children,
}: {
  step: OnboardingStepDef;
  state: StepState;
  onMark: (status: StepState["status"]) => void;
  onSkip: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border/60 rounded-lg">
      <div className="flex items-center justify-between px-4 py-3 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <StatusIcon status={state.status}/>
          <div className="min-w-0">
            <div className="text-sm font-medium flex items-center gap-2">
              {step.label}
              {step.optional && <Badge variant="outline" className="text-[10px]">Optional</Badge>}
              <StatusPill variant={stepVariant(state.status)} className="capitalize">{state.status.replace("_", " ")}</StatusPill>
            </div>
            <div className="text-xs text-muted-foreground truncate">{step.description}{state.skipped_reason ? ` · Skipped: ${state.skipped_reason}` : ""}</div>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          {state.status === "skipped" || state.status === "complete" ? (
            <Button size="sm" variant="ghost" onClick={() => onMark("not_started")}>Reopen</Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={onSkip}>Skip</Button>
          )}
        </div>
      </div>
      <div className="px-4 pb-4">{children}</div>
    </div>
  );
}
