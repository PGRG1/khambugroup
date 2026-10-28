import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { supabase } from "@/integrations/supabase/client";
import { canOpenPurchasingTab, PURCHASE_ORDERS_URL, type PurchasingTab } from "@/utils/purchasingNavigation";
import { resolveDeliveryCheckMode, showPurchaseOrdersInNav } from "@/utils/deliveryCheck";

/** Shared effective-user access for sidebar links, phone navigation and local tabs. */
export function usePurchasingNavigationAccess() {
  const { user, isAdmin, roleLoading } = useAuth();
  const { tenantId } = useActiveTenant();
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
  // Delivery-check mode + whether any supplier needs a PO drive the
  // Purchase Orders nav entry (Quick mode hides it until a supplier needs one).
  const { data: poVisibility, isLoading: poLoading } = useQuery({
    queryKey: ["purchasing-navigation-po-visibility", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const [config, poSuppliers] = await Promise.all([
        supabase.from("app_config").select("value").eq("tenant_id", tenantId!).eq("key", "delivery_check_mode").maybeSingle(),
        supabase.from("suppliers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!).eq("needs_po", true),
      ]);
      return showPurchaseOrdersInNav(resolveDeliveryCheckMode(config.data?.value), (poSuppliers.count ?? 0) > 0);
    },
  });
  const pending = loading || roleLoading || (previewing && previewLoading) || (!!tenantId && poLoading);
  const showPurchaseOrders = poVisibility ?? true;
  const access = { isAdmin, isPreviewActive: previewing, previewIsAdmin, canAccessInvoices: canAccessPage("invoices") };
  return {
    loading: pending,
    showPurchaseOrders,
    canOpen: (tab: PurchasingTab) =>
      !pending &&
      (tab.url !== PURCHASE_ORDERS_URL || showPurchaseOrders) &&
      canOpenPurchasingTab(tab, access),
  };
}