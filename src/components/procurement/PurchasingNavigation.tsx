import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { canOpenPurchasingTab, matchesPurchasingPath, purchasingTabsForPath } from "@/utils/purchasingNavigation";

/** URL-only navigation; existing page guards and content remain independent. */
export function PurchasingNavigation() {
  const { pathname } = useLocation();
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
  if (loading || roleLoading || (previewing && previewLoading)) return null;
  const access = { isAdmin, isPreviewActive: previewing, previewIsAdmin, canAccessInvoices: canAccessPage("invoices") };
  if (pathname === "/procurement/dashboard") {
    if (!canOpenPurchasingTab({ title: "", url: "", adminOnly: true }, access)) return null;
    return <nav aria-label="Purchasing analysis" className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
      <Link className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" to="/procurement/purchase-analysis">Purchase Analysis</Link>
      <Link className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" to="/procurement/finance/spend">Spend Summary</Link>
    </nav>;
  }
  const tabs = purchasingTabsForPath(pathname)?.filter(tab => canOpenPurchasingTab(tab, access));
  if (!tabs?.length) return null;
  return <nav aria-label="Purchasing pages" className="mb-4 max-w-full overflow-x-auto">
    <div className="inline-flex w-max items-center gap-1 rounded-lg bg-muted/40 p-1 border border-border/50">
      {tabs.map(tab => {
        const active = matchesPurchasingPath(pathname, tab.url);
        return <Link key={tab.url} to={tab.url} aria-current={active ? "page" : undefined} className={cn(
          "px-3 py-1.5 text-xs sm:text-sm rounded-md font-medium transition-colors min-h-[36px] whitespace-nowrap",
          active ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
        )}>{tab.title}</Link>;
      })}
    </div>
  </nav>;
}