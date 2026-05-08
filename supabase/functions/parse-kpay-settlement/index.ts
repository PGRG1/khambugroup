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

// ---------- Core parser ----------
function parseKPayWorkbook(wb: XLSX.WorkBook) {
  const sheets = readAllRows(wb);

  // Build a key→column index per row (header detection)
  // Strategy: scan every sheet for header rows that contain common KPay columns.
  // Two record kinds we care about:
  //  - Store-detail row: has txn date + settlement date + payment type + amount/fee/net
  //  - Overview row: has merchant + count + transaction amount + net settlement (no per-payment-type)

  const detailRows: ParsedBatch["lines"][number][] & { _meta?: any }[] = [] as any;
  type Detail = {
    merchant_number: string;
    merchant_label: string;
    transaction_date: string;
    settlement_date: string;
    payment_type_label: string;
    count: number;
    gross_amount: number;
    fee_amount: number;
    net_amount: number;
    points_offset: number;
    bank_transfer_fee: number;
    adjustments: number;
    frozen_amount: number;
  };
  const details: Detail[] = [];

  const findHeader = (rows: any[][]) => {
    for (let r = 0; r < Math.min(rows.length, 60); r++) {
      const row = (rows[r] || []).map((c) => norm(c));
      const joined = row.join("|");
      if (
        joined.includes("payment type") ||
        joined.includes("payment method") ||
        (joined.includes("transaction date") && (joined.includes("settlement date") || joined.includes("settlement"))) ||
        (joined.includes("transaction amount") && joined.includes("net"))
      ) {
        return r;
      }
    }
    return -1;
  };

  const colFinder = (header: any[]) => {
    const idx = (...needles: string[]) => {
      for (let i = 0; i < header.length; i++) {
        const h = norm(header[i]);
        if (!h) continue;
        if (needles.some((n) => h.includes(n))) return i;
      }
      return -1;
    };
    return idx;
  };

  // Track current merchant context as we walk rows (KPay groups "Store: 852... ASSEMBLY")
  let currentMerchantNumber = "";
  let currentMerchantLabel = "";

  const merchantFromRow = (row: any[]): { num: string; label: string } | null => {
    for (const c of row) {
      const s = String(c ?? "");
      const m = s.match(/(\d{15,18})/); // KPay merchant numbers are long
      if (m) {
        return { num: m[1], label: s.replace(m[1], "").replace(/[:：\-]/g, "").trim() || s.trim() };
      }
    }
    // Sometimes label is on its own row right after the number
    return null;
  };

  for (const { rows } of sheets) {
    const headerRow = findHeader(rows);
    const header = headerRow >= 0 ? rows[headerRow] : [];
    const idx = colFinder(header);

    const cTxnDate = idx("transaction date", "txn date");
    const cSettleDate = idx("settlement date", "settle date", "settle on");
    const cPayType = idx("payment type", "payment method", "card type", "type");
    const cCount = idx("count", "transactions", "no. of");
    const cGross = idx("transaction amount", "amount", "gross");
    const cFee = idx("transaction fee", "fee");
    const cPoints = idx("points", "fee offset");
    const cBankFee = idx("bank transfer fee");
    const cAdj = idx("adjustment");
    const cFrozen = idx("frozen");
    const cNet = idx("net settlement", "fund released", "net");

    let mode: "details" | "overview" | "unknown" = "unknown";
    if (cPayType >= 0 && cTxnDate >= 0) mode = "details";
    else if (cNet >= 0 && cGross >= 0) mode = "overview";

    for (let r = headerRow >= 0 ? headerRow + 1 : 0; r < rows.length; r++) {
      const row = rows[r] || [];
      if (row.every((c) => c === null || c === "" || c === undefined)) continue;

      // Update merchant context on rows that contain a long numeric ID
      const m = merchantFromRow(row);
      if (m) {
        currentMerchantNumber = m.num;
        currentMerchantLabel = m.label || currentMerchantLabel;
        continue;
      }

      if (mode === "details" && cTxnDate >= 0 && cPayType >= 0) {
        const t = toDate(row[cTxnDate]);
        const s = cSettleDate >= 0 ? toDate(row[cSettleDate]) : t;
        const pt = String(row[cPayType] ?? "").trim();
        if (!t || !pt) continue;
        // Skip totals
        if (/total|subtotal|sum/i.test(pt)) continue;
        details.push({
          merchant_number: currentMerchantNumber,
          merchant_label: currentMerchantLabel,
          transaction_date: t,
          settlement_date: s || t,
          payment_type_label: pt,
          count: cCount >= 0 ? toNum(row[cCount]) : 0,
          gross_amount: cGross >= 0 ? toNum(row[cGross]) : 0,
          fee_amount: cFee >= 0 ? toNum(row[cFee]) : 0,
          net_amount: cNet >= 0 ? toNum(row[cNet]) : 0,
          points_offset: cPoints >= 0 ? toNum(row[cPoints]) : 0,
          bank_transfer_fee: cBankFee >= 0 ? toNum(row[cBankFee]) : 0,
          adjustments: cAdj >= 0 ? toNum(row[cAdj]) : 0,
          frozen_amount: cFrozen >= 0 ? toNum(row[cFrozen]) : 0,
        });
      }
    }
  }

  // Group details into batches keyed by (merchant, settlement_date, transaction_date)
  const map = new Map<string, ParsedBatch>();
  for (const d of details) {
    const key = `${d.merchant_number}|${d.settlement_date}|${d.transaction_date}`;
    let b = map.get(key);
    if (!b) {
      b = {
        merchant_number: d.merchant_number,
        merchant_label: d.merchant_label,
        transaction_date: d.transaction_date,
        settlement_date: d.settlement_date,
        gross_amount: 0,
        fee_amount: 0,
        points_offset: 0,
        bank_transfer_fee: 0,
        adjustments: 0,
        frozen_amount: 0,
        net_settlement: 0,
        count: 0,
        lines: [],
      };
      map.set(key, b);
    }
    b.gross_amount += d.gross_amount;
    b.fee_amount += d.fee_amount;
    b.points_offset += d.points_offset;
    b.bank_transfer_fee += d.bank_transfer_fee;
    b.adjustments += d.adjustments;
    b.frozen_amount += d.frozen_amount;
    b.net_settlement += d.net_amount;
    b.count += d.count;
    b.lines.push({
      payment_type: mapPaymentType(d.payment_type_label),
      payment_type_label: d.payment_type_label,
      count: d.count,
      gross_amount: d.gross_amount,
      fee_amount: d.fee_amount,
      net_amount: d.net_amount,
    });
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const batches = Array.from(map.values())
    .map((b) => ({
      ...b,
      gross_amount: round2(b.gross_amount),
      fee_amount: round2(b.fee_amount),
      points_offset: round2(b.points_offset),
      bank_transfer_fee: round2(b.bank_transfer_fee),
      adjustments: round2(b.adjustments),
      frozen_amount: round2(b.frozen_amount),
      net_settlement: round2(b.net_settlement),
      lines: b.lines.map((l) => ({
        ...l,
        gross_amount: round2(l.gross_amount),
        fee_amount: round2(l.fee_amount),
        net_amount: round2(l.net_amount),
      })),
    }))
    .sort((a, b) => (a.settlement_date.localeCompare(b.settlement_date) || a.merchant_number.localeCompare(b.merchant_number)));

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
