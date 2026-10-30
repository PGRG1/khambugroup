// Pure rules deciding whether a scanned sales receipt may be recorded without a human.
// Arithmetic alone never qualifies: an independent second read of the source must agree.

export const TENDERS = ["visa", "mastercard", "amex", "unionPay", "jcb", "alipay", "wechat", "payme", "cash", "deliveroo", "foodpanda", "keeta", "cardTips"] as const;
const CORE = ["subtotal", "serviceCharge", "discount", "totalSales"] as const;

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const close = (a: number, b: number) => Math.abs(a - b) <= 0.01;

export function hkToday(now = new Date()): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

/** Problems found in the figures themselves (no source needed). */
export function figureProblems(t: Record<string, unknown>, venueValid: boolean, today: string): string[] {
  const p: string[] = [];
  if (!venueValid) p.push("Venue missing or not one of your venues");
  const date = String(t.date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) p.push("Trading date missing or unreadable");
  else if (date > today) p.push("Trading date is in the future");
  else if (Date.parse(date) < Date.parse(today) - 400 * 86400_000) p.push("Trading date is more than a year old");
  const v = (k: string) => num(t[k]) ?? 0;
  if ([...CORE, ...TENDERS].some(k => !Number.isFinite(v(k)))) { p.push("Invalid amounts"); return p; }
  if (v("totalSales") <= 0) p.push("Total sales is zero or negative");
  const disc = -Math.abs(v("discount"));
  if (!close(v("subtotal") + v("serviceCharge") + disc, v("totalSales"))) p.push("Subtotal + service charge + discount does not equal total sales");
  const paid = TENDERS.filter(k => k !== "cardTips").reduce((s, k) => s + v(k), 0);
  if (!close(paid, v("totalSales"))) p.push("Payments do not add up to total sales");
  return p;
}

/** Field-by-field comparison between the saved figures and an independent second read. */
export function verificationMismatches(t: Record<string, unknown>, second: Record<string, unknown> | null): string[] {
  if (!second) return ["Independent check could not read the receipt"];
  const m: string[] = [];
  if (String(second.date ?? "") !== String(t.date ?? "")) m.push(`Date read as ${second.date ?? "unclear"} on the second check`);
  if (second.venue && String(second.venue) !== String(t.venue ?? "")) m.push(`Venue read as ${second.venue} on the second check`);
  for (const k of ["subtotal", "totalSales"]) {
    const s = num(second[k]);
    if (s === null) m.push(`${k} unclear on the second check`);
    else if (!close(s, num(t[k]) ?? 0)) m.push(`${k} read as ${s} on the second check`);
  }
  for (const k of ["serviceCharge", "discount", ...TENDERS]) {
    const s = Math.abs(num(second[k]) ?? 0), f = Math.abs(num(t[k]) ?? 0);
    if (!close(s, f)) m.push(`${k} read as ${s} on the second check`);
  }
  return m;
}
