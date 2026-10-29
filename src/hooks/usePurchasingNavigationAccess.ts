import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { supabase } from "@/integrations/supabase/client";
import { canOpenPurchasingTab, type PurchasingTab } from "@/utils/purchasingNavigation";

/** Shared effective-user access for sidebar links, phone navigation and local tabs. */
export function usePurchasingNavigationAccess() {
  const { user, isAdmin, roleLoading } = useAuth();
  const { previewUserId, isPreviewActive } = usePreviewMode();
  const previewing = isPreviewActive && isAdmin;
  const { canAccessPage, loading } = useUserPermissions((previewing ? previewUserId : user?.id) || undefined);
  const { data: previewIsAdmin = false, isLoading: previewLoading } = useQuery({
    queryKey: ["purchasing-navigation-preview-role", previewUserId],
    enabled: previewing && !!previewUserId,
    queryFn: async () => {
      if (!previewUserId) return false;
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", previewUserId).eq("role", "admin");
      return !error && !!data?.length;
    },
  });
  const pending = loading || roleLoading || (previewing && previewLoading);
  const access = { isAdmin, isPreviewActive: previewing, previewIsAdmin, canAccessInvoices: canAccessPage("invoices") };
  return {
    loading: pending,
    canOpen: (tab: PurchasingTab) => !pending && canOpenPurchasingTab(tab, access),
  };
}