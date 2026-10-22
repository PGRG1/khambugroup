import { useAuth } from "@/hooks/useAuth";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { revenuePageAllowed } from "@/utils/revenueNavigation";

export function useRevenueNavigationAccess() {
  const { user, isAdmin } = useAuth();
  const { previewUserId, isPreviewActive } = usePreviewMode();
  const effectiveUserId = isPreviewActive && isAdmin ? previewUserId : user?.id;
  const { canAccessPage, showInSidebar, loading } = useUserPermissions(effectiveUserId || undefined);
  const allowed = (key: string) => !loading && revenuePageAllowed(isAdmin, isPreviewActive, canAccessPage(key));
  const visible = (key: string) => allowed(key) && revenuePageAllowed(isAdmin, isPreviewActive, showInSidebar(key));
  return { revenue: allowed("revenue"), forecast: allowed("forecast"), sidebarRevenue: visible("revenue"), sidebarForecast: visible("forecast") };
}