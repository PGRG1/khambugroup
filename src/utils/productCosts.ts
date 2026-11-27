// Products list: cost per stock unit after a supplier's live deal, and which supplier is cheapest.
// Pure rules, used by Settings › Products (ProductMasterTab).

export type CostDeal = {
  deal_type: string;
  buy_qty?: number | null;
  free_qty?: number | null;
  discount_percent?: number | null;
  special_price?: number | null;
};

export type CostLine = {
  purchase_unit?: string | null;
  purchase_unit_cost: number;
  stock_qty?: number | null;
  stock_uom?: string | null;
};

/** Price per stock unit after the deal, or null when the pack (purchase unit, stock unit, how many) or price is missing. */
export function costAfterDeal(line: CostLine, deal?: CostDeal | null): number | null {
  const price = Number(line.purchase_unit_cost) || 0;
  const qty = Number(line.stock_qty) || 0;
  if (price <= 0 || qty <= 0 || !line.purchase_unit?.trim() || !line.stock_uom?.trim()) return null;
  let packPrice = price;
  if (deal) {
    if (deal.deal_type === "discount") {
      if (deal.special_price != null && Number(deal.special_price) > 0) packPrice = Number(deal.special_price);
      else packPrice = price * (1 - Math.min(100, Math.max(0, Number(deal.discount_percent) || 0)) / 100);
    } else if (deal.deal_type === "buy_x_get_y_free") {
      const buy = Number(deal.buy_qty) || 0, free = Number(deal.free_qty) || 0;
      if (buy > 0 && free > 0) packPrice = (price * buy) / (buy + free);
    }
  }
  return packPrice / qty;
}

/** Index of the cheapest line, only when at least two lines have a cost in the same stock unit. */
export function cheapestIndex(lines: { cost: number | null; stock_uom?: string | null }[]): number | null {
  const known = lines.map((l, i) => ({ ...l, i })).filter((l) => l.cost != null);
  if (known.length < 2) return null;
  const unit = (u?: string | null) => (u ?? "").trim().toLowerCase();
  const first = unit(known[0].stock_uom);
  if (known.some((l) => unit(l.stock_uom) !== first)) return null;
  let best = known[0];
  for (const l of known) if ((l.cost as number) < (best.cost as number)) best = l;
  // A tie is not a cheapest.
  if (known.filter((l) => l.cost === best.cost).length > 1) return null;
  return best.i;
}
