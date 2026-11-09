import { SupplierProfileDialog } from "@/components/vendors/SupplierProfileDialog";
import { BaniChatsDialog } from "@/components/assistant/BaniChatsDialog";
import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { UserMenu } from "@/components/UserMenu";
import { useLocation } from "react-router-dom";
import { RevenueNavigation } from "@/components/revenue/RevenueNavigation";
import { isRevenueRoute } from "@/utils/revenueNavigation";
import { FinanceNavigation } from "@/components/finance/FinanceNavigation";
import { ExpensesNavigation } from "@/components/expenses/ExpensesNavigation";
import { PurchasingNavigation } from "@/components/procurement/PurchasingNavigation";
import { PeopleNavigation } from "@/components/hr/PeopleNavigation";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useBaseCurrency } from "@/hooks/useFxRate";
import { setBaseCurrency } from "@/utils/money";
import { FloatingBaniProvider } from "@/components/assistant/FloatingBaniContext";
import { FloatingBani } from "@/components/assistant/FloatingBani";
import { VenueScopeProvider } from "@/hooks/useVenueScope";
import { VenueScopePicker } from "@/components/venue/VenueScopePicker";
import "@/components/assistant/floating-bani.css";
import "@/components/route-transitions.css";

const SIDEBAR_OPEN_KEY = "bani.sidebar.open";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { isPreviewActive, previewUserId } = usePreviewMode();
  const { tenantId } = useActiveTenant();
  const baseCurrency = useBaseCurrency().data?.base ?? "HKD";
  setBaseCurrency(baseCurrency);
  const topPad = isPreviewActive ? "pt-10" : "";
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_OPEN_KEY) !== "0"; } catch { return true; }
  });
  // Tablet (768–1099px): icon rail by default, without changing the saved desktop choice.
  const tabletQuery = "(min-width: 768px) and (max-width: 1099px)";
  const [tablet, setTablet] = useState(() => typeof window !== "undefined" && window.matchMedia(tabletQuery).matches);
  const [tabletOpen, setTabletOpen] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(tabletQuery);
    const on = () => { setTablet(mql.matches); setTabletOpen(false); };
    mql.addEventListener("change", on); return () => mql.removeEventListener("change", on);
  }, []);
  const onSidebarOpen = (o: boolean) => {
    if (tablet) { setTabletOpen(o); return; }
    setSidebarOpen(o);
    try { localStorage.setItem(SIDEBAR_OPEN_KEY, o ? "1" : "0"); } catch { /* ignore */ }
  };

  return (
    <VenueScopeProvider><FloatingBaniProvider><SidebarProvider className="tenant-portal" open={tablet ? tabletOpen : sidebarOpen} onOpenChange={onSidebarOpen} style={{ "--sidebar-width-icon": "64px" } as React.CSSProperties}>
      <div className={`tenant-atmosphere ${pathname.startsWith("/assistant") ? "" : "tenant-atmosphere-off"}`} aria-hidden="true" />
      <div className={`min-h-screen flex w-full overflow-x-hidden ${topPad}`}>
        <AppSidebar />
        <main className={`app-shell app-atmosphere flex-1 min-w-0 max-w-full flex flex-col ${pathname.startsWith("/assistant") ? "" : "app-bg-sage"}`}>
          <header className="tenant-topbar sticky top-0 z-30 h-[52px] shrink-0 flex items-center justify-between gap-2 border-b border-border px-2 sm:px-4 backdrop-blur">
            <SidebarTrigger className="h-10 w-10 sm:h-9 sm:w-9 md:hidden" />
            <span className="hidden md:block" />
            <div className="flex min-w-0 items-center gap-2">
              {pathname === "/assistant" && <div id="assistant-topbar-actions" className="flex items-center gap-2" />}
              <VenueScopePicker />
              <div className="shrink-0"><UserMenu /></div>
            </div>
          </header>
          <div className="flex-1 min-w-0 w-full max-w-[1800px] mx-auto px-3 py-4 sm:px-5 sm:py-5 md:px-6 lg:p-8 2xl:px-12">
            <div className="md:hidden">
              {isRevenueRoute(pathname) && !pathname.startsWith("/revenue/setup") && <RevenueNavigation />}
              {pathname.startsWith("/hr") && <PeopleNavigation />}
              {pathname.startsWith("/expenses") && <ExpensesNavigation />}
              </div>
            {pathname.startsWith("/procurement/") && <PurchasingNavigation />}
            {pathname.startsWith("/finance") && <FinanceNavigation />}
            <div key={`${tenantId}:${previewUserId}:${baseCurrency}`} className="min-w-0">
              <div key={pathname} data-slot-loading={['/', '/finance', '/finance/reports', '/revenue', '/procurement/invoices'].includes(pathname)} className="route-content-enter min-w-0">{children}</div>
            </div>
          </div>
        </main>
      </div>
      <SupplierProfileDialog />
      <FloatingBani />
      <BaniChatsDialog />
    </SidebarProvider></FloatingBaniProvider></VenueScopeProvider>
  );
}
