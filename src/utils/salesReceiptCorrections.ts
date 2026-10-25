/**
 * Spoken/typed corrections to an UNSAVED sales receipt draft.
 * Bani only proposes; this pure helper applies a server-validated proposal
 * locally with the same rules as manual editing. Nothing is saved here.
 */
import { format, parseISO } from "date-fns";
import type { SalesRecord } from "@/types/sales";

export const SALES_NUMBER_FIELDS = [
  "orders", "guests", "subtotal", "serviceCharge", "discount", "totalSales",
  "visa", "mastercard", "amex", "unionPay", "jcb", "alipay", "wechat", "payme", "cash", "cardTips",
] as const;
export const SALES_TEXT_FIELDS = ["date", "venue", "reportNumber"] as const;
export type SalesField = (typeof SALES_NUMBER_FIELDS)[number] | (typeof SALES_TEXT_FIELDS)[number];
export type SalesChange = { field: SalesField; value: string | number };

const isNumberField = (f: string): f is (typeof SALES_NUMBER_FIELDS)[number] =>
  (SALES_NUMBER_FIELDS as readonly string[]).includes(f);

/** Validates untrusted changes; returns null if any change is unsafe. */
export function sanitizeSalesChanges(raw: unknown, venues: string[]): SalesChange[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 12) return null;
  const out: SalesChange[] = [];
  for (const c of raw) {
    const field = (c as { field?: unknown })?.field;
    const value = (c as { value?: unknown })?.value;
    if (typeof field !== "string") return null;
    if (isNumberField(field)) {
      const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[,\s]|HK\$/gi, ""));
      if (!Number.isFinite(n) || Math.abs(n) > 100_000_000) return null;
      if ((field === "orders" || field === "guests") && (n < 0 || !Number.isInteger(n))) return null;
      out.push({ field, value: Math.round(n * 100) / 100 });
    } else if (field === "date") {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) return null;
      out.push({ field, value });
    } else if (field === "venue") {
      const match = venues.find((v) => v.toLowerCase() === String(value ?? "").trim().toLowerCase());
      if (!match) return null;
      out.push({ field, value: match });
    } else if (field === "reportNumber") {
      const s = String(value ?? "").trim();
      if (s.length > 60) return null;
      out.push({ field, value: s });
    } else return null;
  }
  return out;
}

/** Applies changes with manual-edit rules: discounts/tips negative, total recomputed, day from date. */
export function applySalesChanges(record: SalesRecord, changes: SalesChange[]): SalesRecord {
  let next = { ...record };
  let totalTouched = false, totalInputs = false;
  for (const { field, value } of changes) {
    if (isNumberField(field)) {
      let n = Number(value) || 0;
      if (field === "discount" || field === "cardTips") n = -Math.abs(n);
      next = { ...next, [field]: n };
      if (field === "totalSales") totalTouched = true;
      if (field === "subtotal" || field === "serviceCharge" || field === "discount") totalInputs = true;
    } else if (field === "date") {
      let day = "";
      try { day = format(parseISO(String(value)), "EEE"); } catch { day = ""; }
      next = { ...next, date: String(value), day };
    } else {
      next = { ...next, [field]: String(value) };
    }
  }
  if (totalInputs && !totalTouched) {
    next = { ...next, totalSales: Math.round((next.subtotal + next.serviceCharge - Math.abs(next.discount)) * 100) / 100 };
  }
  return next;
}

/** Deterministic post-scan check of a sales receipt draft — what Bani says right after a scan. */
export function auditSalesRecord(r: SalesRecord, venues: string[]): { ok: boolean; message: string } {
  const money = (n: number) => `HK$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const issues: string[] = [];
  if (!r.date) issues.push("the date is missing");
  if (!r.venue || !venues.some(v => v.toLowerCase() === r.venue.toLowerCase())) issues.push(r.venue ? `"${r.venue}" isn't one of your venues` : "the venue is missing");
  const expected = Math.round((r.subtotal + r.serviceCharge + r.discount) * 100) / 100;
  if (Math.abs(expected - r.totalSales) > 0.01) issues.push(`Total Sales is ${money(r.totalSales)} but subtotal + service charge − discount gives ${money(expected)}`);
  const paid = Math.round((r.visa + r.mastercard + r.amex + r.unionPay + r.jcb + r.alipay + r.wechat + r.payme + r.cash + (r.cardTips ?? 0)) * 100) / 100;
  const gap = Math.round((r.totalSales - paid) * 100) / 100;
  if (Math.abs(gap) > 0.01) issues.push(`payments add up to ${money(paid)}, ${money(Math.abs(gap))} ${gap > 0 ? "short of" : "more than"} Total Sales`);
  if (r.totalSales > 0 && r.guests === 0) issues.push("guests is 0");
  if (!issues.length) return { ok: true, message: `Everything looks good — Total Sales ${money(r.totalSales)} and the payments balance exactly. Check it over and press Save when ready.` };
  return { ok: false, message: `I checked this receipt and found ${issues.length === 1 ? "one thing" : `${issues.length} things`} to look at:\n- ${issues.join("\n- ")}\n\nTell me what's right (e.g. "the rest is Visa") and I'll suggest the fix.` };
}
