import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";

/**
 * Reads the most recent successful auto-rebuild timestamp for the active tenant
 * from ledger_audit_log. Polls every 60s so the indicator stays fresh.
 */
export function useLastAutoRebuild() {
  const { tenantId } = useActiveTenant();
  const [lastAt, setLastAt] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) { setLastAt(null); return; }
    let cancelled = false;
    const load = async () => {
      const { data } = await (supabase as any)
        .from("ledger_audit_log")
        .select("created_at")
        .eq("tenant_id", tenantId)
        .eq("event_type", "ledger_auto_rebuild")
        .eq("status", "success")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setLastAt(data?.created_at ?? null);
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [tenantId]);

  return lastAt;
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const now = Date.now();
  const t = new Date(iso).getTime();
  const s = Math.max(1, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
