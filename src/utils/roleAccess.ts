// Access roles: Bani sets what each role can do per business (control plane); the client only assigns roles.
// Levels are stored 0-3 in tenant_roles and read by access_level(); money by money_level().
export const ROLE_AREAS = ['revenue', 'purchasing', 'stock', 'people', 'payroll', 'expenses', 'finance', 'settings'] as const;
export type RoleArea = typeof ROLE_AREAS[number];
export const AREA_LABEL: Record<RoleArea, string> = { revenue: 'Revenue', purchasing: 'Purchasing', stock: 'Stock', people: 'People', payroll: 'Payroll', expenses: 'Expenses', finance: 'Finance', settings: 'Settings' };
export const AREA_NOTE: Record<RoleArea, string> = { revenue: 'Sales, targets, daily records', purchasing: 'Orders, invoices, deliveries', stock: 'Counts, transfers, waste', people: 'Team, rota, leave', payroll: 'Pay runs and payslips', expenses: 'Bills, petty cash', finance: 'Books, bank, reports', settings: 'Company, lists, setup' };
export const LEVELS = ['No access', 'See', 'Do', 'Approve'] as const;
export const LEVEL_SHORT = ['—', 'See', 'Do', 'Approve'] as const;
export const MONEY = [
  { key: 'nothing', label: 'No figures', line: 'Counts and names only' },
  { key: 'sales', label: 'Sales only', line: 'Sales, covers, average spend' },
  { key: 'costs', label: 'Costs only', line: 'Purchases and stock value' },
  { key: 'sales_costs', label: 'Sales and costs', line: 'Gross margin, not payroll or profit' },
  { key: 'everything', label: 'Everything', line: 'Payroll, profit and the books' },
] as const;
export type MoneyKey = typeof MONEY[number]['key'];
export const moneyLabel = (k: string) => MONEY.find(m => m.key === k)?.label ?? k;
export type TenantRole = { role_key: string; name: string; money: string; sort_order: number } & Record<RoleArea, number>;
export const ROLE_COLUMNS = `role_key,name,money,sort_order,${ROLE_AREAS.join(',')}`;

const list = (a: RoleArea[]) => { const n = a.map(x => AREA_LABEL[x].toLowerCase()); return n.length > 3 ? `${n.slice(0, 3).join(', ')} +${n.length - 3}` : n.join(', '); };
/** One plain line saying what a role can do, built from its levels so it stays true after Bani changes it. */
export function roleLine(r: TenantRole): string {
  const at = (l: number) => ROLE_AREAS.filter(a => r[a] === l);
  if (ROLE_AREAS.every(a => r[a] >= 2) && r.money === 'everything') return 'Everything';
  const approve = at(3), doing = at(2), see = at(1);
  const first = approve.length ? `Approves ${list(approve)}` : doing.length ? `Works in ${list(doing)}` : see.length ? `Sees ${list(see)}` : 'Own shifts only';
  return r.money === 'nothing' ? first : `${first} · ${moneyLabel(r.money).toLowerCase()}`;
}
/** Legacy page-access position sent with an invite, so older screens keep working while roles roll out. */
export const legacyPosition = (k: string) => k === 'owner' ? 'owner' : k === 'finance' ? 'finance' : ['front_of_house', 'back_of_house'].includes(k) ? 'staff' : 'gm';
