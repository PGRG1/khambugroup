import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveTenant } from "@/hooks/useActiveTenant";

/**
 * Two-plane tenant session helpers.
 *
 *   Platform plane (/platform/*) → NO active tenant is required to render.
 *   Tenant plane (everything else) → resolves against `activeTenantId`.
 *
 * The platform admin has a "home tenant" (their own membership — typically KHAMBU).
 * Entering a client = switching active tenant + navigating into the tenant app.
 * Exiting     = restoring the home tenant + navigating to /platform/clients.
 *
 * PHASE 2 (future): move tenant identity into the URL (/t/:tenantId/...) so
 * two tabs can hold different tenants simultaneously without a shared
 * localStorage key. Until then, cross-tab safety is enforced by
 * `CrossTabTenantGuard`.
 */
const HOME_KEY = "khambu.homeTenantId";
const LAST_ENTERED_KEY = "khambu.lastEnteredTenantId";

export function useTenantSession() {
  const { setTenantId, tenantId, memberships } = useActiveTenant();
  const navigate = useNavigate();

  // Persist "home tenant" the first time we see a membership.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const first = memberships[0]?.tenant_id;
    if (first && !localStorage.getItem(HOME_KEY)) {
      localStorage.setItem(HOME_KEY, first);
    }
  }, [memberships]);

  const homeTenantId =
    (typeof window !== "undefined" ? localStorage.getItem(HOME_KEY) : null) ??
    memberships[0]?.tenant_id ??
    null;

  const lastEnteredTenantId =
    typeof window !== "undefined" ? localStorage.getItem(LAST_ENTERED_KEY) : null;

  const enterClient = (targetTenantId: string, destination = "/") => {
    if (typeof window !== "undefined") {
      localStorage.setItem(LAST_ENTERED_KEY, targetTenantId);
    }
    if (tenantId !== targetTenantId) setTenantId(targetTenantId);
    navigate(destination);
  };

  const exitToPlatform = () => {
    if (homeTenantId && homeTenantId !== tenantId) setTenantId(homeTenantId);
    navigate("/platform/clients");
  };

  const isInsideNonHomeClient =
    !!tenantId && !!homeTenantId && tenantId !== homeTenantId;

  return {
    activeTenantId: tenantId,
    homeTenantId,
    lastEnteredTenantId,
    isInsideNonHomeClient,
    enterClient,
    exitToPlatform,
  };
}
