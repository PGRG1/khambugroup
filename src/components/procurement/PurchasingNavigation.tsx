import { Link, useLocation } from "react-router-dom";
import { usePurchasingNavigationAccess } from "@/hooks/usePurchasingNavigationAccess";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { SectionPillRow, useActiveNavigationScroll } from "@/components/kit/SectionPillRow";
import { isStockMenuRoute, matchesPurchasingPath, purchasingParentPath, purchasingSectionPagesForPath, purchasingTabsForPath } from "@/utils/purchasingNavigation";

// Phone names short enough for all four to fit on one line.
const SHORT_TAB_NAMES: Record<string, string> = { "/procurement/line-items": "Register", "/procurement/credit-notes": "Notes", "/procurement/receiving": "Received" };

/** URL-only navigation; existing page guards and content remain independent. */
export function PurchasingNavigation() {
  const { pathname } = useLocation();
  const { canOpen, loading } = usePurchasingNavigationAccess();
  const [tabHost, setTabHost] = useState<Element | null>(null);
  const invoiceTabsRef = useActiveNavigationScroll(pathname, tabHost);
  const invoiceFamily = ["/procurement/invoices", "/procurement/inventory"].includes(purchasingParentPath(pathname));
  useEffect(() => {
    const locate = () => setTabHost(document.querySelector('[data-invoice-tabs-host]'));
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);
  if (loading) return null;
  const sectionPages = purchasingSectionPagesForPath(pathname);
  const pages = sectionPages.filter(canOpen);
  const tabs = purchasingTabsForPath(pathname)?.filter(canOpen);
  const parentPath = purchasingParentPath(pathname);
  return <>
    {!isStockMenuRoute(pathname) && pages.length > 0 && <div className="min-[641px]:hidden">
      <SectionPillRow label="Purchasing" items={pages.filter(page => !page.adminOnly).map(page => ({ label: page.title, path: page.url }))} activePath={pages.find(page => matchesPurchasingPath(parentPath, page.url))?.url ?? parentPath} />
    </div>}
    {isStockMenuRoute(pathname) && pages.length > 0 && <div className="min-[641px]:hidden">
      <SectionPillRow label="Stock & menu" items={pages.map(page => ({ label: page.title, path: page.url }))} activePath={parentPath} />
    </div>}
    {!!tabs?.length && invoiceFamily && tabHost && createPortal(<nav ref={invoiceTabsRef} aria-label="Purchasing pages" className="max-w-full overflow-x-auto">
      <div className="invoice-switch">{tabs.map(tab => {
        const active = matchesPurchasingPath(pathname, tab.url);
        const short = SHORT_TAB_NAMES[tab.url];
        return <Link key={tab.url} to={tab.url} aria-current={active ? "page" : undefined} className={cn("invoice-switch-item", active && "is-active")}>
          {short ? <><span className="max-[640px]:hidden">{tab.title}</span><span className="min-[641px]:hidden">{short}</span></> : <span>{tab.title}</span>}
        </Link>;
      })}</div>
    </nav>, tabHost)}
    {!!tabs?.length && !invoiceFamily && <nav aria-label="Purchasing pages" className="mb-4 max-w-full overflow-x-auto">
    <div className="section-tabs inline-flex w-max items-center gap-1 rounded-full bg-muted/40 p-1 border border-border/50">
      {tabs.map(tab => {
        const active = matchesPurchasingPath(pathname, tab.url);
        return <Link key={tab.url} to={tab.url} aria-current={active ? "page" : undefined} className={cn(
          "px-3.5 py-1.5 text-xs sm:text-sm rounded-full font-medium transition-colors min-h-[36px] whitespace-nowrap",
          active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}>{tab.title}</Link>;
      })}
    </div>
  </nav>}
  </>;
}