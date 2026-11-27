// Settings › Accounting › Card processors: card fee rates shown as one simple table per processor
// (card or wallet · Hong Kong cards · foreign cards), and the writes needed to save an edited table.
// Pure rules; the page does the database calls.

export type FeeRate = {
  id: string; processor_id: string; payment_method: string; locality: string;
  merchant_number: string | null; wallet_type: string | null; rate: number; effective_from?: string | null;
};

/** Cards have a Hong Kong and a foreign rate; wallets have one rate for any card. */
export const CARDS: { key: string; label: string; wallet?: boolean }[] = [
  { key: "visa", label: "Visa" }, { key: "mastercard", label: "Mastercard" }, { key: "amex", label: "Amex" },
  { key: "union_pay", label: "UnionPay" }, { key: "UnionPay QuickPass", label: "UnionPay QuickPass" }, { key: "jcb", label: "JCB" },
  { key: "alipay", label: "Alipay", wallet: true }, { key: "wechat", label: "WeChat Pay", wallet: true }, { key: "payme", label: "PayMe", wallet: true },
];
const LABEL = new Map(CARDS.map((c) => [c.key, c.label]));
const WALLET = new Set(CARDS.filter((c) => c.wallet).map((c) => c.key));
const base = (m: string) => m.replace(/_foreign$/, "");
const isForeign = (r: FeeRate) => /_foreign$/.test(r.payment_method) || r.locality === "foreign";

export type FeeRow = {
  key: string; card: string; label: string; merchant: string | null; merchantLabel: string | null; wallet: boolean;
  hk: { id: string; rate: number } | null; foreign: { id: string; rate: number } | null;
};

/** One row per card (and per merchant when a merchant has its own rate), in the CARDS order. */
export function feeRows(rates: FeeRate[], merchantName: (n: string) => string | null, today: string): FeeRow[] {
  // Only the rate in force today counts when a card has dated changes.
  const live = new Map<string, FeeRate>();
  for (const r of rates) {
    if (r.wallet_type) continue; // wallet-region rates are kept as they are
    if (r.effective_from && r.effective_from > today) continue;
    const k = `${base(r.payment_method)}|${r.merchant_number ?? ""}|${isForeign(r) ? "f" : "h"}`;
    const was = live.get(k);
    if (!was || (r.effective_from ?? "") >= (was.effective_from ?? "")) live.set(k, r);
  }
  const rows = new Map<string, FeeRow>();
  for (const [k, r] of live) {
    const [card, merchant, side] = k.split("|");
    const rk = `${card}|${merchant}`;
    const row = rows.get(rk) ?? { key: rk, card, label: LABEL.get(card) ?? card, merchant: merchant || null, merchantLabel: merchant ? merchantName(merchant) ?? merchant : null, wallet: WALLET.has(card), hk: null, foreign: null };
    if (side === "f" && !row.wallet) row.foreign = { id: r.id, rate: Number(r.rate) }; else row.hk = { id: r.id, rate: Number(r.rate) };
    rows.set(rk, row);
  }
  const order = (c: string) => { const i = CARDS.findIndex((x) => x.key === c); return i < 0 ? 99 : i; };
  return [...rows.values()].sort((a, b) => order(a.card) - order(b.card) || (a.merchant ? 1 : 0) - (b.merchant ? 1 : 0) || a.label.localeCompare(b.label));
}

export const pct = (r: number) => `${(r * 100).toFixed(2)}%`;

/** Typed text like "1.5" or "1.5%" → 0.015; blank → null; anything else → NaN. */
export function readPct(text: string): number | null {
  const t = text.trim().replace(/%$/, "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n < 100 ? Math.round(n * 1000) / 100000 : NaN;
}

export type FeeWrite =
  | { op: "update"; id: string; rate: number }
  | { op: "delete"; id: string }
  | { op: "insert"; row: { processor_id: string; payment_method: string; locality: string; merchant_number: string | null; rate: number } };

/** Compare the edited table with what is saved: change, remove or add only the cells that differ. */
export function feeWrites(processorId: string, rows: FeeRow[], edits: Record<string, { hk: string; foreign: string }>): { writes: FeeWrite[]; bad: string[] } {
  const writes: FeeWrite[] = [], bad: string[] = [];
  for (const row of rows) {
    const e = edits[row.key]; if (!e) continue;
    const sides: ["hk" | "foreign", string][] = row.wallet ? [["hk", e.hk]] : [["hk", e.hk], ["foreign", e.foreign]];
    for (const [side, text] of sides) {
      const v = readPct(text), was = row[side];
      if (Number.isNaN(v)) { bad.push(`${row.label}${row.merchantLabel ? ` · ${row.merchantLabel}` : ""}`); continue; }
      if (v == null) { if (was) writes.push({ op: "delete", id: was.id }); continue; }
      if (was) { if (Math.abs(was.rate - v) > 1e-9) writes.push({ op: "update", id: was.id, rate: v }); continue; }
      writes.push({ op: "insert", row: { processor_id: processorId, payment_method: side === "foreign" ? `${row.card}_foreign` : row.card, locality: row.wallet ? "any" : side === "foreign" ? "foreign" : "domestic", merchant_number: row.merchant, rate: v } });
    }
  }
  return { writes, bad: [...new Set(bad)] };
}
