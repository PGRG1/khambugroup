import { useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { Settings } from "lucide-react";
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
    { key: "analysis", label: "Analysis", path: "/revenue/analysis", allowed: access.revenue },
    { key: "targets", label: "Forecast & targets", path: "/revenue/targets-new", allowed: access.forecast },
    { key: "sales", label: "Sales records", path: "/sales-data", allowed: access.revenue },
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
        {access.revenue && (
          <Button asChild variant="ghost" size="sm" className={cn("h-8 shrink-0 px-2 text-xs", section === "setup" ? "bg-primary/10 text-primary" : "text-muted-foreground")}>
            <Link to={href("/revenue/setup")} aria-current={section === "setup" ? "page" : undefined} title="Revenue Setup"><Settings className="h-4 w-4" /><span>Setup</span></Link>
          </Button>
        )}
      </nav>
      {section === "targets" && access.forecast && (
        <nav aria-label="Forecast and target views" className="flex flex-wrap gap-1">
          {[
            { label: "Daily forecast", path: "/revenue/targets-new", active: pathname === "/revenue/targets-new" },
            { label: "Detailed targets", path: lastDetailedPath.current, active: pathname.startsWith("/forecast/") },
          ].map(item => (
            <Button key={item.label} asChild variant="ghost" size="sm" className={cn("h-7 text-xs", item.active ? "bg-muted text-foreground" : "text-muted-foreground")}>
              <Link to={href(item.path)} aria-current={item.active ? "page" : undefined}>{item.label}</Link>
            </Button>
          ))}
        </nav>
      )}
    </div>
  );
}