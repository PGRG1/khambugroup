import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Overview", path: "/hr" },
  { label: "Employees", path: "/hr/employees" },
  { label: "Schedule", path: "/hr/schedule" },
  { label: "Leave", path: "/hr/leave" },
  { label: "Payroll", path: "/hr/payroll" },
  { label: "Payroll Payables", path: "/hr/payroll/payables" },
];

export function peopleNavigationPath(pathname: string): string | undefined {
  return tabs.filter(tab => pathname === tab.path || (tab.path !== "/hr" && pathname.startsWith(`${tab.path}/`)))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path;
}

export function PeopleNavigation() {
  const { pathname, search } = useLocation();
  const activePath = peopleNavigationPath(pathname);
  return (
    <div className="mb-5 border-b border-border pb-3">
      <nav aria-label="People" className="flex min-w-0 gap-1 overflow-x-auto">
        {tabs.map(tab => (
          <Button key={tab.path} asChild variant="ghost" size="sm" className={cn("h-8 shrink-0 text-xs", activePath === tab.path ? "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary" : "text-muted-foreground")}>
            <Link to={tab.path === pathname ? tab.path + search : tab.path} aria-current={activePath === tab.path ? "page" : undefined}>{tab.label}</Link>
          </Button>
        ))}
      </nav>
    </div>
  );
}