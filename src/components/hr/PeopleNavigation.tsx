import { useLocation } from "react-router-dom";
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
  const { pathname } = useLocation();
  const activePath = peopleNavigationPath(pathname);
  const visible=tabs;
  return <SectionPillRow label="People" items={visible} activePath={activePath??pathname}/>;
}