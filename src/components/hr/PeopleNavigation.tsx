import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePeopleSettings } from "@/hooks/usePeopleSettings";
import { useVenueScope } from "@/hooks/useVenueScope";
import { cn } from "@/lib/utils";
import { SectionPillRow } from '@/components/kit/SectionPillRow';

const tabs = [
  { label: "Overview", path: "/hr/overview" },
  { label: "Team", path: "/hr/employees" },
  { label: "Rota", path: "/hr/schedule" },
  { label: "Payroll", path: "/hr/payroll" },
];

export function peopleNavigationPath(pathname: string): string | undefined {
  if(pathname==="/hr")return "/hr/overview";
  if(pathname==="/hr/leave"||pathname==="/hr/clock")return "/hr/schedule";
  if(pathname==="/hr/payroll/payables")return undefined;
  return tabs.filter(tab => pathname === tab.path || (tab.path !== "/hr" && pathname.startsWith(`${tab.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path;
}

export function PeopleNavigation() {
  const { pathname, search } = useLocation();
  const activePath = peopleNavigationPath(pathname);
  const settings=usePeopleSettings();const scope=useVenueScope();
  const visible=tabs;
  return (
    <div className="min-w-0">
      <div className="md:hidden"><SectionPillRow label="People" items={visible} activePath={activePath??pathname}/></div>
      <nav aria-label="People" className="hidden md:flex min-w-0 gap-1">
        {visible.map(tab => (
          <Button key={tab.path} asChild variant="ghost" size="sm" className={cn("h-10 shrink-0 rounded-none border-b-2 text-sm", activePath === tab.path ? "border-primary text-foreground" : "border-transparent text-muted-foreground")}>
            <Link to={tab.path === pathname ? tab.path + search : tab.path} aria-current={activePath === tab.path ? "page" : undefined}>{tab.label}</Link>
          </Button>
        ))}
      </nav>
    </div>
  );
}