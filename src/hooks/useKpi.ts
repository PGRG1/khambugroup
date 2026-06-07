import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface KpiCard {
  id: string;
  kpi_name: string;
  kpi_category: string;
  kpi_type: string;
  unit: string;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface KpiTarget {
  id: string;
  kpi_card_id: string;
  venue_id: string | null;
  assigned_user_id: string | null;
  assigned_role: string | null;
  target_value: number;
  target_period: string; // day|week|month
  period_start_date: string | null;
  period_end_date: string | null;
  calculation_method: string; // manual|venue_specific|day_of_week|mtd
  day_of_week: number | null;
  warning_threshold_pct: number;
  critical_threshold_pct: number;
  active: boolean;
}

export interface KpiAssignment {
  id: string;
  kpi_card_id: string;
  assigned_user_id: string | null;
  assigned_role: string | null;
  venue_id: string | null;
  assigned_by: string | null;
  assigned_at: string;
  active: boolean;
}

export interface KpiActual {
  id: string;
  kpi_card_id: string;
  venue_id: string | null;
  period_date: string;
  actual_value: number;
  notes: string | null;
  actual_source: string;
  updated_by: string | null;
  updated_at: string;
}

export interface KpiAction {
  id: string;
  kpi_card_id: string;
  venue_id: string | null;
  period_date: string | null;
  assigned_user_id: string | null;
  action_required: string;
  action_status: string;
  due_date: string | null;
  completed_date: string | null;
  notes: string | null;
}

function showError(title: string, e: any) {
  toast({ title, description: e?.message ?? String(e), variant: "destructive" });
}

export function useKpiCards() {
  const [cards, setCards] = useState<KpiCard[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("kpi_cards").select("*").order("kpi_name");
    if (error) showError("Failed to load KPI cards", error);
    else setCards((data ?? []) as KpiCard[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async (p: Partial<KpiCard>) => {
    const { error } = await supabase.from("kpi_cards").insert({
      kpi_name: p.kpi_name ?? "Untitled KPI",
      kpi_category: p.kpi_category ?? "custom",
      kpi_type: p.kpi_type ?? "custom",
      unit: p.unit ?? "currency",
      description: p.description ?? "",
      active: p.active ?? true,
    });
    if (error) return showError("Create failed", error), false;
    await load(); return true;
  };
  const update = async (id: string, patch: Partial<KpiCard>) => {
    const { error } = await supabase.from("kpi_cards").update(patch).eq("id", id);
    if (error) return showError("Update failed", error), false;
    await load(); return true;
  };
  return { cards, loading, reload: load, create, update };
}

export function useKpiTargets() {
  const [targets, setTargets] = useState<KpiTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("kpi_targets").select("*").order("created_at", { ascending: false });
    if (error) showError("Failed to load targets", error);
    else setTargets((data ?? []) as KpiTarget[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  const create = async (p: Partial<KpiTarget>) => {
    const { error } = await supabase.from("kpi_targets").insert({
      kpi_card_id: p.kpi_card_id!,
      venue_id: p.venue_id ?? null,
      assigned_user_id: p.assigned_user_id ?? null,
      assigned_role: p.assigned_role ?? null,
      target_value: p.target_value ?? 0,
      target_period: p.target_period ?? "day",
      period_start_date: p.period_start_date ?? null,
      period_end_date: p.period_end_date ?? null,
      calculation_method: p.calculation_method ?? "manual",
      day_of_week: p.day_of_week ?? null,
      warning_threshold_pct: p.warning_threshold_pct ?? 10,
      critical_threshold_pct: p.critical_threshold_pct ?? 20,
      active: p.active ?? true,
    });
    if (error) return showError("Create target failed", error), false;
    await load(); return true;
  };
  const update = async (id: string, patch: Partial<KpiTarget>) => {
    const { error } = await supabase.from("kpi_targets").update(patch).eq("id", id);
    if (error) return showError("Update failed", error), false;
    await load(); return true;
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("kpi_targets").delete().eq("id", id);
    if (error) return showError("Delete failed", error), false;
    await load(); return true;
  };
  return { targets, loading, reload: load, create, update, remove };
}

export function useKpiAssignments() {
  const [assignments, setAssignments] = useState<KpiAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("kpi_assignments").select("*").order("assigned_at", { ascending: false });
    if (error) showError("Failed to load assignments", error);
    else setAssignments((data ?? []) as KpiAssignment[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  const create = async (p: Partial<KpiAssignment>) => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("kpi_assignments").insert({
      kpi_card_id: p.kpi_card_id!,
      assigned_user_id: p.assigned_user_id ?? null,
      assigned_role: p.assigned_role ?? null,
      venue_id: p.venue_id ?? null,
      assigned_by: u.user?.id ?? null,
      active: p.active ?? true,
    });
    if (error) return showError("Create assignment failed", error), false;
    await load(); return true;
  };
  const update = async (id: string, patch: Partial<KpiAssignment>) => {
    const { error } = await supabase.from("kpi_assignments").update(patch).eq("id", id);
    if (error) return showError("Update failed", error), false;
    await load(); return true;
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("kpi_assignments").delete().eq("id", id);
    if (error) return showError("Delete failed", error), false;
    await load(); return true;
  };
  return { assignments, loading, reload: load, create, update, remove };
}

export function useKpiActuals() {
  const [actuals, setActuals] = useState<KpiActual[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("kpi_actuals").select("*").order("period_date", { ascending: false });
    if (error) showError("Failed to load actuals", error);
    else setActuals((data ?? []) as KpiActual[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  const upsert = async (p: Partial<KpiActual>) => {
    const { data: u } = await supabase.auth.getUser();
    const payload = {
      kpi_card_id: p.kpi_card_id!,
      venue_id: p.venue_id ?? null,
      period_date: p.period_date!,
      actual_value: p.actual_value ?? 0,
      notes: p.notes ?? "",
      actual_source: p.actual_source ?? "manual",
      updated_by: u.user?.id ?? null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from("kpi_actuals")
      .upsert(payload, { onConflict: "kpi_card_id,venue_id,period_date" });
    if (error) return showError("Save actual failed", error), false;
    await load(); return true;
  };
  return { actuals, loading, reload: load, upsert };
}

export function useKpiActions() {
  const [actions, setActions] = useState<KpiAction[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("kpi_actions").select("*").order("created_at", { ascending: false });
    if (error) showError("Failed to load actions", error);
    else setActions((data ?? []) as KpiAction[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  return { actions, loading, reload: load };
}
