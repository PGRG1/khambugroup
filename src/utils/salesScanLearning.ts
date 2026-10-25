import type { SalesRecord } from "@/types/sales";
import { getPaymentTotal } from "@/utils/salesUtils";

export const LEARNABLE_FIELDS = [
  "orders", "guests", "subtotal", "serviceCharge", "discount", "totalSales",
  "visa", "mastercard", "amex", "unionPay", "jcb", "alipay", "wechat", "payme", "cash", "cardTips",
] as const;
export type LearnableField = (typeof LEARNABLE_FIELDS)[number];

const PAYMENT_FIELDS = ["visa", "mastercard", "amex", "unionPay", "jcb", "alipay", "wechat", "payme", "cash"] as const;

export const FIELD_LABELS: Record<LearnableField, string> = {
  orders: "Orders", guests: "Guests", subtotal: "Subtotal", serviceCharge: "Service Charge",
  discount: "Discount", totalSales: "Total Sales", visa: "VISA", mastercard: "Mastercard",
  amex: "AMEX", unionPay: "Union Pay", jcb: "JCB", alipay: "Alipay", wechat: "WeChat",
  payme: "PayMe", cash: "Cash", cardTips: "Card Tips",
};

export const hkd = (n: number) =>
  `HK$ ${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const EPS = 0.01;
const same = (a: number, b: number) => Math.abs(a - b) <= EPS;

export type ScanDiagnosis = {
  balanced: boolean;
  /** One plain-English sentence; empty when balanced. */
  message: string;
  /** Fields worth looking at first. */
  fields: LearnableField[];
};

/** Plain-English verdict on a scanned day, pointing at the most likely field. */
export function diagnoseSalesScan(r: SalesRecord): ScanDiagnosis {
  const expectedTotal = r.subtotal + r.serviceCharge - Math.abs(r.discount);
  if (!same(expectedTotal, r.totalSales)) {
    return {
      balanced: false,
      message: `Subtotal + Service Charge − Discount gives ${hkd(expectedTotal)}, but the slip's Total Sales is ${hkd(r.totalSales)}. Check those three lines against the slip.`,
      fields: ["subtotal", "serviceCharge", "discount"],
    };
  }
  const payments = getPaymentTotal(r);
  const gap = r.totalSales - payments; // >0 payments short, <0 payments over
  if (same(gap, 0)) return { balanced: true, message: "", fields: [] };

  const amount = Math.abs(gap);
  const tips = Math.abs(r.cardTips || 0);
  if (gap < 0 && tips === 0) {
    return {
      balanced: false,
      message: `Payments are ${hkd(amount)} more than Total Sales. That is usually card tips that weren't picked up — enter them under Card Tips.`,
      fields: ["cardTips"],
    };
  }
  if (gap > 0 && tips > 0 && same(tips, amount)) {
    return {
      balanced: false,
      message: `Payments are short by exactly the Card Tips (${hkd(amount)}). The tips may not be included in the card lines on this slip — check Card Tips.`,
      fields: ["cardTips"],
    };
  }
  const match = PAYMENT_FIELDS.find((f) => r[f] === 0 && gap > 0) && PAYMENT_FIELDS.find((f) => same(r[f], amount));
  if (match) {
    return {
      balanced: false,
      message: `Payments are ${gap > 0 ? "short" : "over"} by ${hkd(amount)}, the same as ${FIELD_LABELS[match]}. That line may be ${gap > 0 ? "missing a second entry" : "counted twice"}.`,
      fields: [match],
    };
  }
  return {
    balanced: false,
    message: `Payments are ${gap > 0 ? "short" : "over"} by ${hkd(amount)} against Total Sales. Cash is the most common cause — check it first, then the card lines.`,
    fields: ["cash"],
  };
}

export type ScanCorrection = { field: LearnableField; scanned: number; saved: number };
export type ScanLearning = {
  venue: string;
  scannedVenue: string;
  corrections: ScanCorrection[];
};

/** What the person changed between the reader's output and the saved record. */
export function collectScanLearning(scanned: SalesRecord, saved: SalesRecord, scannedVenue: string): ScanLearning | null {
  const corrections: ScanCorrection[] = [];
  for (const f of LEARNABLE_FIELDS) {
    // Total Sales is recomputed from its inputs, so it carries no extra signal.
    if (f === "totalSales") continue;
    const a = Number(scanned[f]) || 0;
    const b = Number(saved[f]) || 0;
    if (!same(a, b)) corrections.push({ field: f, scanned: a, saved: b });
  }
  const printed = scannedVenue.trim();
  const venueLearned = !!saved.venue && !!printed && printed.toLowerCase() !== saved.venue.toLowerCase();
  if (!corrections.length && !venueLearned) return null;
  return { venue: saved.venue, scannedVenue: venueLearned ? printed : "", corrections: corrections.slice(0, 16) };
}
