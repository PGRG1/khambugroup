import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SectionPillRow } from "@/components/kit/SectionPillRow";
import { usePeopleSettings } from "@/hooks/usePeopleSettings";
import { useVenueScope } from "@/hooks/useVenueScope";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Team", path: "/hr/employees" },
  { label: "Rota & hours", path: "/hr/schedule" },
  { label: "Payroll", path: "/hr/payroll" },
];

export function peopleNavigationPath(pathname: string): string | undefined {
  if(pathname==="/hr")return "/hr/employees";
  if(pathname==="/hr/leave")return "/hr/schedule";
  if(pathname==="/hr/payroll/payables")return undefined;
  return tabs.filter(tab => pathname === tab.path || (tab.path !== "/hr" && pathname.startsWith(`${tab.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path;
}

export function PeopleNavigation() {
  const { pathname, search } = useLocation();
  const activePath = peopleNavigationPath(pathname);
  const settings=usePeopleSettings();const scope=useVenueScope();
  const visible=tabs.filter(t=>t.path!=="/hr/schedule"||scope.venues.some(v=>scope.includesId(v.id)&&settings.forVenue(v.id).rota));
  return (
    <div className="mb-5 min-w-0">
      <div className="sm:hidden"><SectionPillRow label="People" items={visible} activePath={activePath??"/hr/employees"}/></div>
      <nav aria-label="People" className="hidden sm:flex min-w-0 border-b border-border gap-1 overflow-x-auto">
        {visible.map(tab => (
          <Button key={tab.path} asChild variant="ghost" size="sm" className={cn("h-10 shrink-0 rounded-none border-b-2 text-sm", activePath === tab.path ? "border-primary text-foreground" : "text-muted-foreground")}>
            <Link to={tab.path === pathname ? tab.path + search : tab.path} aria-current={activePath === tab.path ? "page" : undefined}>{tab.label}</Link>
          </Button>
        ))}
      </nav>
    </div>
  );
}