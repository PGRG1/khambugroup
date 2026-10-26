import { Link, useLocation } from "react-router-dom";
import { useRevenueNavigationAccess } from "@/hooks/useRevenueNavigationAccess";
import { retainCurrentQuery, revenueSection } from "@/utils/revenueNavigation";
import { cn } from "@/lib/utils";

/** Phone tab row for the Revenue section (desktop uses sidebar children). */
export function RevenueNavigation() {
  const { pathname, search } = useLocation();
  const access = useRevenueNavigationAccess();
  const section = revenueSection(pathname);
  const href = (path: string) => retainCurrentQuery(path, pathname, search);
  const items = [
    { key: "overview", label: "Overview", path: "/revenue", allowed: access.revenue },
    { key: "sales", label: "Sales records", path: "/sales-data", allowed: access.revenue },
    { key: "analysis", label: "Trends", path: "/revenue/analysis", allowed: access.revenue },
    { key: "targets", label: "Targets", path: "/revenue/targets-new", allowed: access.forecast },
  ].filter((i) => i.allowed);
  const pill = (active: boolean) => cn(
    "inline-flex h-9 shrink-0 items-center rounded-md px-3 text-[13px] font-medium transition-colors",
    active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
  );
  return (
    <div className="mb-5">
      <nav aria-label="Revenue" className="flex items-center">
        <div className="flex min-w-0 max-w-full gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1">
          {items.map((item) => (
            <Link key={item.key} to={href(item.path)} className={pill(section === item.key)} aria-current={section === item.key ? "page" : undefined}>{item.label}</Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
