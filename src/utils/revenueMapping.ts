// Pure rules for Settings › Revenue mapping (src/components/settings/RevenueMapping.tsx). The server
// (save_sales_mapping, _post_line_mode_sales) checks the same things; these only shape the screen.

export interface MapLine {
  key: string;
  id?: string;
  venue_id: string | null;
  printed_name: string;
  aliases: string[];
  kind: string | null;
  category: string | null;
  settles_to: 'bank' | 'cash' | null;
  processor_ids: string[];
  gl_account_id: string | null;
}

const SALES: [string, string][] = [['food', 'Food'], ['bev_alc', 'Alcoholic drinks'], ['bev_non', 'Soft drinks'], ['dessert', 'Dessert'], ['other', 'Other']];
const KINDS: [string, string][] = [
  ['service_charge', 'Service charge'], ['discount', 'Discount'], ['tip', 'Tips'], ['payment', 'Payment'], ['delivery', 'Delivery'],
  ['voucher_sold', 'Voucher sold'], ['voucher_used', 'Voucher used'], ['deposit_taken', 'Deposit taken'], ['deposit_used', 'Deposit used'],
  ['guests', 'Guests'], ['orders', 'Orders'], ['subtotal', 'Subtotal'], ['total', 'Control total'], ['ignore', 'Ignore'],
];
export const TYPES = [...SALES.map(([c, l]) => ({ value: `sales:${c}`, label: `Sales · ${l}` })), ...KINDS.map(([k, l]) => ({ value: k, label: l }))];
/** Lines that are counted or checked but never posted. */
export const NO_ACCOUNT = ['total', 'subtotal', 'guests', 'orders', 'ignore'];

export const typeValue = (l: Pick<MapLine, 'kind' | 'category'>) => (!l.kind ? '' : l.kind === 'sales' ? `sales:${l.category ?? 'other'}` : l.kind);
export const typeLabel = (l: Pick<MapLine, 'kind' | 'category'>) => TYPES.find((t) => t.value === typeValue(l))?.label ?? '';
export function fromTypeValue(v: string): Pick<MapLine, 'kind' | 'category'> {
  const [kind, cat] = v.split(':');
  return kind === 'sales' ? { kind, category: cat || 'other' } : { kind: kind || null, category: null };
}

/** What still needs choosing on a line, or null when it is complete. */
export function lineProblem(l: MapLine): 'Select type' | 'Select account' | null {
  if (!l.kind) return 'Select type';
  if (!NO_ACCOUNT.includes(l.kind) && !l.gl_account_id) return 'Select account';
  return null;
}

export function settlesLabel(l: MapLine, processors: { id: string; name: string }[]): string {
  if (l.kind !== 'payment') return '—';
  if (l.settles_to === 'cash') return 'Cash';
  const names = l.processor_ids.map((id) => processors.find((p) => p.id === id)?.name).filter(Boolean);
  return names.length ? names.join(' + ') : 'Bank';
}

/** Lines set for one scope: 'all' is the all-venues setup, otherwise a venue's own lines. */
export const inScope = (lines: MapLine[], scope: string) => lines.filter((l) => (scope === 'all' ? l.venue_id === null : l.venue_id === scope));

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Printed names seen on reports of the venues that use this scope, which the scope does not know yet. */
export function unknownNames(lines: MapLine[], scope: string, seen: { venue_id: string | null; names: string[] }[], venueIds: string[]): string[] {
  const own = new Set(venueIds.filter((v) => inScope(lines, v).length));
  const uses = (venue: string | null) => (scope === 'all' ? !venue || !own.has(venue) : venue === scope);
  const known = new Set(inScope(lines, scope).flatMap((l) => [l.printed_name, ...l.aliases].map(norm)));
  const out = new Map<string, string>();
  for (const s of seen) if (uses(s.venue_id)) for (const n of s.names) if (n.trim() && !known.has(norm(n)) && !out.has(norm(n))) out.set(norm(n), n.trim());
  return [...out.values()];
}

const RULE: Record<string, string> = { sales: 'sales_revenue', service_charge: 'service_charge', discount: 'sales_discount', tip: 'tips_payable' };

/** The account Finance › How things post already uses for this kind of line, when there is one clear answer. */
export function suggestAccount(l: MapLine, rules: { rule_type: string; match_key: string; account_id: string }[], venue: string, allVenues: string[]): string | null {
  const type = l.kind === 'payment' ? (l.settles_to === 'cash' ? 'cash_on_hand' : 'payment_settlement_clearing') : RULE[l.kind ?? ''];
  if (!type) return null;
  const keys = l.venue_id ? [venue] : allVenues;
  const found = [...new Set(rules.filter((r) => r.rule_type === type && keys.includes(r.match_key)).map((r) => r.account_id))];
  return found.length === 1 ? found[0] : null;
}

export const hkToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong' }).format(new Date());
export const dayLabel = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
