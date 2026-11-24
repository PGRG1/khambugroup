// Pure rules for Settings › Purchasing setup (src/components/settings/PurchasingSetup.tsx). The server
// (save_purchasing_setup and the journal rebuild) checks the same things; these only shape the screen.

export const GROUPS: [string, string][] = [
  ['COGS', 'Cost of sales'], ['OpEx', 'Operating expense'], ['Asset - Supplier Deposit', 'Supplier deposit'],
  ['Asset - Fixed Asset', 'Fixed asset'], ['Asset - Prepayment', 'Prepayment'], ['Asset - Other', 'Other asset'],
];
export const groupLabel = (g: string) => GROUPS.find(([k]) => k === g)?.[1] ?? null;

export interface CategoryRow {
  key: string;
  /** Group the products are saved with now ('' = none yet). */
  treatment: string;
  category: string;
  /** Group chosen here for a category that has none. */
  new_treatment: string | null;
  account_id: string | null;
  /** venue id → account id */
  venue_accounts: Record<string, string>;
  products: number;
}

type Rule = { rule_type: string; match_key: string; account_id: string };

/** One row per category the client's products use or the setup already names, with today's accounts. */
export function buildRows(products: { financial_treatment: string | null; level1_category: string | null }[], rules: Rule[], venues: { id: string; name: string }[]): CategoryRow[] {
  const rows = new Map<string, CategoryRow>();
  const row = (t: string, c: string) => {
    const key = `${t}__${c}`;
    if (!rows.has(key)) rows.set(key, { key, treatment: t, category: c, new_treatment: null, account_id: null, venue_accounts: {}, products: 0 });
    return rows.get(key)!;
  };
  for (const p of products) row(p.financial_treatment ?? '', p.level1_category ?? '').products += 1;
  for (const r of rules) {
    if (r.rule_type === 'procurement_category') {
      const [t, ...rest] = r.match_key.split('__');
      row(t, rest.join('__')).account_id = r.account_id;
    }
  }
  for (const r of rules) {
    if (r.rule_type !== 'procurement_category_venue') continue;
    const v = venues.find((x) => r.match_key.endsWith(`__${x.name}`));
    if (!v) continue;
    const base = r.match_key.slice(0, r.match_key.length - v.name.length - 2);
    const [t, ...rest] = base.split('__');
    row(t, rest.join('__')).venue_accounts[v.id] = r.account_id;
  }
  const order = (r: CategoryRow) => (GROUPS.findIndex(([k]) => k === r.treatment) + 100) % 100;
  return [...rows.values()].sort((a, b) => order(a) - order(b) || b.products - a.products || a.category.localeCompare(b.category));
}

export const groupOf = (r: CategoryRow) => r.new_treatment ?? r.treatment;
/** The account a category posts to at a venue. */
export const accountAt = (r: CategoryRow, venueId: string | null) => (venueId && r.venue_accounts[venueId]) || r.account_id;
/** What still needs choosing, or null. */
export function rowProblem(r: CategoryRow, venueIds: string[]): 'Select group' | 'No account' | null {
  if (!groupOf(r)) return 'Select group';
  if (!r.account_id && (venueIds.length === 0 || venueIds.some((v) => !r.venue_accounts[v]))) return 'No account';
  return null;
}
export const categoryLabel = (r: CategoryRow) => r.category || 'No category';
