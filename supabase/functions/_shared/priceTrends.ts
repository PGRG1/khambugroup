// Pure like-for-like supplier price trend grouping.
// Groups only by same supplier id + same item identity + compatible unit/pack,
// so a HK$/bottle price is never compared against a HK$/case price.

export type PriceObservation = {
  supplier_id: string | null;
  supplier: string;
  invoice_id: string;
  invoice_number?: string | null;
  date: string;
  description?: string | null;
  item_code?: string | null;
  product_master_id?: string | null;
  unit?: string | null;
  pack_size?: string | null;
  unit_price: number;
};

export type PriceTrend = {
  supplier: string;
  description: string;
  item_code: string;
  unit: string;
  pack_size: string;
  first_date: string;
  first_price: number;
  last_date: string;
  last_price: number;
  change_pct: number;
  direction: "increase" | "decrease";
  observation_count: number;
  evidence: { invoice_id: string; invoice_number: string | null; date: string; unit_price: number }[];
};

export function normalizeUnitToken(unit?: string | null): string {
  return String(unit ?? "").trim().toLowerCase().replace(/[.\s]+/g, "");
}

export function normalizePackToken(pack?: string | null): string {
  return String(pack ?? "").trim().toLowerCase().replace(/\s+/g, "");
}

/** Item identity: product master link wins, else item code, else description text. */
export function itemIdentity(o: PriceObservation): string | null {
  if (o.product_master_id) return `pm:${o.product_master_id}`;
  const code = String(o.item_code ?? "").trim().toLowerCase();
  if (code) return `code:${code}`;
  const desc = String(o.description ?? "").trim().toLowerCase();
  if (desc) return `desc:${desc}`;
  return null;
}

/** Grouping key. Returns null when the row is too ambiguous to compare safely. */
export function priceGroupKey(o: PriceObservation): string | null {
  if (!o.supplier_id) return null;
  const identity = itemIdentity(o);
  if (!identity) return null;
  return [`sup:${o.supplier_id}`, identity, `unit:${normalizeUnitToken(o.unit)}`, `pack:${normalizePackToken(o.pack_size)}`].join("||");
}

export function buildPriceTrends(
  observations: PriceObservation[],
  opts: { minChangePct?: number; limit?: number; maxEvidence?: number } = {},
): { threshold_pct: number; items_changed: number; skipped_ambiguous: number; items: PriceTrend[] } {
  const minPct = opts.minChangePct ?? 5;
  const limit = opts.limit ?? 30;
  const maxEvidence = opts.maxEvidence ?? 6;

  const groups = new Map<string, PriceObservation[]>();
  let skipped = 0;
  for (const o of observations) {
    const price = Number(o.unit_price);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (!o.date) continue;
    const key = priceGroupKey(o);
    if (!key) { skipped += 1; continue; }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ ...o, unit_price: price });
  }

  const trends: PriceTrend[] = [];
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => a.date.localeCompare(b.date));
    const first = arr[0];
    const last = arr[arr.length - 1];
    if (first.unit_price === 0) continue;
    const changePct = +(((last.unit_price - first.unit_price) / first.unit_price) * 100).toFixed(2);
    if (Math.abs(changePct) < minPct) continue;
    trends.push({
      supplier: first.supplier,
      description: first.description ?? "",
      item_code: first.item_code ?? "",
      unit: first.unit ?? "",
      pack_size: first.pack_size ?? "",
      first_date: first.date,
      first_price: +first.unit_price.toFixed(4),
      last_date: last.date,
      last_price: +last.unit_price.toFixed(4),
      change_pct: changePct,
      direction: changePct >= 0 ? "increase" : "decrease",
      observation_count: arr.length,
      evidence: arr.slice(-maxEvidence).map((o) => ({
        invoice_id: o.invoice_id,
        invoice_number: o.invoice_number ?? null,
        date: o.date,
        unit_price: +o.unit_price.toFixed(4),
      })),
    });
  }
  trends.sort((a, b) => Math.abs(b.change_pct) - Math.abs(a.change_pct));
  return {
    threshold_pct: minPct,
    items_changed: trends.length,
    skipped_ambiguous: skipped,
    items: trends.slice(0, limit),
  };
}
