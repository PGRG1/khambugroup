import { Link, useLocation } from "react-router-dom";
import { usePurchasingNavigationAccess } from "@/hooks/usePurchasingNavigationAccess";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { SectionPillRow, useActiveNavigationScroll } from "@/components/kit/SectionPillRow";
import { isStockMenuRoute, matchesPurchasingPath, purchasingAnalysisPages, purchasingParentPath, purchasingSectionPagesForPath, purchasingTabsForPath } from "@/utils/purchasingNavigation";

/** URL-only navigation; existing page guards and content remain independent. */
export function PurchasingNavigation() {
  const { pathname } = useLocation();
  const { isMobile } = useSidebar();
  const { canOpen, loading } = usePurchasingNavigationAccess();
  const [tabHost, setTabHost] = useState<Element | null>(null);
  const invoiceTabsRef = useActiveNavigationScroll(pathname, tabHost);
  const invoiceFamily = purchasingParentPath(pathname) === "/procurement/invoices";
  useEffect(() => {
    const locate = () => setTabHost(document.querySelector('[data-invoice-tabs-host]'));
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);
  if (loading) return null;
  const pages = purchasingSectionPagesForPath(pathname).filter(canOpen);
  const tabs = purchasingTabsForPath(pathname)?.filter(canOpen);
  const analysis = pathname === "/procurement/dashboard" ? purchasingAnalysisPages.filter(canOpen) : [];
  const parentPath = purchasingParentPath(pathname);
  return <>
    {!isStockMenuRoute(pathname) && pages.length > 0 && <div className="min-[641px]:hidden">
      <SectionPillRow label="Purchasing" items={pages.filter(page => !page.adminOnly).map(page => ({ label: page.title, path: page.url }))} activePath={pages.find(page => matchesPurchasingPath(parentPath, page.url))?.url ?? parentPath} />
    </div>}
    {isMobile && isStockMenuRoute(pathname) && pages.length > 0 && <div className="mb-5">
      <nav aria-label={isStockMenuRoute(pathname) ? "Stock & menu" : "Purchasing"} className="flex items-center">
        <div className="flex min-w-0 max-w-full gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1">
          {pages.map(page => {
            const active = matchesPurchasingPath(parentPath, page.url);
            return <Link key={page.url} to={page.url} aria-current={active ? "page" : undefined} className={cn(
              "inline-flex h-9 shrink-0 items-center rounded-md px-3 text-[13px] font-medium transition-colors",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}>{page.title}</Link>;
          })}
        </div>
      </nav>
    </div>}
    {analysis.length > 0 && <nav aria-label="Purchasing analysis" className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
      {analysis.map(page => <Link key={page.url} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" to={page.url}>{page.title}</Link>)}
    </nav>}
    {!!tabs?.length && invoiceFamily && tabHost && createPortal(<div className="relative min-w-0"><nav ref={invoiceTabsRef} aria-label="Purchasing pages" className="max-w-full overflow-x-auto border-b border-border"><div className="flex w-max gap-5 pr-5">{tabs.map(tab => <Link key={tab.url} to={tab.url} aria-current={matchesPurchasingPath(pathname, tab.url) ? "page" : undefined} className={cn("py-3 text-[13px] font-medium whitespace-nowrap border-b-2", matchesPurchasingPath(pathname, tab.url) ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{tab.url === "/procurement/credit-notes" ? <><span className="max-[640px]:hidden">{tab.title}</span><span className="min-[641px]:hidden">Credit &amp; Debit</span></> : tab.title}</Link>)}</div></nav><div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent min-[641px]:hidden" /></div>, tabHost)}
    {!!tabs?.length && !invoiceFamily && <nav aria-label="Purchasing pages" className="mb-4 max-w-full overflow-x-auto">
    <div className="inline-flex w-max items-center gap-1 rounded-lg bg-muted/40 p-1 border border-border/50">
      {tabs.map(tab => {
        const active = matchesPurchasingPath(pathname, tab.url);
        return <Link key={tab.url} to={tab.url} aria-current={active ? "page" : undefined} className={cn(
          "px-3 py-1.5 text-xs sm:text-sm rounded-md font-medium transition-colors min-h-[36px] whitespace-nowrap",
          active ? "bg-background text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
        )}>{tab.title}</Link>;
      })}
    </div>
  </nav>}
  </>;
}