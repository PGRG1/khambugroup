/**
 * GRN line costing — pure.
 *
 * Free goods (unit price 0 with a positive quantity, or an explicit
 * is_free_unit_line flag) can move stock quantity but must NEVER acquire a
 * purchase cost from the Product Master or any fallback chain.
 */

export interface GrnCostLine {
  quantity?: number | string | null;
  unit_price?: number | string | null;
  net_unit_cost?: number | string | null;
  normalized_unit_cost?: number | string | null;
  accepted_price?: number | string | null;
  total?: number | string | null;
  discount?: number | string | null;
  is_free_unit_line?: boolean | null;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

export function isFreeGoodsLine(line: GrnCostLine): boolean {
  if (line.is_free_unit_line === true) return true;
  return num(line.unit_price) === 0 && num(line.quantity) > 0;
}

/** Unit cost for a GRN item: 0 for free goods, else the existing fallback chain. */
export function resolveGrnUnitCost(line: GrnCostLine): number {
  if (isFreeGoodsLine(line)) return 0;
  const net = num(line.net_unit_cost);
  if (net > 0) return net;
  let cost = num(line.unit_price);
  if (cost === 0) {
    const nuc = num(line.normalized_unit_cost);
    if (nuc > 0) cost = nuc;
  }
  if (cost === 0) {
    const acc = num(line.accepted_price);
    if (acc > 0) cost = acc;
  }
  if (cost === 0) {
    const qty = num(line.quantity);
    const total = num(line.total);
    if (total > 0 && qty > 0) cost = (total + num(line.discount)) / qty;
  }
  return cost;
}

/** Accepted price for a GRN item: 0 for free goods, else accepted price or unit cost. */
export function resolveGrnAcceptedPrice(line: GrnCostLine, unitCost: number): number {
  if (isFreeGoodsLine(line)) return 0;
  const acc = num(line.accepted_price);
  return acc > 0 ? acc : unitCost;
}
