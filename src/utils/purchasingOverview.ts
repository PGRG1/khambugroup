export interface OverviewInvoice {
  id: string; supplier_id: string; invoice_date: string; total_amount: number;
  discount: number | null; venue: string | null; created_at: string;
  review_status: string | null; has_disputes: boolean | null;
}
export interface OverviewLine {
  invoice_id: string; product_master_id: string | null; total: number; unit_price: number;
  unit: string | null; quantity: number;
}
export interface OverviewProduct {
  id: string; internal_product_name: string; financial_treatment: string | null; level1_category: string | null; unit: string | null;
}
export interface OverviewSale { date: string; total_sales: number; venue: string | null; }
export function previousCalendarMonth(month: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, m] = month.split("-").map(Number);
  return `${m === 1 ? year - 1 : year}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
}
export function periodIncludes(date: string, period: string, from?: string, to?: string): boolean {
  const day = date.slice(0, 10);
  return period === "all" || (period === "custom" ? (!from || day >= from) && (!to || day <= to) : day.slice(0, 7) === period);
}
export function changePercent(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous * 100 : null;
}
export const sumSpend = (rows: OverviewInvoice[]) => rows.reduce((sum, row) => sum + Number(row.total_amount), 0);
export const sumRevenue = (rows: OverviewSale[]) => rows.reduce((sum, row) => sum + Number(row.total_sales), 0);
export function percentage(spend: number, revenue: number): number | null { return revenue > 0 ? spend / revenue * 100 : null; }

export function supplierRanking(rows: OverviewInvoice[], previous: OverviewInvoice[], names: Map<string, string>) {
  const total = sumSpend(rows);
  const spend = new Map<string, number>(), prior = new Map<string, number>();
  rows.forEach(row => spend.set(row.supplier_id, (spend.get(row.supplier_id) ?? 0) + Number(row.total_amount)));
  previous.forEach(row => prior.set(row.supplier_id, (prior.get(row.supplier_id) ?? 0) + Number(row.total_amount)));
  return [...spend].map(([id, value]) => ({ id, name: names.get(id) ?? "Unknown supplier", value, share: percentage(value, total), change: changePercent(value, prior.get(id) ?? 0) })).sort((a, b) => b.value - a.value);
}

export function itemRanking(lines: OverviewLine[], previous: OverviewLine[], products: Map<string, OverviewProduct>) {
  const group = (rows: OverviewLine[]) => {
    const map = new Map<string, OverviewLine[]>();
    rows.forEach(row => {
      if (!row.product_master_id) return;
      const product = products.get(row.product_master_id);
      if (!product || (product.financial_treatment ?? "").startsWith("Asset")) return;
      map.set(product.id, [...(map.get(product.id) ?? []), row]);
    });
    return map;
  };
  const current = group(lines), prior = group(previous);
  return [...current].map(([id, rows]) => {
    const product = products.get(id);
    const old = prior.get(id) ?? [];
    const units = new Set(rows.map(row => (row.unit ?? "").trim()));
    const oldUnits = new Set(old.map(row => (row.unit ?? "").trim()));
    const unit = units.size === 1 ? [...units][0] : "Mixed units";
    const validPrices = rows.filter(row => Number.isFinite(Number(row.unit_price)));
    const avg = validPrices.length ? validPrices.reduce((n, row) => n + Number(row.unit_price), 0) / validPrices.length : null;
    const oldPrices = old.filter(row => Number.isFinite(Number(row.unit_price)));
    const oldAvg = oldPrices.length ? oldPrices.reduce((n, row) => n + Number(row.unit_price), 0) / oldPrices.length : null;
    const comparable = !!unit && units.size === 1 && oldUnits.size === 1 && oldUnits.has(unit) && avg != null && oldAvg != null;
    const value = rows.reduce((n, row) => n + Number(row.total), 0);
    const oldValue = old.reduce((n, row) => n + Number(row.total), 0);
    return { id, name: product?.internal_product_name ?? "", value, change: changePercent(value, oldValue), isNew: old.length === 0,
      unit, price: units.size === 1 ? avg : null,
      priceComparison: !comparable ? "Can't compare" : Math.abs(Number(avg) - Number(oldAvg)) < 0.005 ? "Same" : "Changed" };
  }).sort((a, b) => b.value - a.value);
}

export function categoryRanking(lines: OverviewLine[], invoices: OverviewInvoice[], products: Map<string, OverviewProduct>) {
  const map = new Map<string, number>();
  lines.forEach(row => { const name = (row.product_master_id ? products.get(row.product_master_id)?.level1_category : null) || "Uncategorized"; map.set(name, (map.get(name) ?? 0) + Number(row.total)); });
  const deductions = invoices.reduce((n, row) => n + Math.abs(Number(row.discount) || 0), 0);
  const result = [...map].map(([name, value]) => ({ id: name, name, value, share: percentage(value, sumSpend(invoices)) })).sort((a, b) => b.value - a.value);
  if (deductions) result.push({ id: "deductions", name: "Discount / Refund", value: -deductions, share: percentage(-deductions, sumSpend(invoices)) });
  return result;
}

export function monthPace(month: string, invoices: OverviewInvoice[], sales: OverviewSale[], cutoff?: number) {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const invoiceRows = invoices.filter(row => row.invoice_date.startsWith(month));
  const salesRows = sales.filter(row => row.date.startsWith(month));
  const latest = Math.max(0, ...invoiceRows.map(row => Number(row.invoice_date.slice(8, 10))), ...salesRows.map(row => Number(row.date.slice(8, 10))));
  let spend = 0, revenue = 0;
  return Array.from({ length: days }, (_, index) => {
    const day = index + 1;
    spend += invoiceRows.filter(row => Number(row.invoice_date.slice(8, 10)) === day).reduce((n, row) => n + Number(row.total_amount), 0);
    revenue += salesRows.filter(row => Number(row.date.slice(8, 10)) === day).reduce((n, row) => n + Number(row.total_sales), 0);
    const visible = day <= (cutoff ?? days);
    return { day, spend: visible ? spend : null, pct: visible && day >= 3 ? percentage(spend, revenue) : null, latest };
  });
}