import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useKpiCapability } from "@/hooks/useKpiCapability";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { cn } from "@/lib/utils";

export function KpiNavigation() {
  const { pathname, search } = useLocation();
  const capability = useKpiCapability();
  const { canAccessPage, loading } = useUserPermissions(capability.userId ?? undefined);
  if (capability.loading || loading || (!capability.isGlobalAdmin && !canAccessPage("kpis"))) return null;

  const primary = [
    { label: "My KPIs", path: "/kpis/my-cards", allowed: true },
    { label: "Planner", path: "/kpis/planner", allowed: capability.canPlan },
    { label: "KPI Setup", path: "/kpis/setup", allowed: capability.canConfigure },
  ];
  return (
    <div className="mb-5 border-b border-border pb-3">
      <nav aria-label="KPI" className="flex min-w-0 gap-1 overflow-x-auto">
        {primary.filter(item => item.allowed).map(item => {
          const active = pathname === item.path || pathname.startsWith(`${item.path}/`)
            || (item.path === "/kpis/setup" && ["/kpis/assignments", "/kpis/targets"].some(path => pathname === path || pathname.startsWith(`${path}/`)));
          return (
            <Button key={item.path} asChild variant="ghost" size="sm" className={cn("h-8 shrink-0 text-xs", active ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary" : "text-muted-foreground")}>
              <Link to={item.path === pathname ? item.path + search : item.path} aria-current={active ? "page" : undefined}>{item.label}</Link>
            </Button>
          );
        })}
      </nav>
    </div>
  );
}