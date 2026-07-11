import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  ALL_STEP_KEYS,
  ONBOARDING_PHASES,
  StepState,
  computeOverallProgress,
  currentPhase,
  computePhaseProgress,
  getStepState,
} from "@/lib/onboardingSteps";

export interface TenantOnboardingRow {
  id: string;
  tenant_id: string;
  current_phase: number;
  steps: Record<string, StepState>;
  starting_fresh: boolean;
  conversion_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Fetch + mutate the onboarding record for a specific tenant. Platform-admin scoped by RLS. */
export function useTenantOnboarding(tenantId: string | undefined) {
  const [row, setRow] = useState<TenantOnboardingRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("tenant_onboarding")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) {
      toast({ title: "Failed to load onboarding", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    if (!data) {
      // Auto-seed if missing (older tenants provisioned before migration)
      const { data: created, error: insErr } = await supabase
        .from("tenant_onboarding")
        .insert({ tenant_id: tenantId, current_phase: 1, steps: {} })
        .select("*")
        .single();
      if (insErr) {
        toast({ title: "Could not initialise onboarding", description: insErr.message, variant: "destructive" });
      } else {
        setRow(created as any);
      }
    } else {
      setRow(data as any);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const patchSteps = useCallback(async (patch: Record<string, StepState>) => {
    if (!row) return;
    const nextSteps = { ...row.steps, ...patch };
    const nextPhase = currentPhase(nextSteps);
    const { data, error } = await supabase
      .from("tenant_onboarding")
      .update({ steps: nextSteps as any, current_phase: nextPhase })
      .eq("id", row.id)
      .select("*")
      .single();
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    setRow(data as any);
  }, [row]);

  const markStep = (key: string, status: StepState["status"], extra: Partial<StepState> = {}) => {
    const next: StepState = {
      status,
      completed_at: status === "complete" || status === "skipped" ? new Date().toISOString() : undefined,
      ...extra,
    };
    return patchSteps({ [key]: next });
  };

  const setStartingFresh = async (value: boolean) => {
    if (!row) return;
    // When starting fresh, mark all Phase 4 steps as skipped in one write.
    const patch: Record<string, StepState> = {};
    if (value) {
      const p4 = ONBOARDING_PHASES.find((p) => p.phase === 4)!;
      for (const s of p4.steps) {
        patch[s.key] = { status: "skipped", completed_at: new Date().toISOString(), skipped_reason: "Starting fresh — no prior system" };
      }
    }
    const nextSteps = { ...row.steps, ...patch };
    const { data, error } = await supabase
      .from("tenant_onboarding")
      .update({ starting_fresh: value, steps: nextSteps as any, current_phase: currentPhase(nextSteps) })
      .eq("id", row.id)
      .select("*")
      .single();
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    setRow(data as any);
  };

  const setConversionDate = async (iso: string) => {
    if (!row) return;
    const { data, error } = await supabase
      .from("tenant_onboarding").update({ conversion_date: iso }).eq("id", row.id).select("*").single();
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    setRow(data as any);
  };

  const overall = computeOverallProgress(row?.steps ?? {});
  const phaseProgress = (phaseNum: number) => {
    const p = ONBOARDING_PHASES.find((x) => x.phase === phaseNum);
    return p ? computePhaseProgress(row?.steps ?? {}, p) : { done: 0, total: 0, pct: 0 };
  };

  return {
    row,
    loading,
    reload: load,
    markStep,
    patchSteps,
    setStartingFresh,
    setConversionDate,
    overall,
    phaseProgress,
    getStepState: (key: string) => getStepState(row?.steps ?? {}, key),
    allStepKeys: ALL_STEP_KEYS,
  };
}
