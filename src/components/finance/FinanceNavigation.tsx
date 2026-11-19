import { useLocation } from "react-router-dom";
import { SectionPillRow } from "@/components/kit/SectionPillRow";
import { financeTabs } from "@/utils/financeClose";

export function FinanceNavigation() {
  const { pathname } = useLocation();
  if (!financeTabs.some((t) => t.path === pathname)) return null;
  return (
    <div className="md:hidden">
      <SectionPillRow
        label="Finance"
        items={financeTabs}
        activePath={pathname}
      />
    </div>
  );
}
