import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export interface VenueAllocationProfile {
  id: string;
  tenant_id: string;
  name: string;
  method: string; // 'manual' | 'even' | 'by_headcount' | 'by_seats' | 'by_revenue'
  is_active: boolean;
  is_default: boolean;
  notes: string | null;
}

export interface VenueAllocationLine {
  id?: string;
  profile_id: string;
  venue_id: string;
  percent: number;
  effective_from?: string | null;
  effective_to?: string | null;
}

export function useVenueAllocationProfiles() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [profiles, setProfiles] = useState<VenueAllocationProfile[]>([]);
  const [lines, setLines] = useState<VenueAllocationLine[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId) { setProfiles([]); setLines([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [{ data: p }, { data: l }] = await Promise.all([
        supabase.from("venue_allocation_profiles").select("*").eq("tenant_id", tenantId).order("name"),
        supabase.from("venue_allocation_profile_lines").select("*").eq("tenant_id", tenantId),
      ]);
      setProfiles((p as VenueAllocationProfile[]) || []);
      setLines((l as VenueAllocationLine[]) || []);
    } catch (e: any) {
      toast.error("Failed to load allocation profiles: " + e.message);
    } finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { if (!tenantLoading) load(); }, [load, tenantLoading]);

  const linesFor = useCallback(
    (profileId: string) => lines.filter(l => l.profile_id === profileId),
    [lines],
  );

  const saveProfile = useCallback(async (
    header: Partial<VenueAllocationProfile>,
    profileLines: Array<{ venue_id: string; percent: number }>,
  ) => {
    if (!tenantId) return null;
    try {
      const sum = profileLines.reduce((s, l) => s + Number(l.percent || 0), 0);
      if (Math.abs(sum - 100) > 0.01) {
        toast.error(`Lines must sum to exactly 100% (currently ${sum.toFixed(2)}%)`);
        return null;
      }
      let id = header.id;
      const payload: any = {
        tenant_id: tenantId,
        name: (header.name || "").trim(),
        method: header.method || "manual",
        is_active: header.is_active ?? true,
        is_default: header.is_default ?? false,
        notes: header.notes || null,
      };
      if (!payload.name) { toast.error("Name required"); return null; }
      if (id) {
        const { error } = await supabase.from("venue_allocation_profiles").update(payload).eq("id", id).eq("tenant_id", tenantId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("venue_allocation_profiles").insert(payload).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      await supabase.from("venue_allocation_profile_lines").delete().eq("profile_id", id!).eq("tenant_id", tenantId);
      if (profileLines.length) {
        const { error } = await supabase.from("venue_allocation_profile_lines").insert(
          profileLines.map(l => ({
            profile_id: id, tenant_id: tenantId,
            venue_id: l.venue_id, percent: Number(l.percent),
          })),
        );
        if (error) throw error;
      }
      toast.success("Profile saved");
      await load();
      return id!;
    } catch (e: any) {
      toast.error("Save failed: " + e.message);
      return null;
    }
  }, [tenantId, load]);

  const remove = useCallback(async (id: string) => {
    if (!tenantId) return false;
    const { error } = await supabase.from("venue_allocation_profiles").delete().eq("id", id).eq("tenant_id", tenantId);
    if (error) { toast.error("Delete failed: " + error.message); return false; }
    await load();
    return true;
  }, [tenantId, load]);

  return { profiles, lines, loading, linesFor, saveProfile, remove, reload: load };
}
