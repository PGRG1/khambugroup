// Purchasing Trends: the longer picture, 12 months ending this month. Pure, so it can be tested.
// Same figures as the Overview (invoice totals for spend and suppliers, invoice lines for categories
// and items); drafts are left out by the caller, as on the Overview.
import { percentage, sumRevenue, sumSpend, type OverviewInvoice, type OverviewLine, type OverviewProduct, type OverviewSale } from "@/utils/purchasingOverview";

export const shiftMonth = (key: string, n: number) => {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
/** The 12 calendar months ending with `current` ("2026-11"), oldest first. */
export const trendMonths = (current: string) => Array.from({ length: 12 }, (_, i) => shiftMonth(current, i - 11));

export interface TrendSeries { id: string; name: string; group?: string; total: number; months: (number | null)[] }

export function purchasingTrends(input: {
  current: string; invoices: OverviewInvoice[]; lines: OverviewLine[]; products: Map<string, OverviewProduct>;
  sales: OverviewSale[]; supplierNames: Map<string, string>;
}) {
  const months = trendMonths(input.current);
  const inMonth = new Map(months.map((m) => [m, [] as OverviewInvoice[]]));
  input.invoices.forEach((row) => inMonth.get(row.invoice_date.slice(0, 7))?.push(row));
  const monthOf = new Map(input.invoices.map((row) => [row.id, row.invoice_date.slice(0, 7)]));
  const lines = input.lines.filter((line) => inMonth.has(monthOf.get(line.invoice_id) ?? ""));

  // Monthly spend and spend as % of sales.
  const monthly = months.map((m) => {
    const spend = sumSpend(inMonth.get(m) ?? []);
    const revenue = sumRevenue(input.sales.filter((row) => row.date.startsWith(m)));
    return { key: m, spend, revenue, pct: percentage(spend, revenue) };
  });

  // A series per name, month by month; null for a month with nothing, never a guessed 0.
  const series = (keyOf: (line: OverviewLine) => { id: string; name: string } | null, limit: number): TrendSeries[] => {
    const map = new Map<string, TrendSeries>();
    lines.forEach((line) => {
      const k = keyOf(line); if (!k) return;
      const s = map.get(k.id) ?? { id: k.id, name: k.name, total: 0, months: months.map(() => null) };
      const i = months.indexOf(monthOf.get(line.invoice_id) ?? "");
      s.months[i] = (s.months[i] ?? 0) + Number(line.total);
      s.total += Number(line.total);
      map.set(k.id, s);
    });
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, limit);
  };
  const product = (line: OverviewLine) => (line.product_master_id ? input.products.get(line.product_master_id) : undefined);
  // Refundable deposits (kegs, bottles) are an asset, not spend: left out of categories and items.
  const spend = (line: OverviewLine) => { const p = product(line); return p && (p.financial_treatment ?? "").startsWith("Asset") ? null : p ?? "none"; };
  // Categories at the second level (Alcoholic, Non-Alcoholic, Meat, Cleaning...), named with their
  // top level so "Packaging" under Food and "Food Packaging" under Supplies are never confused.
  const categories = series((line) => {
    const p = spend(line); if (!p) return null;
    const top = p === "none" ? "" : p.level1_category || "", sub = p === "none" ? "" : p.level2_category || "";
    const name = !top ? "Uncategorized" : sub ? sub : `${top} (other)`;
    return { id: `${top}/${sub}`, name };
  }, 6);
  categories.forEach((c) => { const [top] = c.id.split("/"); c.group = top || undefined; });

  // The five items with the most spend over the 12 months, month by month.
  const items = series((line) => { const p = spend(line); return p && p !== "none" ? { id: p.id, name: p.internal_product_name } : null; }, 5);

  // Suppliers from invoice totals (as on the Overview), top 5 over the 12 months.
  const supplierMap = new Map<string, TrendSeries>();
  months.forEach((m, i) => (inMonth.get(m) ?? []).forEach((row) => {
    const s = supplierMap.get(row.supplier_id) ?? { id: row.supplier_id, name: input.supplierNames.get(row.supplier_id) ?? "Unknown supplier", total: 0, months: months.map(() => null) };
    s.months[i] = (s.months[i] ?? 0) + Number(row.total_amount);
    s.total += Number(row.total_amount);
    supplierMap.set(row.supplier_id, s);
  }));
  const suppliers = [...supplierMap.values()].sort((a, b) => b.total - a.total).slice(0, 5);

  return { months, monthly, categories, items, suppliers };
}
