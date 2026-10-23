import { useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useRevenueNavigationAccess } from "@/hooks/useRevenueNavigationAccess";
import { detailedTargetsPath, retainCurrentQuery, revenueSection } from "@/utils/revenueNavigation";
import { cn } from "@/lib/utils";

export function RevenueNavigation() {
  const { pathname, search } = useLocation();
  const access = useRevenueNavigationAccess();
  const section = revenueSection(pathname);
  const lastDetailedPath = useRef("/forecast/assembly");
  const currentDetailedPath = detailedTargetsPath(pathname);
  if (currentDetailedPath) lastDetailedPath.current = currentDetailedPath;
  const href = (path: string) => retainCurrentQuery(path, pathname, search);
  const primary = [
    { key: "overview", label: "Overview", path: "/revenue", allowed: access.revenue },
    { key: "sales", label: "Sales Records", path: "/sales-data", allowed: access.revenue },
    { key: "analysis", label: "Analysis", path: "/revenue/analysis", allowed: access.revenue },
    { key: "targets", label: "Targets & Forecasts", path: "/revenue/targets-new", allowed: access.forecast },
    { key: "reconciliation", label: "Reconciliation", path: "/revenue/reconciliation", allowed: access.revenue },
    { key: "setup", label: "Setup", path: "/revenue/setup", allowed: access.revenue },
  ];
  return (
    <div className="mb-5 space-y-2 border-b border-border pb-3">
      <nav aria-label="Revenue" className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {primary.filter(item => item.allowed).map(item => (
            <Button key={item.key} asChild variant="ghost" size="sm" className={cn("h-8 shrink-0 text-xs", section === item.key ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary" : "text-muted-foreground")}>
              <Link to={href(item.path)} aria-current={section === item.key ? "page" : undefined}>{item.label}</Link>
            </Button>
          ))}
        </div>
      </nav>
      {section === "targets" && access.forecast && (
        <nav aria-label="Forecast and target views" className="flex gap-1 overflow-x-auto">
          {[
            { label: "Daily forecast", path: "/revenue/targets-new", active: pathname === "/revenue/targets-new" },
            { label: "Detailed targets", path: lastDetailedPath.current, active: pathname.startsWith("/forecast/") },
            { label: "Legacy forecast", path: lastDetailedPath.current.replace("/forecast/", "/forecast-legacy/"), active: pathname.startsWith("/forecast-legacy/") },
          ].map(item => (
            <Button key={item.label} asChild variant="ghost" size="sm" className={cn("h-7 shrink-0 text-xs", item.active ? "bg-muted text-foreground" : "text-muted-foreground")}>
              <Link to={href(item.path)} aria-current={item.active ? "page" : undefined}>{item.label}</Link>
            </Button>
          ))}
        </nav>
      )}
    </div>
  );
}