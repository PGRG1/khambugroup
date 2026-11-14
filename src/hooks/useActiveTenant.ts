import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
type Resolution = { memberships: TenantMembership[]; isSuper: boolean; checked: string | null; resolved: string | null };

/** One membership lookup per signed-in user, shared by every component (it was one per component). */
async function resolveTenant(userId: string): Promise<Resolution> {
  const { data } = await supabase
    .from("tenant_members")
    .select("tenant_id, role, tenants(name)")
    .eq("user_id", userId);
  const m: TenantMembership[] = (data ?? []).map((r: any) => ({
    tenant_id: r.tenant_id,
    role: r.role,
    tenant_name: r.tenants?.name,
  }));
  const isSuper = m.some((x) => x.role === "super_admin" || x.role === "platform_admin");
  const stored = localStorage.getItem(STORAGE_KEY);
  // Super-admins can hold any tenant_id; verify it exists. Regular users must be members.
  let valid = !!stored && m.some((x) => x.tenant_id === stored);
  if (!valid && stored && isSuper) {
    const { data: t } = await supabase.from("tenants").select("id").eq("id", stored).maybeSingle();
    valid = !!t;
  }
  // Platform admins start client-less — no auto-fallback to memberships[0].
  // Regular tenant users fall back to their first membership.
  const next = valid ? stored : isSuper ? null : m[0]?.tenant_id ?? null;
  if (next && next !== stored) localStorage.setItem(STORAGE_KEY, next);
  if (!next && stored) localStorage.removeItem(STORAGE_KEY);
  return { memberships: m, isSuper, checked: stored, resolved: next };
}

export function useActiveTenant() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tenantIdState, setTenantIdState] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null
  );
  const q = useQuery({
    queryKey: ["tenant-resolution", user?.id],
    enabled: !!user,
    staleTime: Infinity,
    queryFn: () => resolveTenant(user!.id),
  });
  // The shared answer applies only to the tenant it checked; a tenant chosen since then
  // (switcher, another tab) is kept as is, exactly as before.
  const applies = !!q.data && q.data.checked === tenantIdState;
  const tenantId = applies ? q.data!.resolved : tenantIdState;
  useEffect(() => { if (applies && q.data!.resolved !== tenantIdState) setTenantIdState(q.data!.resolved); }, [applies, q.data, tenantIdState]);
  const memberships = user ? q.data?.memberships ?? [] : [];
  const loading = !!user && q.isPending;

  useEffect(() => {
    const syncTenant = () => setTenantIdState(localStorage.getItem(STORAGE_KEY));
    window.addEventListener(TENANT_CHANGE_EVENT, syncTenant);
    window.addEventListener("storage", syncTenant);
    return () => {
      window.removeEventListener(TENANT_CHANGE_EVENT, syncTenant);
      window.removeEventListener("storage", syncTenant);
    };
  }, []);

  const setTenantId = (id: string | null) => {
    const prev = localStorage.getItem(STORAGE_KEY);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
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

