/** What an Items Master row still needs before invoices can match and book it. Only these count as "needs setup". */
export type NeedsInput = {
  supplier?: string | null; external_sku?: string | null; supplier_product_name?: string | null;
  level1_category?: string | null; financial_treatment?: string | null; has_account: boolean;
  purchase_unit?: string | null; purchase_unit_cost?: number | null;
  creates_stock_movement?: boolean | null; stock_uom?: string | null; stock_qty?: number | null;
  status?: string | null;
};
const blank = (v?: string | null) => !v || !String(v).trim();

export function productNeeds(r: NeedsInput): string[] {
  if ((r.status || "Active") !== "Active") return [];
  const n: string[] = [];
  if (blank(r.supplier)) n.push("No supplier");
  else if (blank(r.external_sku) && blank(r.supplier_product_name)) n.push("No supplier code");
  if (blank(r.level1_category)) n.push("No category");
  else if (blank(r.financial_treatment)) n.push("No group");
  else if (!r.has_account) n.push("No account");
  if (blank(r.purchase_unit)) n.push("No unit");
  if ((r.creates_stock_movement ?? true) && (blank(r.stock_uom) || !(Number(r.stock_qty) > 0))) n.push("No stock unit");
  if (!(Number(r.purchase_unit_cost) > 0)) n.push("No price");
  return n;
}

/** "No unit · no price": first word capitalised, the rest lower-case. */
export const needsText = (n: string[]) => n.map((s, i) => (i ? s.charAt(0).toLowerCase() + s.slice(1) : s)).join(" · ");

/** "Case of 12 Carton", "Bag", or "" when unknown. */
export function boughtAs(purchaseUnit?: string | null, stockQty?: number | null, stockUnit?: string | null): string {
  const pu = (purchaseUnit || "").trim();
  if (!pu) return "";
  const q = Number(stockQty);
  const su = (stockUnit || "").trim();
  if (q > 0 && q !== 1 && su && su.toLowerCase() !== pu.toLowerCase()) return `${pu} of ${Math.round(q * 1000) / 1000} ${su}`;
  return pu;
}
