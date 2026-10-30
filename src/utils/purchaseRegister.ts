export interface PurchaseRegisterLine {
  id: string; invoice_id: string; invoice_number: string; invoice_date: string;
  venue: string; supplier_name: string; description: string; quantity: number;
  unit: string; unit_price: number; total: number; product_id: string | null;
  master_name: string; internal_sku: string; external_sku: string; file_url: string; purchase_unit?: string;
}
export interface PurchaseRegisterItem {
  key: string; productId: string; name: string; supplier: string; unit: string;
  lines: PurchaseRegisterLine[]; quantity: number; spent: number; lastPrice: number;
  usualPrice: number | null; change: number | null; freeQuantity: number;
  paidPrice: number | null; overallPrice: number | null;
}
export function filterRegisterLines(rows: PurchaseRegisterLine[], options: {
  from?: string; to?: string; supplier?: string; notLinked?: boolean;
  search?: string; includesVenue: (name: string) => boolean;
}) {
  const query = options.search?.trim().toLowerCase();
  return rows.filter(row => options.includesVenue(row.venue)
    && (!options.from || row.invoice_date >= options.from)
    && (!options.to || row.invoice_date <= options.to)
    && (!options.supplier || options.supplier === "all" || row.supplier_name === options.supplier)
    && (!options.notLinked || !row.product_id)
    && (!query || [row.master_name,row.description,row.invoice_number,row.supplier_name,row.internal_sku,row.external_sku].join(" ").toLowerCase().includes(query)));
}
export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid]) / 2;
}
/** One row per linked item; purchase-unit labels come from Items Master, without changing invoice evidence. */
export function buildRegisterItems(lines: PurchaseRegisterLine[], history: PurchaseRegisterLine[], periodStart?: string): PurchaseRegisterItem[] {
  const start = periodStart ? new Date(`${periodStart}T00:00:00Z`) : null;
  if (start) start.setUTCDate(start.getUTCDate() - 90);
  const historyFrom = start?.toISOString().slice(0,10);
  const grouped = new Map<string, PurchaseRegisterLine[]>();
  for (const line of lines) {
    if (!line.product_id) continue;
    const key = line.product_id;
    grouped.set(key, [...(grouped.get(key) ?? []),line]);
  }
  return [...grouped].map(([key,group]) => {
    const ordered = [...group].sort((a,b) => b.invoice_date.localeCompare(a.invoice_date) || b.id.localeCompare(a.id));
    const latest = ordered[0];
    const quantity = group.reduce((sum,line) => sum+line.quantity,0);
    const spent = group.reduce((sum,line) => sum+line.total,0);
    const paid = group.filter(line => line.unit_price !== 0);
    const paidQuantity = paid.reduce((sum,line) => sum+line.quantity,0);
    const usualPrice = periodStart && historyFrom ? median(history.filter(line => line.product_id === latest.product_id
      && line.invoice_date >= historyFrom && line.invoice_date < periodStart).map(line => line.unit_price)) : null;
    return {
      key, productId: latest.product_id ?? "", name: latest.master_name || latest.description,
      supplier: [...new Set(group.map(line => line.supplier_name))].sort().join(" · "),
      unit: latest.purchase_unit || latest.unit, lines: ordered, quantity, spent, lastPrice: latest.unit_price,
      usualPrice, change: usualPrice && usualPrice > 0 ? (latest.unit_price-usualPrice)/usualPrice*100 : null,
      freeQuantity: group.filter(line => line.unit_price === 0 && line.quantity > 0).reduce((sum,line) => sum+line.quantity,0),
      paidPrice: paidQuantity ? paid.reduce((sum,line) => sum+line.quantity*line.unit_price,0)/paidQuantity : null,
      overallPrice: quantity ? spent/quantity : null,
    };
  });
}