import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { SalesLine, SalesRecord } from "@/types/sales";
import { matchVenueName } from "@/utils/venueMatch";

export const emptySalesRecord: SalesRecord = {
  date: "", day: "", venue: "", reportNumber: "",
  orders: 0, guests: 0, subtotal: 0, serviceCharge: 0, discount: 0, totalSales: 0,
  visa: 0, mastercard: 0, amex: 0, unionPay: 0, jcb: 0, alipay: 0, wechat: 0, payme: 0, cash: 0, deliveroo: 0, foodpanda: 0, keeta: 0, cardTips: 0,
};

/** Reads any file (image or PDF) into raw base64 without relying on data-URL prefixes. */
export const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === "string" ? reader.result : "";
    resolve(result.slice(result.indexOf(",") + 1));
  };
  reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
  reader.onabort = () => reject(new Error("File reading was cancelled"));
  reader.readAsDataURL(file);
});

export const guessMimeType = (file: File): string => {
  if (file.type) return file.type;
  const ext = file.name.toLowerCase().split(".").pop() || "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "heic" || ext === "heif") return "image/heic";
  return "image/jpeg";
};

/** The reader's raw output as a sales record. The venue is matched against the master only, never reassigned. */
export function salesRecordFromScan(raw: Record<string, any>, venueNames: string[]): SalesRecord {
  const dateStr = String(raw.date || "");
  let dayStr = "";
  if (dateStr) { try { dayStr = format(parseISO(dateStr), "EEE"); } catch { dayStr = ""; } }
  const n = (v: unknown) => Number(v) || 0;
  return {
    date: dateStr,
    rawPrintedDate: raw.rawPrintedDate, printedWeekday: raw.printedWeekday, fieldConfidence: raw.fieldConfidence, dateEvidence: raw.dateEvidence,
    day: dayStr,
    venue: matchVenueName(String(raw.venue ?? "").trim(), venueNames), // blank forces the user to pick if no match
    reportNumber: raw.reportNumber || "",
    orders: n(raw.orders), guests: n(raw.guests), subtotal: n(raw.subtotal), serviceCharge: n(raw.serviceCharge),
    discount: -(Math.abs(n(raw.discount))), totalSales: n(raw.totalSales),
    vouchersSold: n(raw.vouchersSold), depositsTaken: n(raw.depositsTaken), vouchersUsed: n(raw.vouchersUsed), depositsUsed: n(raw.depositsUsed),
    visa: n(raw.visa), mastercard: n(raw.mastercard), amex: n(raw.amex), unionPay: n(raw.unionPay), jcb: n(raw.jcb),
    alipay: n(raw.alipay), wechat: n(raw.wechat), payme: n(raw.payme), cash: n(raw.cash),
    deliveroo: n(raw.deliveroo), foodpanda: n(raw.foodpanda), keeta: n(raw.keeta),
    cardTips: -(Math.abs(n(raw.cardTips))),
    // Clients read line by line: their own lines, with the day's usual figures worked out from them.
    ...(raw.mode === "lines" && Array.isArray(raw.lines) ? { lines: raw.lines as SalesLine[] } : {}),
  };
}

export type SalesReceiptRead = { ok: true; record: SalesRecord; scanId: string | null } | { ok: false; error: string };

/** One read of a sales receipt through parse-receipt, for the active tenant. Nothing is saved. */
export async function readSalesReceipt(file: File, venueNames: string[], tenantId: string): Promise<SalesReceiptRead> {
  try {
    const base64 = await fileToBase64(file);
    if (!base64) return { ok: false, error: "The file appears to be empty" };
    const { data, error } = await supabase.functions.invoke("parse-receipt", {
      body: { imageBase64: base64, mimeType: guessMimeType(file), fileName: file.name, venues: venueNames, tenantId },
    });
    if (error) return { ok: false, error: error.message };
    if (!data?.success || !data.data) return { ok: false, error: data?.error || "Could not extract data" };
    return { ok: true, record: salesRecordFromScan(data.data, venueNames), scanId: typeof data.scanEvidenceId === "string" ? data.scanEvidenceId : null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the receipt" };
  }
}
