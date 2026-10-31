import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SectionPillRow } from '@/components/kit/SectionPillRow';
import { expenseTabs } from '@/utils/expenses';
import { cn } from '@/lib/utils';

export function ExpensesNavigation() {
  const { pathname } = useLocation();
  if (!expenseTabs.some(t => t.path === pathname)) return null;
  return <><div className="md:hidden"><SectionPillRow label="Expenses" items={expenseTabs} activePath={pathname}/></div><nav aria-label="Expenses" className="hidden md:flex border-b border-border mb-5 gap-2">{expenseTabs.map(t => <Button key={t.path} asChild variant="ghost" className={cn('rounded-none border-b-2 h-10', pathname === t.path ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground')}><Link to={t.path} aria-current={pathname === t.path ? 'page' : undefined}>{t.label}</Link></Button>)}</nav></>;
}