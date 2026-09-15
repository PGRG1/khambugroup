// Supplier price-trend grouping. Pure logic so it can be unit-tested.
// Prices are only ever compared within the SAME supplier, the SAME item
// identity and a COMPATIBLE unit/pack basis. Ambiguous or unlinked lines are
// dropped rather than merged.

export type PriceLine = {
  supplier_id: string | null;
  supplier: string;
  product_master_id?: string | null;
  item_code?: string | null;
  description?: string | null;
  unit?: string | null;
  pack_size?: string | null;
  unit_price: number;
  invoice_id: string;
  invoice_number?: string | null;
  date: string;
};

export type PriceObservation = {
  date: string;
  unit_price: number;
  invoice_id: string;
  invoice_number: string | null;
};

export type PriceTrend = {
  supplier: string;
  supplier_id: string | null;
  item_identity: string;
  description: string | null;
  item_code: string | null;
  product_master_id: string | null;
  unit: string | null;
  pack_size: string | null;
  first_date: string;
  first_price: number;
  last_date: string;
  last_price: number;
  change_pct: number;
  direction: "increase" | "decrease";
  observation_count: number;
  sources: PriceObservation[];
};

/** Case/space/punctuation-insensitive unit or pack token. Empty => null. */
export function normalizeBasis(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim().toLowerCase().replace(/[\s._-]+/g, "");
  return t.length ? t : null;
}

/** Item identity: product link first, then supplier SKU, then description. */
export function itemIdentity(line: PriceLine): { key: string; kind: "product" | "item_code" | "description" } | null {
  if (line.product_master_id) return { key: `pm:${line.product_master_id}`, kind: "product" };
  const code = (line.item_code ?? "").trim();
  if (code) return { key: `code:${code.toLowerCase()}`, kind: "item_code" };
  const desc = (line.description ?? "").trim();
  if (desc) return { key: `desc:${desc.toLowerCase()}`, kind: "description" };
  return null;
}

export function trendGroupKey(line: PriceLine): string | null {
  if (!line.supplier_id) return null;
  const identity = itemIdentity(line);
  if (!identity) return null;
  const unit = normalizeBasis(line.unit);
  const pack = normalizeBasis(line.pack_size);
  // Unit is required: without it we cannot prove two prices are on the same basis.
  if (!unit) return null;
  return `${line.supplier_id}||${identity.key}||${unit}||${pack ?? "nopack"}`;
}

export function buildPriceTrends(
  lines: PriceLine[],
  opts: { min_change_pct?: number; limit?: number } = {},
): { threshold_pct: number; compared_groups: number; skipped_incomparable_lines: number; items_changed: number; items: PriceTrend[] } {
  const minPct = opts.min_change_pct ?? 5;
  const groups = new Map<string, PriceLine[]>();
  let skipped = 0;

  for (const line of lines) {
    if (!(Number(line.unit_price) > 0)) {
      skipped += 1;
      continue;
    }
    const key = trendGroupKey(line);
    if (!key) {
      skipped += 1;
      continue;
    }
    const bucket = groups.get(key);
    if (bucket) bucket.push(line);
    else groups.set(key, [line]);
  }

  const trends: PriceTrend[] = [];
  let compared = 0;
  for (const bucket of groups.values()) {
    if (bucket.length < 2) continue;
    compared += 1;
    const sorted = [...bucket].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const firstPrice = Number(first.unit_price);
    const lastPrice = Number(last.unit_price);
    if (!(firstPrice > 0)) continue;
    const changePct = +(((lastPrice - firstPrice) / firstPrice) * 100).toFixed(2);
    if (Math.abs(changePct) < minPct) continue;
    const identity = itemIdentity(first)!;
    trends.push({
      supplier: first.supplier,
      supplier_id: first.supplier_id,
      item_identity: identity.kind,
      description: first.description ?? null,
      item_code: first.item_code ?? null,
      product_master_id: first.product_master_id ?? null,
      unit: first.unit ?? null,
      pack_size: first.pack_size ?? null,
      first_date: first.date,
      first_price: +firstPrice.toFixed(4),
      last_date: last.date,
      last_price: +lastPrice.toFixed(4),
      change_pct: changePct,
      direction: changePct > 0 ? "increase" : "decrease",
      observation_count: sorted.length,
      sources: sorted.map((l) => ({
        date: l.date,
        unit_price: +Number(l.unit_price).toFixed(4),
        invoice_id: l.invoice_id,
        invoice_number: l.invoice_number ?? null,
      })),
    });
  }

  trends.sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct));
  return {
    threshold_pct: minPct,
    compared_groups: compared,
    skipped_incomparable_lines: skipped,
    items_changed: trends.length,
    items: trends.slice(0, opts.limit ?? 30),
  };
}
