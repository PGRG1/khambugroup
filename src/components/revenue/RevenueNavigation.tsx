import { useLocation } from "react-router-dom";
import { useRevenueNavigationAccess } from "@/hooks/useRevenueNavigationAccess";
import { retainCurrentQuery, revenueSection } from "@/utils/revenueNavigation";
import { SectionPillRow } from "@/components/kit/SectionPillRow";

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
  return <SectionPillRow label="Revenue" items={items.map(item => ({ label: item.label, path: href(item.path) }))} activePath={href(items.find(item => item.key === section)?.path ?? pathname)} />;
}
