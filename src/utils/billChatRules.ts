// Pure rules for booking an expense bill in Floating Bani chat (BillHost). No reads or writes here.

export type SplitPart = { venue: string; kind: "amount" | "percent" | "rest" | "equal"; value: number | null };
export type VenueShare = { venue: string; amount: number };

const cents = (n: number) => Math.round(n * 100);

/** Each venue's share of the bill, adding to the total to the cent; any rounding cent goes on the last venue. */
export function splitAmounts(total: number, parts: SplitPart[]): { shares: VenueShare[] } | { problem: string } {
  const T = cents(total);
  if (!parts.length) return { problem: "No venues given" };
  if (new Set(parts.map(p => p.venue)).size !== parts.length) return { problem: "A venue is named twice" };
  const out = parts.map(p => ({ venue: p.venue, c: 0 }));
  let fixed = 0;
  parts.forEach((p, i) => {
    if (p.kind === "amount") out[i].c = cents(Number(p.value) || 0);
    if (p.kind === "percent") out[i].c = Math.round(T * (Number(p.value) || 0) / 100);
    if (p.kind === "amount" || p.kind === "percent") fixed += out[i].c;
  });
  if (parts.some(p => (p.kind === "amount" || p.kind === "percent") && !(Number(p.value) > 0))) return { problem: "A share has no amount" };
  const open = parts.map((p, i) => (p.kind === "rest" || p.kind === "equal" ? i : -1)).filter(i => i >= 0);
  const left = T - fixed;
  if (open.length) {
    if (left <= 0) return { problem: "Nothing is left for the rest" };
    const each = Math.floor(left / open.length);
    open.forEach(i => { out[i].c = each; });
    out[open[open.length - 1]].c += left - each * open.length;
  } else if (left !== 0) {
    // Percent rounding only: up to one cent per venue goes on the last one.
    if (Math.abs(left) > parts.length || !parts.some(p => p.kind === "percent")) return { problem: `That adds to ${(fixed / 100).toFixed(2)}, not ${(T / 100).toFixed(2)}` };
    out[out.length - 1].c += left;
  }
  if (out.some(o => o.c <= 0)) return { problem: "A venue would pay nothing" };
  return { shares: out.map(o => ({ venue: o.venue, amount: o.c / 100 })) };
}

const SHARED = /\b(rent|rental|landlord|management fee|building|floor|estate|property|utilit|electric|power|water|gas|towngas|clp|hk electric|sewage|rates|government rent)/i;
const HEAD_OFFICE = /head office|headquarters|\bhq\b|corporate office/i;

/** Could this bill be shared between venues? A printed venue never settles it on its own. */
export function billMayBeShared(b: { vendor: string; categories: string[]; address?: string | null; venueKnown: boolean; meterCovers?: number }): boolean {
  if ((b.meterCovers ?? 0) > 0) return false; // the meter account already says who pays
  if (!b.venueKnown) return true;
  if (HEAD_OFFICE.test(b.address || "")) return true;
  return SHARED.test(b.vendor) || b.categories.some(c => SHARED.test(c));
}

const ASSET = /equipment|furniture|fixture|computer|laptop|server|printer|appliance|fridge|freezer|refrigerat|oven|stove|range|dishwasher|ice machine|coffee machine|espresso|pos terminal|fixed asset|capital/i;

/** One line that is clearly something kept for years. */
export function looksLikeEquipment(lines: { category: string; notes?: string | null; accountName?: string }[]): boolean {
  return lines.length === 1 && ASSET.test(`${lines[0].category} ${lines[0].notes ?? ""} ${lines[0].accountName ?? ""}`);
}

export const isYes = (t: string) => /^\s*(y|yes|yep|yeah|yup|ok|okay|sure|right|correct|that'?s right|looks good|go|go ahead|book it|do it|confirm(ed)?|👍)[\s.!]*$/i.test(t);
export const isNo = (t: string) => /^\s*(n|no|nope|nah|not really)[\s.!]*$/i.test(t);

/** "5 years", "18 months", "3" (years). 0 = not equipment; null = didn't understand. */
export function usefulLifeMonths(t: string): number | null {
  if (isNo(t) || /not (equipment|an asset)|just an expense|use(d)? up/i.test(t)) return 0;
  const m = t.match(/(\d+(?:\.\d+)?)\s*(years?|yrs?|y|months?|mos?|m)?\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  const months = /^m/i.test(m[2] || "") ? Math.round(n) : Math.round(n * 12);
  return months >= 2 && months <= 600 ? months : null;
}

/** Month the bill records to, e.g. "Nov". */
export const recordMonth = (date: string) => new Date(`${date.slice(0, 7)}-01T00:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" });

/** Undo is offered only while nothing is paid and the month is still open. */
export const canUndoBill = (b: { paid_amount?: number | null; payment_status?: string | null; approval_status?: string | null }, monthClosed: boolean) =>
  !monthClosed && Number(b.paid_amount || 0) === 0 && (b.payment_status ?? "unpaid") === "unpaid" && !["void", "reversed"].includes(b.approval_status ?? "");
