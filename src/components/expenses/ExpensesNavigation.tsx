import { useLocation } from 'react-router-dom';
import { SectionPillRow } from '@/components/kit/SectionPillRow';
import { visibleExpenseTabs } from '@/utils/expenses';
import { useExpenseClaimsExist } from '@/hooks/useExpenseClaimsExist';

/** Expenses section tabs, on every screen. */
export function ExpensesNavigation() {
  const { pathname } = useLocation();
  const tabs = visibleExpenseTabs(useExpenseClaimsExist());
  if (!tabs.some(t => t.path === pathname) && pathname !== '/expenses/claims') return null;
  return <SectionPillRow label="Expenses" items={tabs} activePath={pathname}/>;
}
