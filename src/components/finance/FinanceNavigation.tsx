import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SectionPillRow } from "@/components/kit/SectionPillRow";
import { financeTabs } from "@/utils/financeClose";
import { cn } from "@/lib/utils";
export function FinanceNavigation() {
  const { pathname } = useLocation();
  if (!financeTabs.some((t) => t.path === pathname)) return null;
  return (
    <>
      <div className="md:hidden">
        <SectionPillRow
          label="Finance"
          items={financeTabs}
          activePath={pathname}
        />
      </div>
      <nav
        aria-label="Finance"
        className="hidden md:flex border-b border-border mb-5 gap-1"
      >
        {financeTabs.map((t) => (
          <Button
            asChild
            key={t.path}
            variant="ghost"
            className={cn(
                "rounded-none border-b-2 h-10 bg-transparent shadow-none hover:bg-transparent",
              pathname === t.path
                ? "border-primary"
                : "border-transparent text-muted-foreground",
            )}
          >
            <Link to={t.path} aria-current={pathname === t.path ? "page" : undefined}>{t.label}</Link>
          </Button>
        ))}
      </nav>
    </>
  );
}
