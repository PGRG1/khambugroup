export interface StockSession { id: string; venue: string; count_date: string; status: string }
export interface StockCountLine { session_id: string; product_master_id: string; counted_qty: number | null; unit_cost: number }
export interface StockReceipt { id: string; venue: string; status: string; received_date: string }
export interface StockReceiptLine { grn_id: string; product_master_id: string | null; accepted_qty: number | null; quantity_received: number; unit_cost: number }
/** Keep the existing count-plus-deliveries basis, but never present deliveries as a physical count. */
export function stockItemPresentation(productId: string, venues: string[], sessions: StockSession[], counts: StockCountLine[], receipts: StockReceipt[], lines: StockReceiptLine[], today: string) {
  const since = new Date(`${today}T00:00:00Z`); since.setUTCDate(since.getUTCDate() - 29);
  const recentStart = since.toISOString().slice(0, 10);
  let qty = 0, value = 0, delivered = 0, recentDelivered = 0;
  let known = venues.length > 0;
  const baselines: { venue: string; count_date: string; counted_qty: number; unit_cost: number; session_id: string }[] = [];
  for (const venue of venues) {
    const latest = sessions.filter(s => s.venue === venue && s.status === "approved").sort((a, b) => b.count_date.localeCompare(a.count_date));
    const session = latest.find(s => counts.some(c => c.session_id === s.id && c.product_master_id === productId && c.counted_qty != null));
    const count = session && counts.find(c => c.session_id === session.id && c.product_master_id === productId && c.counted_qty != null);
    if (session && count) {
      qty += Number(count.counted_qty); value += Number(count.counted_qty) * Number(count.unit_cost || 0);
      baselines.push({ venue, count_date: session.count_date, counted_qty: Number(count.counted_qty), unit_cost: Number(count.unit_cost || 0), session_id: session.id });
    } else known = false;
    const eligible = new Map(receipts.filter(r => r.venue === venue && ["confirmed", "disputed"].includes(r.status) && r.received_date <= today).map(r => [r.id, r]));
    for (const line of lines) {
      if (line.product_master_id !== productId) continue;
      const header = eligible.get(line.grn_id); if (!header) continue;
      const q = Number(line.accepted_qty ?? line.quantity_received) || 0;
      if (header.received_date >= recentStart) recentDelivered += q;
      if (!session || header.received_date > session.count_date) {
        qty += q; value += q * Number(line.unit_cost || 0); delivered += q;
      }
    }
  }
  return { qty: known ? qty : null, value: known ? value : null, delivered, recentDelivered, baselines };
}
