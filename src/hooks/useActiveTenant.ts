import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const STORAGE_KEY = "khambu.activeTenantId";
const TENANT_CHANGE_EVENT = "khambu.activeTenantId.changed";

export type TenantMembership = { tenant_id: string; role: string; tenant_name?: string };

/**
 * Resolve the caller's active tenant_id. The tenant is selected explicitly
 * (persisted in localStorage under `khambu.activeTenantId`); we never silently
 * use "the first row".
 *
 * PHASE 2 (future): move tenant identity out of localStorage and into the URL
 * (e.g. `/t/:tenantId/...`) so different browser tabs can hold different
 * tenants simultaneously. Until then, cross-tab safety is enforced by
 * `CrossTabTenantGuard` and the platform-admin two-plane split
 * (`PlatformLayout` vs `AppLayout` — see `useTenantSession`).
 */
export function useActiveTenant() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [memberships, setMemberships] = useState<TenantMembership[]>([]);
  const [tenantId, setTenantIdState] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setMemberships([]); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("tenant_members")
        .select("tenant_id, role, tenants(name)")
        .eq("user_id", user.id);
      if (cancelled) return;
      const m: TenantMembership[] = (data ?? []).map((r: any) => ({
        tenant_id: r.tenant_id,
        role: r.role,
        tenant_name: r.tenants?.name,
      }));
      setMemberships(m);
      const isSuper = m.some((x) => x.role === "super_admin" || x.role === "platform_admin");
      const stored = localStorage.getItem(STORAGE_KEY);
      // Super-admins can hold any tenant_id; verify it exists. Regular users must be members.
      let valid = !!stored && m.some((x) => x.tenant_id === stored);
      if (!valid && stored && isSuper) {
        const { data: t } = await supabase.from("tenants").select("id").eq("id", stored).maybeSingle();
        valid = !!t;
      }
      const next = valid ? stored : m[0]?.tenant_id ?? null;
      if (next && next !== stored) localStorage.setItem(STORAGE_KEY, next);
      setTenantIdState(next);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    const syncTenant = () => setTenantIdState(localStorage.getItem(STORAGE_KEY));
    window.addEventListener(TENANT_CHANGE_EVENT, syncTenant);
    window.addEventListener("storage", syncTenant);
    return () => {
      window.removeEventListener(TENANT_CHANGE_EVENT, syncTenant);
      window.removeEventListener("storage", syncTenant);
    };
  }, []);

  const setTenantId = (id: string) => {
    const prev = localStorage.getItem(STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, id);
    setTenantIdState(id);
    window.dispatchEvent(new Event(TENANT_CHANGE_EVENT));
    // Wipe React Query cache so every tenant-scoped hook refetches against the
    // new tenant. Without this, cached pages keep showing the prior tenant's
    // data until the user navigates away.
    if (prev !== id) {
      try { queryClient.clear(); } catch { /* no-op */ }
    }
  };

  const isSuperAdmin = memberships.some(
    (m) => m.role === "super_admin" || m.role === "platform_admin",
  );

  return { tenantId, setTenantId, memberships, loading, isSuperAdmin };
}

