// Onboarding: read every line a client's sales report prints, so the Bani team can map each
// one once. Pure (no Deno or network), so it can be tested directly.

export const LINE_KINDS = [
  "total", "subtotal", "guests", "orders", "service_charge", "discount", "tip",
  "sales", "payment", "delivery", "voucher_sold", "voucher_used", "deposit_taken", "deposit_used", "ignore",
] as const;
export type LineKind = typeof LINE_KINDS[number];
export const CATEGORIES = ["food", "bev_alc", "bev_non", "dessert", "other"] as const;
export type Category = typeof CATEGORIES[number];

export interface DiscoveredLine {
  printed: string;
  amount: number | null;
  kind: LineKind;
  category: Category | null;
  settlesTo: "bank" | "cash" | null;
}
export interface DiscoveredReport { date: string | null; venue: string; lines: DiscoveredLine[] }

export const DISCOVER_PROMPT = `You read one restaurant daily sales report (a POS Z report or end-of-day summary) for onboarding.
List EVERY line that carries an amount or a count, in the order printed. Return ONLY JSON:
{"date":"YYYY-MM-DD or null (the business day; for a From/To range use From)","venue":"as printed or \\"\\"",
 "lines":[{"printed":"line label in English, as printed (translate non-English)","amount":number or null,
   "kind":"one of ${LINE_KINDS.join("|")}","category":"for kind sales only: ${CATEGORIES.join("|")}","settlesTo":"for kind payment only: bank|cash"}]}
Kinds:
- total: the sales total that payments should add up to (net sales / total sales / grand total)
- subtotal: sales before service charge
- guests: covers / pax / guests (a count); orders: checks / tickets / bills (a count)
- service_charge, discount (any discount, comp or promotion line), tip (card tips, gratuity)
- sales: a sales group or category total (Food, Beverage, Wine, Dessert...). Use group totals, never individual menu items.
  category: food; bev_alc (wine, beer, spirits, cocktails); bev_non (soft drinks, coffee, tea, juice); dessert; other
- payment: a tender (cash, cards, Octopus, FPS, Alipay, WeChat Pay, PayMe...). settlesTo cash for cash, otherwise bank
- delivery: a delivery platform tender (Foodpanda, Deliveroo, Keeta, Uber Eats...)
- voucher_sold / voucher_used / deposit_taken / deposit_used: gift cards, vouchers and deposits
- ignore: anything else with a number (tax notes, rounding, void counts, report numbers)
Rules: amounts are plain numbers with the printed sign, no currency symbols. Missing is null, never 0 unless printed.
Never invent lines or totals. Skip headers, addresses, times, staff names and registration numbers.`;

const money = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const text = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f`]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** Validate the model's answer: unknown kinds are ignored lines, never guessed into sales or payments. */
export function normalizeDiscovered(raw: unknown): DiscoveredReport {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const date = typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null;
  const seen = new Set<string>();
  const lines: DiscoveredLine[] = [];
  for (const item of Array.isArray(r.lines) ? r.lines.slice(0, 120) : []) {
    const l = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const printed = text(l.printed, 120);
    const key = printed.toLowerCase();
    if (!printed || seen.has(key)) continue;
    seen.add(key);
    const kind = (LINE_KINDS as readonly string[]).includes(String(l.kind)) ? l.kind as LineKind : "ignore";
    const category = kind === "sales"
      ? ((CATEGORIES as readonly string[]).includes(String(l.category)) ? l.category as Category : "other")
      : null;
    const settlesTo = kind === "payment" ? (l.settlesTo === "cash" ? "cash" : "bank") : null;
    lines.push({ printed, amount: money(l.amount), kind, category, settlesTo });
    if (lines.length >= 80) break;
  }
  return { date, venue: text(r.venue, 120), lines };
}
