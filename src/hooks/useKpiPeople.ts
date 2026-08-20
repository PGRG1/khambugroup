import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";

export interface KpiPerson {
  user_id: string;
  display_name: string;
  job_title: string | null;
  tenant_role: string;
}

/**
 * Tenant-scoped people picker. Resolves users through tenant_members first and
 * only then reads profiles — never loads every profile in the database.
 */
export function useKpiPeople() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const [people, setPeople] = useState<KpiPerson[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId) { setPeople([]); setLoading(false); return; }
    setLoading(true);
    const { data: members } = await supabase
      .from("tenant_members")
      .select("user_id, role")
      .eq("tenant_id", tenantId);
    const ids = Array.from(new Set((members ?? []).map((m: any) => m.user_id).filter(Boolean)));
    if (!ids.length) { setPeople([]); setLoading(false); return; }

    const [{ data: profiles }, { data: employees }] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name").in("user_id", ids),
      supabase.from("hr_employees").select("user_id, job_title, first_name, last_name, status").eq("tenant_id", tenantId).in("user_id", ids),
    ]);

    const empByUser = new Map<string, any>();
    for (const e of employees ?? []) if (e.user_id) empByUser.set(e.user_id, e);

    const rows: KpiPerson[] = ids.map((uid) => {
      const p = (profiles ?? []).find((x: any) => x.user_id === uid);
      const e = empByUser.get(uid);
      const empName = e ? [e.first_name, e.last_name].filter(Boolean).join(" ").trim() : "";
      const name = (p?.display_name ?? "").trim() || empName || "Unnamed user";
      return {
        user_id: uid,
        display_name: name,
        job_title: (e?.job_title ?? null) || null,
        tenant_role: (members ?? []).find((m: any) => m.user_id === uid)?.role ?? "member",
      };
    }).sort((a, b) => a.display_name.localeCompare(b.display_name));

    setPeople(rows);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { if (!tenantLoading) load(); }, [load, tenantLoading]);

  const byId = useCallback((uid: string | null | undefined) => (uid ? people.find((p) => p.user_id === uid) ?? null : null), [people]);

  return { people, loading, reload: load, byId };
}
