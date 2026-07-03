import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { toast } from "@/hooks/use-toast";
import type {
  ManagerTargetLine,
  OperatingStatus,
  VenueServicePeriod,
  LineType,
  EventMode,
  TargetInputMode,
  LineStatus,
  ManagerLineStatus,
} from "@/types/revenueTargetsV2";

export interface UpsertManagerLineInput {
  id?: string;
  venueId: string;
  targetDate: string;
  lineType: LineType;
  servicePeriodId?: string | null;
  eventName?: string | null;
  eventType?: string | null;
  eventMode?: EventMode | null;
  replacesServicePeriodId?: string | null;
  venueArea?: string | null;
  eventStartTime?: string | null;
  eventEndTime?: string | null;
  targetInputMode?: TargetInputMode;
  managerGuestTarget?: number | null;
  managerSpendPerGuestTarget?: number | null;
  managerRevenueOverride?: number | null;
  lineStatus?: LineStatus;
  zeroReason?: string | null;
  status?: ManagerLineStatus;
  notes?: string | null;
  managerSource?: string | null;
}

function toDb(t: UpsertManagerLineInput, tenantId: string) {
  return {
    tenant_id: tenantId,
    venue_id: t.venueId,
    target_date: t.targetDate,
    line_type: t.lineType,
    service_period_id: t.servicePeriodId ?? null,
    event_name: t.eventName ?? null,
    event_type: t.eventType ?? null,
    event_mode: t.eventMode ?? null,
    replaces_service_period_id: t.replacesServicePeriodId ?? null,
    venue_area: t.venueArea ?? null,
    event_start_time: t.eventStartTime ?? null,
    event_end_time: t.eventEndTime ?? null,
    target_input_mode: t.targetInputMode ?? "drivers",
    manager_guest_target: t.managerGuestTarget ?? null,
    manager_spend_per_guest_target: t.managerSpendPerGuestTarget ?? null,
    manager_revenue_override: t.managerRevenueOverride ?? null,
    line_status: t.lineStatus ?? "operating",
    zero_reason: t.zeroReason ?? null,
    status: t.status ?? "draft",
    notes: t.notes ?? null,
    manager_source: t.managerSource ?? null,
  };
}

