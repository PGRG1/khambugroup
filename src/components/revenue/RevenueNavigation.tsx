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
    { key: "sales", label: "Sales", path: "/sales-data", allowed: access.revenue },
    { key: "analysis", label: "Analysis", path: "/revenue/analysis", allowed: access.revenue },
    { key: "targets", label: "Targets", path: "/revenue/targets-new", allowed: access.forecast },
    { key: "setup", label: "Setup", path: "/revenue/setup", allowed: access.revenue },
  ];
  const pill = (active: boolean) => cn(
    "inline-flex h-7 shrink-0 items-center rounded-md px-3 text-[12px] font-medium transition-colors",
    active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
  );
  const main = primary.filter(item => item.allowed && item.key !== "setup");
  const setup = primary.find(item => item.key === "setup" && item.allowed);
  return (
    <div className="mb-5 space-y-2">
      <nav aria-label="Revenue" className="flex items-center gap-2">
        <div className="flex min-w-0 max-w-full gap-1 overflow-x-auto rounded-lg bg-muted/50 p-1">
          {main.map(item => (
            <Link key={item.key} to={href(item.path)} className={pill(section === item.key)} aria-current={section === item.key ? "page" : undefined}>{item.label}</Link>
          ))}
        </div>
        {setup && (
          <Button asChild variant="ghost" size="sm" className={cn("ml-auto h-8 shrink-0 text-xs", section === "setup" ? "text-foreground" : "text-muted-foreground")}>
            <Link to={href(setup.path)} aria-current={section === "setup" ? "page" : undefined}>Setup</Link>
          </Button>
        )}
      </nav>
      {section === "targets" && access.forecast && (
        <nav aria-label="Forecast and target views" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-muted/40 p-1">
          {[
            { label: "Daily forecast", path: "/revenue/targets-new", active: pathname === "/revenue/targets-new" },
            { label: "Detailed targets", path: lastDetailedPath.current, active: pathname.startsWith("/forecast/") || pathname.startsWith("/forecast-legacy/") },
          ].map(item => (
            <Link key={item.label} to={href(item.path)} className={pill(item.active)} aria-current={item.active ? "page" : undefined}>{item.label}</Link>
          ))}
        </nav>
      )}
    </div>
  );
}