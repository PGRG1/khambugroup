// Declarative navigation only: never accept model-authored URLs or save flags.
export const SCREENS = {
  home: { path: '/', area: 'revenue', page: 'revenue' },
  revenue: { path: '/revenue', area: 'revenue', page: 'revenue' },
  sales: { path: '/sales-data', area: 'revenue', page: 'revenue' },
  purchasing: { path: '/procurement/dashboard', area: 'purchasing', page: 'procurement' },
  invoices: { path: '/procurement/invoices', area: 'purchasing', page: 'procurement' },
  purchase_orders: { path: '/procurement/purchase-orders', area: 'purchasing', page: 'procurement' },
  receiving: { path: '/procurement/receiving', area: 'purchasing', page: 'procurement' },
  suppliers: { path: '/procurement/finance/suppliers', area: 'purchasing', page: 'procurement' },
  stock: { path: '/procurement/stock-overview', area: 'stock', page: 'procurement' },
  stock_counts: { path: '/procurement/stock-counts', area: 'stock', page: 'procurement' },
  movements: { path: '/procurement/movements', area: 'stock', page: 'procurement' },
  menu: { path: '/procurement/menu-costing', area: 'stock', page: 'procurement' },
  expenses: { path: '/expenses', area: 'expenses', page: 'expenses' },
  bills: { path: '/expenses/bills', area: 'expenses', page: 'expenses' },
  regular_bills: { path: '/expenses/recurring', area: 'expenses', page: 'expenses' },
  staff_claims: { path: '/expenses/claims', area: 'expenses', page: 'expenses' },
  people: { path: '/hr', area: 'people', page: 'people' },
  team: { path: '/hr/employees', area: 'people', page: 'people' },
  rota: { path: '/hr/schedule', area: 'people', page: 'people' },
  payroll: { path: '/hr/payroll', area: 'payroll', page: 'people' },
  finance: { path: '/finance', area: 'finance', page: 'finance' },
  reports: { path: '/finance/reports', area: 'finance', page: 'finance' },
  books: { path: '/finance/books', area: 'finance', page: 'finance' },
  cash: { path: '/finance/cash', area: 'finance', page: 'finance' },
  close: { path: '/finance/close', area: 'finance', page: 'finance' },
  payables: { path: '/finance/payables', area: 'finance', page: 'finance' },
  receivables: { path: '/finance/receivables', area: 'finance', page: 'finance' },
  settings: { path: '/settings', area: 'settings', page: 'admin' },
} as const;
export type Screen = keyof typeof SCREENS;
export type Navigation = { screen: Screen; record_id?: string; status?: string; week?: string };
export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function navigationPath(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.screen !== 'string' || !Object.prototype.hasOwnProperty.call(SCREENS, a.screen)) return null;
  if (Object.keys(a).some(k => !['screen', 'record_id', 'status', 'week'].includes(k))) return null;
  const screen = a.screen as Screen;
  let path: string = SCREENS[screen].path;
  const query = new URLSearchParams();
  if (a.record_id !== undefined) {
    if (!isUuid(a.record_id) || !['sales', 'invoices', 'bills'].includes(screen)) return null;
    if (screen === 'sales') path += `/${a.record_id}`;
    else query.set(screen === 'invoices' ? 'invoice' : 'bill', a.record_id);
  }
  if (a.status !== undefined) {
    if (screen === 'invoices' && ['Draft', 'To approve', 'Approved', 'Disputed', 'Voided'].includes(String(a.status))) query.set('review_status', String(a.status));
    else if (screen === 'bills' && ['all', 'waiting', 'to-pay', 'paid'].includes(String(a.status))) query.set('status', String(a.status));
    else return null;
  }
  if (a.week !== undefined) {
    if (screen !== 'rota' || typeof a.week !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(a.week)) return null;
    const date = new Date(`${a.week}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== a.week || date.getUTCDay() !== 1) return null;
    query.set('week', a.week);
  }
  return path + (query.size ? `?${query}` : '');
}
export function internalNavigation(href: string): Navigation | null {
  if (!href.startsWith('/') || href.startsWith('//') || href.includes('\\')) return null;
  const url = new URL(href, 'https://bani.invalid');
  const sales = url.pathname.match(/^\/sales-data\/([0-9a-f-]{36})$/i);
  const entry = Object.entries(SCREENS).find(([, s]) => s.path === url.pathname);
  if (!entry && !sales) return null;
  const a: Navigation = { screen: sales ? 'sales' : entry?.[0] as Screen };
  if (sales) a.record_id = sales[1];
  for (const [key, value] of url.searchParams) {
    if ((key === 'invoice' && a.screen === 'invoices') || (key === 'bill' && a.screen === 'bills')) a.record_id = value;
    else if (key === 'review_status' && a.screen === 'invoices' || key === 'status' && a.screen === 'bills') a.status = value;
    else if (key === 'week' && a.screen === 'rota') a.week = value;
    else return null;
  }
  return navigationPath(a) ? a : null;
}