export function useRevenueTargetMutations() {
  const { tenantId } = useActiveTenant();

  const upsertManagerLine = useCallback(async (input: UpsertManagerLineInput) => {
    if (!tenantId) return { ok: false as const, error: "no tenant" };
    const payload = toDb(input, tenantId);
    let error;
    if (input.id) {
      const { error: e } = await supabase
        .from("revenue_manager_target_lines")
        .update(payload)
        .eq("id", input.id)
        .eq("tenant_id", tenantId);
      error = e;
    } else {
      const { error: e } = await supabase
        .from("revenue_manager_target_lines")
        .insert(payload);
      error = e;
    }
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return { ok: false as const, error: error.message };
    }
    return { ok: true as const };
  }, [tenantId]);

  const batchUpsertManagerLines = useCallback(async (lines: UpsertManagerLineInput[]) => {
    if (!tenantId) return { ok: false as const, error: "no tenant" };
    // Split creates vs updates; run in parallel batches.
    const updates = lines.filter((l) => l.id);
    const creates = lines.filter((l) => !l.id);
    const results = await Promise.all([
      ...updates.map((u) =>
        supabase
          .from("revenue_manager_target_lines")
          .update(toDb(u, tenantId))
          .eq("id", u.id!)
          .eq("tenant_id", tenantId),
      ),
      creates.length
        ? supabase
            .from("revenue_manager_target_lines")
            .insert(creates.map((c) => toDb(c, tenantId)))
        : Promise.resolve({ error: null } as any),
    ]);
    const err = results.find((r: any) => r?.error);
    if (err) {
      toast({ title: "Save failed", description: (err as any).error.message, variant: "destructive" });
      return { ok: false as const, error: (err as any).error.message };
    }
    toast({ title: "Saved", description: `${lines.length} target line(s) updated.` });
    return { ok: true as const };
  }, [tenantId]);

  const approveLines = useCallback(async (ids: string[]) => {
    if (!tenantId || !ids.length) return { ok: false as const };
    const { error } = await supabase
      .from("revenue_manager_target_lines")
      .update({ status: "approved" })
      .in("id", ids)
      .eq("tenant_id", tenantId);
    if (error) {
      toast({ title: "Approval failed", description: error.message, variant: "destructive" });
      return { ok: false as const, error: error.message };
    }
    toast({ title: "Approved", description: `${ids.length} line(s) approved.` });
    return { ok: true as const };
  }, [tenantId]);

  const deleteLine = useCallback(async (id: string) => {
    if (!tenantId) return { ok: false as const };
    const { error } = await supabase
      .from("revenue_manager_target_lines")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return { ok: false as const, error: error.message };
    }
    return { ok: true as const };
  }, [tenantId]);

  const upsertOperatingStatus = useCallback(
    async (venueId: string, targetDate: string, status: OperatingStatus, notes?: string | null) => {
      if (!tenantId) return { ok: false as const };
      // Upsert on (tenant_id, venue_id, target_date)
      const existing = await supabase
        .from("revenue_target_days")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("venue_id", venueId)
        .eq("target_date", targetDate)
        .maybeSingle();
      let error;
      if (existing.data?.id) {
        const { error: e } = await supabase
          .from("revenue_target_days")
          .update({ operating_status: status, notes: notes ?? null })
          .eq("id", existing.data.id)
          .eq("tenant_id", tenantId);
        error = e;
      } else {
        const { error: e } = await supabase.from("revenue_target_days").insert({
          tenant_id: tenantId,
          venue_id: venueId,
          target_date: targetDate,
          operating_status: status,
          notes: notes ?? null,
        });
        error = e;
      }
      if (error) {
        toast({ title: "Status update failed", description: error.message, variant: "destructive" });
        return { ok: false as const, error: error.message };
      }
      return { ok: true as const };
    },
    [tenantId],
  );

  const upsertServicePeriod = useCallback(
    async (input: Partial<VenueServicePeriod> & { id?: string; venueId: string; name: string }) => {
      if (!tenantId) return { ok: false as const };
      const payload = {
        tenant_id: tenantId,
        venue_id: input.venueId,
        name: input.name,
        code: input.code ?? null,
        start_time: input.startTime ?? "00:00",
        end_time: input.endTime ?? "23:59",
        crosses_midnight: !!input.crossesMidnight,
        applicable_weekdays: input.applicableWeekdays ?? [0, 1, 2, 3, 4, 5, 6],
        is_active: input.isActive ?? true,
        sort_order: input.sortOrder ?? 0,
        effective_from: input.effectiveFrom ?? new Date().toISOString().slice(0, 10),
        effective_to: input.effectiveTo ?? null,
        is_rollup_only: !!input.isRollupOnly,
      };
      let error;
      if (input.id) {
        const { error: e } = await supabase
          .from("venue_service_periods")
          .update(payload)
          .eq("id", input.id)
          .eq("tenant_id", tenantId);
        error = e;
      } else {
        const { error: e } = await supabase
          .from("venue_service_periods")
          .insert(payload);
        error = e;
      }
      if (error) {
        toast({ title: "Service period save failed", description: error.message, variant: "destructive" });
        return { ok: false as const, error: error.message };
      }
      return { ok: true as const };
    },
    [tenantId],
  );

  const deactivateServicePeriod = useCallback(async (id: string, effectiveTo?: string | null) => {
    if (!tenantId) return { ok: false as const };
    const { error } = await supabase
      .from("venue_service_periods")
      .update({ is_active: false, effective_to: effectiveTo ?? new Date().toISOString().slice(0, 10) })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    if (error) {
      toast({ title: "Deactivate failed", description: error.message, variant: "destructive" });
      return { ok: false as const };
    }
    return { ok: true as const };
  }, [tenantId]);

  return {
    upsertManagerLine,
    batchUpsertManagerLines,
    approveLines,
    deleteLine,
    upsertOperatingStatus,
    upsertServicePeriod,
    deactivateServicePeriod,
  };
}

/** Validation guards used by callers before Save/Approve. */
export function validateManagerLine(line: ManagerTargetLine, targetStatus: ManagerLineStatus): string | null {
  if (targetStatus === "draft") return null;
  if (line.lineStatus !== "operating") return null;
  if (line.targetInputMode === "drivers") {
    if (line.managerGuestTarget == null || line.managerSpendPerGuestTarget == null) {
      return "Manager Guests and Manager Spend per Guest are required.";
    }
  }
  if (line.targetInputMode === "contracted_revenue") {
    if (line.managerRevenueOverride == null) return "Contracted Revenue is required.";
  }
  return null;
}
