import { useLocation } from 'react-router-dom';
import { SectionPillRow } from '@/components/kit/SectionPillRow';
import { visibleExpenseTabs } from '@/utils/expenses';
import { useExpenseClaimsExist } from '@/hooks/useExpenseClaimsExist';

/** Phone-only page pills; on desktop the sidebar is the only Expenses navigation. */
export function ExpensesNavigation() {
  const { pathname } = useLocation();
  const tabs = visibleExpenseTabs(useExpenseClaimsExist());
  if (!tabs.some(t => t.path === pathname) && pathname !== '/expenses/claims') return null;
  return <SectionPillRow label="Expenses" items={tabs} activePath={pathname}/>;
}
