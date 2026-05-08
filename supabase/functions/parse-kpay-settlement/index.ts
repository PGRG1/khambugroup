// Parse a KPay monthly settlement XLSX (or PDF via AI fallback).
// Input JSON: { import_id }
// Output: { batches: [...], unknown_merchants: [...] }
// No DB writes; the client confirms then commits.

import * as XLSX from "npm:xlsx@0.18.5";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ---------- Helpers ----------
const toNum = (v: any): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[,\s]/g, "").replace(/[^\d.\-]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

const toDate = (v: any): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial date
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // Try YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  // DD-MM-YYYY
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // ISO datetime
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
};

const norm = (v: any) => String(v ?? "").trim().toLowerCase();

// Map a payment-type label from KPay to a canonical key
const PAYMENT_TYPE_MAP: Record<string, string> = {
  visa: "visa",
  mastercard: "mastercard",
  master: "mastercard",
  amex: "amex",
  "american express": "amex",
  unionpay: "union_pay",
  "union pay": "union_pay",
  "china unionpay": "union_pay",
  jcb: "jcb",
  alipay: "alipay",
  "alipay hk": "alipay",
  "alipay cn": "alipay",
  wechat: "wechat",
  "wechat pay": "wechat",
  "weixin pay": "wechat",
  payme: "payme",
  "payme from hsbc": "payme",
  fps: "fps",
};
const mapPaymentType = (label: string) => {
  const k = norm(label);
  for (const [needle, canonical] of Object.entries(PAYMENT_TYPE_MAP)) {
    if (k.includes(needle)) return canonical;
  }
  return k.replace(/\s+/g, "_") || "other";
};

// Extract every row of every sheet into a flat array of cell rows
function readAllRows(wb: XLSX.WorkBook): { sheet: string; rows: any[][] }[] {
  return wb.SheetNames.map((s) => ({
    sheet: s,
    rows: XLSX.utils.sheet_to_json<any[]>(wb.Sheets[s], { header: 1, raw: true, defval: null }),
  }));
}

type ParsedBatch = {
  merchant_number: string;
  merchant_label: string;
  transaction_date: string;
  settlement_date: string;
  gross_amount: number;
  fee_amount: number;
  points_offset: number;
  bank_transfer_fee: number;
  adjustments: number;
  frozen_amount: number;
  net_settlement: number;
  count: number;
  lines: { payment_type: string; payment_type_label: string; count: number; gross_amount: number; fee_amount: number; net_amount: number }[];
};

