import { useAuth } from "@/hooks/useAuth";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useUserPermissions } from "@/hooks/useUserPermissions";

/**
 * Convenience hook for page components to check action visibility.
 * Automatically handles preview-as-user mode.
 */
export function usePagePermissions() {
  const { user, isAdmin } = useAuth();
  const { previewUserId, isPreviewActive } = usePreviewMode();
  const effectiveUserId = isPreviewActive && isAdmin ? previewUserId : user?.id;
  const { isActionHidden, getAuthority, loading } = useUserPermissions(effectiveUserId || undefined);

  return { isActionHidden, getAuthority, loading, isAdmin, isPreviewActive };
}
