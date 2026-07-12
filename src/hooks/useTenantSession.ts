import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveTenant } from "@/hooks/useActiveTenant";

/**
 * Two-plane tenant session helpers.
 *
 *   Platform plane (/platform/*) → NO active tenant is required to render.
 *   Tenant plane (everything else) → resolves against the entered tenant.
 *
 * A platform admin ("Bani" operator) is ALWAYS in the platform control plane
 * unless they explicitly entered a client. There is no "home tenant" concept —
 * KHAMBU is just a client like any other. Entering a client = setting the
 * active tenant + navigating into the tenant app. Exiting = clearing the
 * active tenant + returning to /platform/clients.
 *
 * PHASE 2 (future): move tenant identity into the URL (/t/:tenantId/...) so
 * two tabs can hold different tenants simultaneously without a shared
 * localStorage key. Until then, cross-tab safety is enforced by
 * `CrossTabTenantGuard`.
 */
const ENTERED_KEY = "khambu.enteredTenantId";
const LAST_ENTERED_KEY = "khambu.lastEnteredTenantId";
const LEGACY_HOME_KEY = "khambu.homeTenantId";

// One-time cleanup of the deprecated "home tenant" localStorage entry.
if (typeof window !== "undefined") {
  try { localStorage.removeItem(LEGACY_HOME_KEY); } catch { /* no-op */ }
}

export function useTenantSession() {
  const { setTenantId, tenantId } = useActiveTenant();
  const navigate = useNavigate();

  // Keep the "entered" marker in sync with the active tenant. If some other
  // path cleared activeTenantId (e.g. sign-out), drop the marker too.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const entered = localStorage.getItem(ENTERED_KEY);
    if (entered && entered !== tenantId) {
      // If active tenant no longer matches the entered marker, drop it.
      if (!tenantId) localStorage.removeItem(ENTERED_KEY);
    }
  }, [tenantId]);

  const enteredTenantId =
    typeof window !== "undefined" ? localStorage.getItem(ENTERED_KEY) : null;

  const lastEnteredTenantId =
    typeof window !== "undefined" ? localStorage.getItem(LAST_ENTERED_KEY) : null;

  const enterClient = (targetTenantId: string, destination = "/") => {
    if (typeof window !== "undefined") {
      localStorage.setItem(ENTERED_KEY, targetTenantId);
      localStorage.setItem(LAST_ENTERED_KEY, targetTenantId);
    }
    if (tenantId !== targetTenantId) setTenantId(targetTenantId);
    navigate(destination);
  };

  const exitToPlatform = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(ENTERED_KEY);
    }
    // Fully clear the tenant-scoped session so the platform plane can render
    // without any lingering client context.
    setTenantId(null);
    navigate("/platform/clients");
  };

  const isInsideClient = !!enteredTenantId && !!tenantId && enteredTenantId === tenantId;

  return {
    activeTenantId: tenantId,
    enteredTenantId,
    lastEnteredTenantId,
    isInsideClient,
    enterClient,
    exitToPlatform,
  };
}