// ---------- Core parser (KPay Monthly Settlement Report) ----------
// Sheet "Monthly Settlement Report" → "Transaction settled" section gives one row per batch.
// Sheet "Settlement details" gives per-transaction rows; aggregate by (merchant, txn date, payment method) → lines.
function parseKPayWorkbook(wb: XLSX.WorkBook) {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  // ---- 1) Batches from "Monthly Settlement Report" ----
  type RawBatch = ParsedBatch;
  const batchMap = new Map<string, RawBatch>();
  const monthly = wb.Sheets["Monthly Settlement Report"];
  if (monthly) {
    const rows = XLSX.utils.sheet_to_json<any[]>(monthly, { header: 1, raw: true, defval: null });
    // Find the "Transaction settled" header row (the 2nd table)
    let headerRow = -1;
    for (let r = 0; r < rows.length; r++) {
      const joined = (rows[r] || []).map((c) => norm(c)).join("|");
      if (joined.includes("settlement date") && joined.includes("transaction date") && joined.includes("net total settlement")) {
        headerRow = r;
        break;
      }
    }
    if (headerRow >= 0) {
      const header = rows[headerRow];
      const find = (...needles: string[]) => header.findIndex((h: any) => {
        const n = norm(h);
        return n && needles.some((x) => n.includes(x));
      });
      const cStore = find("name of store");
      const cMerch = find("merchant number");
      const cSettleDate = find("settlement date");
      const cTxnDate = find("transaction date");
      const cCount = find("transaction count");
      const cGross = find("transaction amount");
      const cFee = find("transaction fee");
      const cPoints = find("points redeemed");
      const cAdj = find("adjustment amount");
      const cFrozen = find("frozen amount");
      const cSettleFee = find("settlement fee");
      const cNet = find("net total settlement");

      for (let r = headerRow + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        if (row.every((c) => c === null || c === "" || c === undefined)) continue;
        const merchant_number = String(row[cMerch] ?? "").trim();
        const settlement_date = toDate(row[cSettleDate]);
        const transaction_date = toDate(row[cTxnDate]);
        if (!merchant_number || !settlement_date || !transaction_date) continue;
        const key = `${merchant_number}|${settlement_date}|${transaction_date}`;
        batchMap.set(key, {
          merchant_number,
          merchant_label: String(row[cStore] ?? "").trim(),
          transaction_date,
          settlement_date,
          gross_amount: round2(toNum(row[cGross])),
          fee_amount: round2(toNum(row[cFee])),
          points_offset: round2(toNum(row[cPoints])),
          bank_transfer_fee: round2(toNum(row[cSettleFee])),
          adjustments: round2(toNum(row[cAdj])),
          frozen_amount: round2(toNum(row[cFrozen])),
          net_settlement: round2(toNum(row[cNet])),
          count: toNum(row[cCount]),
          lines: [],
        });
      }
    }
  }

  // ---- 2) Lines from "Settlement details" ----
  const details = wb.Sheets["Settlement details"];
  if (details) {
    const rows = XLSX.utils.sheet_to_json<any[]>(details, { header: 1, raw: true, defval: null });
    let headerRow = -1;
    for (let r = 0; r < Math.min(rows.length, 20); r++) {
      const joined = (rows[r] || []).map((c) => norm(c)).join("|");
      if (joined.includes("payment method") && joined.includes("transaction time")) {
        headerRow = r;
        break;
      }
    }
    if (headerRow >= 0) {
      const header = rows[headerRow];
      const find = (...needles: string[]) => header.findIndex((h: any) => {
        const n = norm(h);
        return n && needles.some((x) => n.includes(x));
      });
      const cMerch = find("merchant number");
      const cMethod = find("payment method");
      const cTxnTime = find("transaction time");
      const cAmount = find("local payment amount");
      const cFee = find("transaction fee");
      const cNet = find("settlement amount");

      type Agg = { count: number; gross: number; fee: number; net: number; label: string };
      // key: merchant|txn_date|method
      const agg = new Map<string, Agg>();
      for (let r = headerRow + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        if (row.every((c) => c === null || c === "" || c === undefined)) continue;
        const merchant = String(row[cMerch] ?? "").trim();
        const method = String(row[cMethod] ?? "").trim();
        const t = toDate(row[cTxnTime]);
        if (!merchant || !method || !t) continue;
        const k = `${merchant}|${t}|${method}`;
        let a = agg.get(k);
        if (!a) { a = { count: 0, gross: 0, fee: 0, net: 0, label: method }; agg.set(k, a); }
        a.count += 1;
        a.gross += toNum(row[cAmount]);
        a.fee += toNum(row[cFee]);
        a.net += toNum(row[cNet]);
      }

      // Attach aggregated lines to matching batches (match by merchant + txn date)
      for (const [k, a] of agg) {
        const [merchant, txnDate, method] = k.split("|");
        // Find the batch with this merchant + txn_date (settlement_date may differ)
        const batch = Array.from(batchMap.values()).find(
          (b) => b.merchant_number === merchant && b.transaction_date === txnDate,
        );
        if (!batch) continue;
        batch.lines.push({
          payment_type: mapPaymentType(method),
          payment_type_label: method,
          count: a.count,
          gross_amount: round2(a.gross),
          fee_amount: round2(a.fee),
          net_amount: round2(a.net),
        });
      }
    }
  }

  const batches = Array.from(batchMap.values()).sort(
    (a, b) => a.settlement_date.localeCompare(b.settlement_date) || a.merchant_number.localeCompare(b.merchant_number),
  );
  return { batches };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { import_id } = await req.json().catch(() => ({}));
    if (!import_id) return json({ error: "import_id is required" }, 400);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: imp, error: ie } = await admin
      .from("payment_settlement_imports")
      .select("id, file_url, file_name")
      .eq("id", import_id)
      .single();
    if (ie || !imp) return json({ error: ie?.message || "Import not found" }, 404);
    if (!imp.file_url) return json({ error: "Import has no file" }, 400);

    const dl = await admin.storage.from("payment-statements").download(imp.file_url);
    if (dl.error || !dl.data) return json({ error: dl.error?.message || "Download failed" }, 500);

    const ab = await dl.data.arrayBuffer();
    const lower = (imp.file_name || "").toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls") && !lower.endsWith(".csv")) {
      return json({ error: "Only XLSX/XLS/CSV is supported in this phase. PDF parsing will be added later." }, 400);
    }

    const wb = XLSX.read(new Uint8Array(ab), { type: "array", cellDates: true });
    console.log("Sheets:", wb.SheetNames);
    for (const sn of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sn], { header: 1, raw: true, defval: null });
      console.log(`--- Sheet: ${sn} (${rows.length} rows) ---`);
      console.log(JSON.stringify(rows.slice(0, 40)));
    }
    const { batches } = parseKPayWorkbook(wb);
    console.log("Parsed batches:", batches.length);

    // Look up merchants we know about
    const knownMerchants = await admin
      .from("payment_processor_merchants")
      .select("id, merchant_number, display_name");
    const known = new Set((knownMerchants.data || []).map((m: any) => m.merchant_number));
    const unknown_merchants = Array.from(new Set(batches.map((b) => b.merchant_number).filter((n) => n && !known.has(n))));

    return json({ batches, unknown_merchants, sheets: wb.SheetNames });
  } catch (e: any) {
    console.error("parse-kpay-settlement error:", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }
});
