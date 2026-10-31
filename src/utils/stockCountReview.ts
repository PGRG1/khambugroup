export interface CountBaseline { id: string; venue: string; count_date: string; status: string; created_at?: string }
export interface CountQuantity { session_id: string; product_master_id: string; counted_qty: number | null }
export interface CountDelivery { product_master_id: string | null; venue: string; date: string; status: string; qty: number }
export interface CountMovement { product_master_id: string | null; venue: string; date: string; qty: number }
export interface CountGap { product_master_id: string; counted: number | null; expected: number | null; recentDelivered: number; lastDelivery: string | null; reason: 'missing' | 'difference' | 'uncertain' }
export function daysBefore(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10);
}
export function needsStockLook(counted: number, expected: number) {
  return Math.abs(counted - expected) > Math.max(Math.abs(expected) * 0.2, 1);
}
export function buildStockCountReview(input: { session: CountBaseline; sessions: CountBaseline[]; counts: CountQuantity[]; current: { product_master_id: string; counted_qty: number | null; uncertain?: boolean }[]; deliveries: CountDelivery[]; movements: CountMovement[] }) {
  const { session } = input;
  const previous = input.sessions.filter(s => s.id !== session.id && s.venue === session.venue && s.status === 'approved' && s.count_date <= session.count_date && (!session.created_at || !s.created_at || s.created_at < session.created_at)).sort((a,b) => b.count_date.localeCompare(a.count_date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0];
  const baseline = new Map(input.counts.filter(c => c.session_id === previous?.id).map(c => [c.product_master_id, c.counted_qty]));
  const deliveries = input.deliveries.filter(d => d.venue === session.venue && d.status === 'confirmed' && d.date <= session.count_date);
  const recent = deliveries.filter(d => d.date >= daysBefore(session.count_date, 29) && d.qty > 0);
  const ids = new Set([...input.current.map(c => c.product_master_id), ...recent.flatMap(d => d.product_master_id ? [d.product_master_id] : [])]);
  const gaps: CountGap[] = [];
  for (const id of ids) {
    const line = input.current.find(c => c.product_master_id === id);
    const counted = line?.counted_qty ?? null;
    const base = baseline.get(id);
    const received = deliveries.filter(d => d.product_master_id === id && previous && d.date > previous.count_date).reduce((s,d) => s + d.qty, 0);
    const moved = input.movements.filter(m => m.venue === session.venue && m.product_master_id === id && previous && m.date > previous.count_date && m.date <= session.count_date).reduce((s,m) => s + m.qty, 0);
    const expected = base == null ? null : Number(base) + received + moved;
    const recentItem = recent.filter(d => d.product_master_id === id);
    const recentDelivered = recentItem.reduce((s,d) => s + d.qty, 0);
    const lastDelivery = recentItem.map(d => d.date).sort().pop() ?? null;
    const reason = counted == null && recentDelivered > 0 ? 'missing' : line?.uncertain ? 'uncertain' : counted != null && expected != null && needsStockLook(counted, expected) ? 'difference' : null;
    if (reason) gaps.push({ product_master_id: id, counted, expected, recentDelivered, lastDelivery, reason });
  }
  return { gaps, previous, countedItems: input.current.filter(c => c.counted_qty != null).length };
}