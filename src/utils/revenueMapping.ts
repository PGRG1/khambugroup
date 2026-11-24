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
  /** Account per venue (venue id → account id); a venue not listed uses gl_account_id. */
  venue_accounts: Record<string, string>;
  /** Payment method or delivery platform: fills the standard columns used by card payouts and Revenue reports. */
  method: string | null;
  /** The sales record field a fixed-field scanner reads into this line. */
  legacy_field?: string | null;
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

export const PAYMENT_METHODS: [string, string][] = [['visa', 'Visa'], ['mastercard', 'Mastercard'], ['amex', 'Amex'], ['union_pay', 'UnionPay'], ['jcb', 'JCB'], ['alipay', 'Alipay'], ['wechat', 'WeChat Pay'], ['payme', 'PayMe'], ['octopus', 'Octopus'], ['other_card', 'Other card'], ['cash', 'Cash']];
export const DELIVERY_METHODS: [string, string][] = [['deliveroo', 'Deliveroo'], ['foodpanda', 'Foodpanda'], ['keeta', 'Keeta'], ['other_delivery', 'Other platform']];
export const methodsFor = (kind: string | null) => (kind === 'payment' ? PAYMENT_METHODS : kind === 'delivery' ? DELIVERY_METHODS : []);
export const methodLabel = (m: string | null) => [...PAYMENT_METHODS, ...DELIVERY_METHODS].find(([k]) => k === m)?.[1] ?? null;

/** A line must have a type before it can be saved. */
export function lineProblem(l: MapLine): 'Select type' | null {
  return l.kind ? null : 'Select type';
}

export const posts = (l: Pick<MapLine, 'kind'>) => !!l.kind && !NO_ACCOUNT.includes(l.kind);
/** The account a line posts to at a venue (its venue's account, else the one for all venues). */
export const accountFor = (l: MapLine, venueId: string | null) => (venueId && l.venue_accounts[venueId]) || l.gl_account_id;
/** A posting line with no account at one of these venues: a day there that uses it is held. */
export const missingAccount = (l: MapLine, venueIds: string[]) => posts(l) && (l.venue_id ? !accountFor(l, l.venue_id) : (!l.gl_account_id && (venueIds.length === 0 || venueIds.some((v) => !l.venue_accounts[v]))));

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
type Rule = { rule_type: string; match_key: string; account_id: string };

/** The account Finance › How things post already uses for this line at one venue. */
function ruleAccount(l: Pick<MapLine, 'kind' | 'settles_to' | 'method'>, rules: Rule[], venue: string): string | null {
  const find = (type: string, key: string) => rules.find((r) => r.rule_type === type && r.match_key === key)?.account_id ?? null;
  if (l.kind === 'payment') {
    if (l.settles_to === 'cash' || l.method === 'cash') return find('cash_on_hand', venue) ?? find('sales_payment_method', `cash__${venue}`) ?? find('cash_clearing', venue);
    return (l.method && find('sales_payment_method', `${l.method}__${venue}`)) || find('payment_settlement_clearing', venue);
  }
  const type = RULE[l.kind ?? ''];
  return type ? find(type, venue) : null;
}

/** Accounts from How things post: one for all venues when they agree, otherwise one per venue. */
export function suggestAccounts(l: MapLine, rules: Rule[], venues: { id: string; name: string }[]): Pick<MapLine, 'gl_account_id' | 'venue_accounts'> | null {
  const scope = l.venue_id ? venues.filter((v) => v.id === l.venue_id) : venues;
  const found = scope.map((v) => [v.id, ruleAccount(l, rules, v.name)] as const).filter((x): x is readonly [string, string] => !!x[1]);
  if (!found.length) return null;
  const distinct = [...new Set(found.map(([, a]) => a))];
  if (distinct.length === 1 && found.length === scope.length) return { gl_account_id: distinct[0], venue_accounts: {} };
  return { gl_account_id: null, venue_accounts: Object.fromEntries(found) };
}

/** The standard report fields every fixed-field client's scanner reads. */
export const STANDARD_LINES: { printed: string; kind: string; field: string; method?: string; settles?: 'bank' | 'cash' }[] = [
  { printed: 'Total sales', kind: 'total', field: 'total_sales' }, { printed: 'Subtotal', kind: 'subtotal', field: 'subtotal' },
  { printed: 'Guests', kind: 'guests', field: 'guests' }, { printed: 'Orders', kind: 'orders', field: 'orders' },
  { printed: 'Service charge', kind: 'service_charge', field: 'service_charge' }, { printed: 'Discount', kind: 'discount', field: 'discount' },
  { printed: 'Card tips', kind: 'tip', field: 'card_tips' },
  ...PAYMENT_METHODS.filter(([m]) => !['octopus', 'other_card'].includes(m)).map(([m, label]) => ({ printed: label, kind: 'payment', field: m, method: m, settles: (m === 'cash' ? 'cash' : 'bank') as 'bank' | 'cash' })),
  ...DELIVERY_METHODS.filter(([m]) => m !== 'other_delivery').map(([m, label]) => ({ printed: label, kind: 'delivery', field: m, method: m })),
  { printed: 'Vouchers sold', kind: 'voucher_sold', field: 'vouchers_sold' }, { printed: 'Vouchers used', kind: 'voucher_used', field: 'vouchers_used' },
  { printed: 'Deposits taken', kind: 'deposit_taken', field: 'deposits_taken' }, { printed: 'Deposits used', kind: 'deposit_used', field: 'deposits_used' },
];
const FIELD_METHOD: Record<string, string> = Object.fromEntries(STANDARD_LINES.filter((l) => l.method).map((l) => [l.field, l.method!]));

/**
 * The draft a client starts from. A client already scanning on the standard fields gets those fields as lines;
 * before its first version each line takes its method from its field, net sales post as sales (as they always
 * have), and accounts come from How things post. Lines that already have a choice keep it.
 */
export function prefillDraft(lines: MapLine[], o: { hasVersion: boolean; scansFields: boolean; rules: Rule[]; venues: { id: string; name: string }[] }): MapLine[] {
  const base: MapLine[] = lines.length ? lines.map((l) => ({ ...l, aliases: [...l.aliases], processor_ids: [...l.processor_ids], venue_accounts: { ...l.venue_accounts } }))
    : o.scansFields ? STANDARD_LINES.map((d) => ({ key: `new-${d.field}`, venue_id: null, printed_name: d.printed, aliases: [], kind: d.kind, category: null, settles_to: d.settles ?? null, processor_ids: [], gl_account_id: null, venue_accounts: {}, method: d.method ?? null, legacy_field: d.field }))
    : [];
  if (o.hasVersion) return base;
  const hasSales = base.some((l) => l.kind === 'sales');
  return base.map((l) => {
    let next = { ...l };
    if (!next.method && next.legacy_field && FIELD_METHOD[next.legacy_field]) next.method = FIELD_METHOD[next.legacy_field];
    if (!hasSales && next.legacy_field === 'subtotal' && next.kind === 'subtotal') next = { ...next, kind: 'sales', category: 'other' };
    if (posts(next) && !next.gl_account_id && !Object.keys(next.venue_accounts).length) {
      const s = suggestAccounts(next, o.rules, o.venues);
      if (s) next = { ...next, ...s };
    }
    return next;
  });
}

export const hkToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong' }).format(new Date());
export const dayLabel = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
