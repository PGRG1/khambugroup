import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export interface RevenueTarget {
  id: string;
  year: number;
  month: number;
  targetAmount: number;
  venues: string[];
  notes: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

function fromDb(r: any): RevenueTarget {
  return {
    id: r.id,
    year: Number(r.year),
    month: Number(r.month),
    targetAmount: Number(r.target_amount),
    venues: Array.isArray(r.venues) ? r.venues : [],
    notes: r.notes ?? "",
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function useRevenueTargets() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [targets, setTargets] = useState<RevenueTarget[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTargets = useCallback(async () => {
    if (!tenantId) { setTargets([]); setLoading(false); return; }
    const { data, error } = await supabase
      .from("revenue_targets")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("year", { ascending: false })
      .order("month", { ascending: false });
    if (!error && data) setTargets(data.map(fromDb));
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantLoading) fetchTargets();
  }, [fetchTargets, tenantLoading]);

  const upsertTarget = useCallback(
    async (input: { year: number; month: number; targetAmount: number; venues: string[]; notes?: string; userId?: string | null }) => {
      if (!tenantId) return false;
      const existing = targets.find((t) => t.year === input.year && t.month === input.month);
      if (existing) {
        const { error } = await supabase
          .from("revenue_targets")
          .update({
            target_amount: input.targetAmount,
            venues: input.venues,
            notes: input.notes ?? "",
          })
          .eq("id", existing.id)
          .eq("tenant_id", tenantId);
        if (!error) await fetchTargets();
        return !error;
      }
      const { error } = await supabase.from("revenue_targets").insert({
        year: input.year,
        month: input.month,
        target_amount: input.targetAmount,
        venues: input.venues,
        notes: input.notes ?? "",
        created_by: input.userId ?? null,
        tenant_id: tenantId,
      });
      if (!error) await fetchTargets();
      return !error;
    },
    [targets, fetchTargets, tenantId]
  );

  const getTarget = useCallback(
    (year: number, month: number) => targets.find((t) => t.year === year && t.month === month) ?? null,
    [targets]
  );

  return { targets, loading, upsertTarget, getTarget, refetch: fetchTargets };
}
