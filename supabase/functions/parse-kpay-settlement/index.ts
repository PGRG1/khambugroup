// Parse a KPay monthly settlement XLSX, build batches + per-payment-type lines,
// and audit each transaction's fee against the contracted rate sheet stored in DB.
// Optionally calls Gemini to add a one-line narrative for each flagged batch.

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
const round2 = (n: number) => Math.round(n * 100) / 100;
const roundTo = (n: number, dp: number) => {
  const f = Math.pow(10, Math.max(0, dp | 0));
  return Math.round(n * f) / f;
};
const norm = (v: any) => String(v ?? "").trim().toLowerCase();

const toNum = (v: any): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[,\s]/g, "").replace(/[^\d.\-]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

const toDate = (v: any): string | null => {
  const dt = toDateTime(v);
  return dt ? dt.slice(0, 10) : null;
};

const toDateTime = (v: any): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString();
  }
  const s = String(v).trim();
  // YYYY-MM-DD [HH:MM[:SS]]
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T${(m[4] || "00").padStart(2, "0")}:${m[5] || "00"}:${m[6] || "00"}Z`;
    return new Date(iso).toISOString();
  }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T${(m[4] || "00").padStart(2, "0")}:${m[5] || "00"}:${m[6] || "00"}Z`;
    return new Date(iso).toISOString();
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString();
  return null;
};

// Map raw KPay "Payment Method" + "Transaction Locality" → canonical key used by FEE_RATES
function classifyPaymentMethod(rawMethod: string, rawLocality: string): { key: string; locality: "domestic" | "foreign" | "any" | "unknown" } {
  const m = norm(rawMethod);
  const loc = norm(rawLocality);
  const localityKey: "domestic" | "foreign" | "unknown" =
    loc === "domestic" ? "domestic" : loc === "foreign" ? "foreign" : "unknown";

  if (m.includes("visa")) {
    if (m.includes("foreign")) return { key: "visa_foreign", locality: "foreign" };
    return { key: "visa", locality: localityKey === "unknown" ? "domestic" : localityKey };
  }
  if (m.includes("master")) {
    if (m.includes("foreign")) return { key: "mastercard_foreign", locality: "foreign" };
    return { key: "mastercard", locality: localityKey === "unknown" ? "domestic" : localityKey };
  }
  if (m.includes("alipay")) return { key: "alipay", locality: "any" };
  if (m.includes("wechat") || m.includes("weixin")) return { key: "wechat", locality: "any" };
  if (m.includes("unionpay") || m.includes("union pay")) return { key: "union_pay", locality: localityKey === "unknown" ? "domestic" : localityKey };
  if (m.includes("payme")) return { key: "payme", locality: "any" };
  if (m.includes("amex") || m.includes("american express")) {
    if (m.includes("foreign") || localityKey === "foreign") return { key: "amex_foreign", locality: "foreign" };
    return { key: "amex", locality: localityKey === "unknown" ? "domestic" : localityKey };
  }
  if (m.includes("jcb")) {
    if (m.includes("foreign") || localityKey === "foreign") return { key: "jcb_foreign", locality: "foreign" };
    return { key: "jcb", locality: localityKey === "unknown" ? "domestic" : localityKey };
  }
  if (m.includes("fps")) return { key: "fps", locality: "any" };
  return { key: m.replace(/\s+/g, "_") || "other", locality: localityKey };
}

type FeeRate = {
  payment_method: string;
  locality: string;
  merchant_number: string | null;
  wallet_type: string | null;
  rate: number;
  rounding_dp: number;
};

// Find the most-specific rate.
// Priority: exact (method+locality+wallet+merchant) > (method+locality+wallet+null)
//        > (method+locality+merchant) > (method+locality+null)
function findRate(rates: FeeRate[], method: string, locality: string, merchant: string, wallet: string | null): FeeRate | null {
  const base = rates.filter(
    (r) => r.payment_method === method && (r.locality === locality || r.locality === "any"),
  );
  const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase();
  const w = norm(wallet);
  if (w) {
    const walletMatch = base.filter((r) => norm(r.wallet_type) === w);
    const exactWM = walletMatch.find((r) => r.merchant_number === merchant);
    if (exactWM) return exactWM;
    const anyWM = walletMatch.find((r) => !r.merchant_number);
    if (anyWM) return anyWM;
  }
  const noWallet = base.filter((r) => !r.wallet_type);
  const exact = noWallet.find((r) => r.merchant_number === merchant);
  if (exact) return exact;
  return noWallet.find((r) => !r.merchant_number) || null;
}

// ---------- Core parser ----------
type ParsedLine = {
  payment_type: string;
  payment_type_label: string;
  count: number;
  gross_amount: number;
  fee_amount: number;       // negative (KPay convention)
  net_amount: number;
  expected_fee: number;     // negative (matches actual sign convention)
  fee_variance: number;     // actual - expected; positive = KPay charged more
  audit_status: "ok" | "rate_off" | "unknown_pm";
};

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
  lines: ParsedLine[];
  transactions: ParsedTxn[];
  // audit aggregates
  transactions_flagged: number;
  fee_variance: number;
  audit_status: "ok" | "rate_off" | "unknown_pm";
  audit_note: string;
};

type ParsedTxn = {
  transaction_time: string;          // ISO timestamp
  payment_method_raw: string;
  payment_method_key: string;
  locality: string;
  merchant_number: string;
  gross_amount: number;
  fee_amount: number;                 // negative
  net_amount: number;
  expected_fee: number;               // negative
  fee_variance: number;
  audit_status: "ok" | "rate_off" | "unknown_pm";
  reference: string;
};

function parseKPayWorkbook(wb: XLSX.WorkBook, rates: FeeRate[]) {
  const batchMap = new Map<string, ParsedBatch>();

  // 1) Batches from Monthly Settlement Report
  const monthly = wb.Sheets["Monthly Settlement Report"];
  if (monthly) {
    const rows = XLSX.utils.sheet_to_json<any[]>(monthly, { header: 1, raw: true, defval: null });
    let headerRow = -1;
    for (let r = 0; r < rows.length; r++) {
      const joined = (rows[r] || []).map((c) => norm(c)).join("|");
      if (joined.includes("settlement date") && joined.includes("transaction date") && joined.includes("net total settlement")) {
        headerRow = r; break;
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
        if (row.every((c: any) => c === null || c === "" || c === undefined)) continue;
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
          transactions: [],
          transactions_flagged: 0,
          fee_variance: 0,
          audit_status: "ok",
          audit_note: "",
        });
      }
    }
  }

  // 2) Per-transaction audit from Settlement details
  const details = wb.Sheets["Settlement details"];
  if (details) {
    const rows = XLSX.utils.sheet_to_json<any[]>(details, { header: 1, raw: true, defval: null });
    let headerRow = -1;
    for (let r = 0; r < Math.min(rows.length, 20); r++) {
      const joined = (rows[r] || []).map((c) => norm(c)).join("|");
      if (joined.includes("payment method") && joined.includes("transaction time")) {
        headerRow = r; break;
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
      const cLocality = find("transaction locality");

      type Agg = {
        count: number;
        gross: number;
        fee: number;
        net: number;
        expected: number;
        flagged: number;
        unknown: boolean;
        rateOff: boolean;
        label: string;
        key: string;
      };
      const agg = new Map<string, Agg>();
      const txnsByKey = new Map<string, ParsedTxn[]>();

      for (let r = headerRow + 1; r < rows.length; r++) {
        const row = rows[r] || [];
        if (row.every((c: any) => c === null || c === "" || c === undefined)) continue;
        const merchant = String(row[cMerch] ?? "").trim();
        const method = String(row[cMethod] ?? "").trim();
        const locality = cLocality >= 0 ? String(row[cLocality] ?? "").trim() : "";
        const tDateTime = toDateTime(row[cTxnTime]);
        const t = tDateTime ? tDateTime.slice(0, 10) : null;
        if (!merchant || !method || !t) continue;

        const amount = toNum(row[cAmount]);
        const actualFee = toNum(row[cFee]); // negative
        const netAmt = toNum(row[cNet]);

        const cls = classifyPaymentMethod(method, locality);
        const rate = findRate(rates, cls.key, cls.locality, merchant);
        const expected = rate ? -roundTo(amount * rate.rate, rate.rounding_dp ?? 2) : 0;
        const variance = round2(actualFee - expected);
        const isFlagged = !rate ? true : Math.abs(variance) > 0.01;
        const status: ParsedTxn["audit_status"] = !rate ? "unknown_pm" : (Math.abs(variance) > 0.01 ? "rate_off" : "ok");

        // group key for aggregate line: merchant + txn_date + classified method + locality
        const k = `${merchant}|${t}|${cls.key}|${cls.locality}`;
        let a = agg.get(k);
        if (!a) {
          a = { count: 0, gross: 0, fee: 0, net: 0, expected: 0, flagged: 0, unknown: !rate, rateOff: false, label: method, key: cls.key };
          agg.set(k, a);
        }
        a.count += 1;
        a.gross += amount;
        a.fee += actualFee;
        a.net += netAmt;
        a.expected += expected;
        if (isFlagged) a.flagged += 1;
        if (!rate) a.unknown = true;
        else if (Math.abs(variance) > 0.01) a.rateOff = true;

        // raw per-transaction (keyed by merchant+txn_date so we can attach to batch later)
        const tk = `${merchant}|${t}`;
        const arr = txnsByKey.get(tk) || [];
        arr.push({
          transaction_time: tDateTime!,
          payment_method_raw: method,
          payment_method_key: cls.key,
          locality: cls.locality,
          merchant_number: merchant,
          gross_amount: round2(amount),
          fee_amount: round2(actualFee),
          net_amount: round2(netAmt),
          expected_fee: round2(expected),
          fee_variance: variance,
          audit_status: status,
          reference: "",
        });
        txnsByKey.set(tk, arr);
      }

      // attach raw transactions to their batches
      for (const [tk, arr] of txnsByKey) {
        const [merchant, txnDate] = tk.split("|");
        const batch = Array.from(batchMap.values()).find(
          (b) => b.merchant_number === merchant && b.transaction_date === txnDate,
        );
        if (!batch) continue;
        batch.transactions = arr.sort((a, b) => b.transaction_time.localeCompare(a.transaction_time));
      }

      // attach lines to batches
      for (const [k, a] of agg) {
        const [merchant, txnDate] = k.split("|");
        const batch = Array.from(batchMap.values()).find(
          (b) => b.merchant_number === merchant && b.transaction_date === txnDate,
        );
        if (!batch) continue;
        const variance = round2(a.fee - a.expected);
        const status: ParsedLine["audit_status"] = a.unknown ? "unknown_pm" : a.rateOff ? "rate_off" : "ok";
        batch.lines.push({
          payment_type: a.key,
          payment_type_label: a.label,
          count: a.count,
          gross_amount: round2(a.gross),
          fee_amount: round2(a.fee),
          net_amount: round2(a.net),
          expected_fee: round2(a.expected),
          fee_variance: variance,
          audit_status: status,
        });
        batch.transactions_flagged += a.flagged;
        batch.fee_variance = round2(batch.fee_variance + variance);
        if (status === "unknown_pm" && batch.audit_status !== "unknown_pm") batch.audit_status = "unknown_pm";
        else if (status === "rate_off" && batch.audit_status === "ok") batch.audit_status = "rate_off";
      }
    }
  }

  const batches = Array.from(batchMap.values()).sort(
    (a, b) => a.settlement_date.localeCompare(b.settlement_date) || a.merchant_number.localeCompare(b.merchant_number),
  );

  // Build monthly reconciliation: details aggregate (per merchant + txn_date) vs Monthly row
  type MonthlyAudit = {
    merchant_number: string;
    merchant_label: string;
    settlement_date: string;
    transaction_date: string;
    monthly_gross: number;
    monthly_fee: number;
    monthly_net: number;
    settlement_fee: number;
    adjustments: number;
    points_offset: number;
    frozen_amount: number;
    details_count: number;
    details_gross: number;
    details_fee: number;
    details_net: number;
    expected_net: number;
    reconciliation_variance: number;
    audit_status: "ok" | "off" | "missing_details";
  };
  const monthly_audit: MonthlyAudit[] = batches.map((b) => {
    const details_count = b.lines.reduce((s, l) => s + l.count, 0);
    const details_gross = round2(b.lines.reduce((s, l) => s + l.gross_amount, 0));
    const details_fee = round2(b.lines.reduce((s, l) => s + l.fee_amount, 0));
    const details_net = round2(b.lines.reduce((s, l) => s + l.net_amount, 0));
    // KPay: settlement_fee comes through signed (negative), add directly
    const expected_net = round2(details_net + b.adjustments + b.points_offset + b.bank_transfer_fee - b.frozen_amount);
    const variance = round2(b.net_settlement - expected_net);
    const status: MonthlyAudit["audit_status"] =
      b.lines.length === 0 ? "missing_details" : Math.abs(variance) <= 0.01 ? "ok" : "off";
    return {
      merchant_number: b.merchant_number,
      merchant_label: b.merchant_label,
      settlement_date: b.settlement_date,
      transaction_date: b.transaction_date,
      monthly_gross: b.gross_amount,
      monthly_fee: b.fee_amount,
      monthly_net: b.net_settlement,
      settlement_fee: b.bank_transfer_fee,
      adjustments: b.adjustments,
      points_offset: b.points_offset,
      frozen_amount: b.frozen_amount,
      details_count,
      details_gross,
      details_fee,
      details_net,
      expected_net,
      reconciliation_variance: variance,
      audit_status: status,
    };
  });

  return { batches, monthly_audit };
}

// Optional: ask Gemini to write a one-line note per flagged batch
async function annotateFlaggedBatches(batches: ParsedBatch[]): Promise<void> {
  const flagged = batches.filter((b) => b.audit_status !== "ok");
  if (flagged.length === 0) return;

  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return;

  const payload = flagged.slice(0, 50).map((b) => ({
    settle: b.settlement_date,
    txn: b.transaction_date,
    merchant: b.merchant_label || b.merchant_number,
    variance: b.fee_variance,
    status: b.audit_status,
    lines: b.lines
      .filter((l) => l.audit_status !== "ok")
      .map((l) => ({ pm: l.payment_type_label, count: l.count, gross: l.gross_amount, expected: l.expected_fee, actual: l.fee_amount, variance: l.fee_variance, status: l.audit_status })),
  }));

  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a payments auditor. For each settlement batch in the input, write a single short sentence (max 100 chars) explaining the fee anomaly in plain English. Reply ONLY by calling the write_notes tool.",
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "write_notes",
              description: "Return one note per flagged batch in input order.",
              parameters: {
                type: "object",
                properties: {
                  notes: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["notes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "write_notes" } },
      }),
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return;
    const notes: string[] = JSON.parse(args).notes || [];
    flagged.slice(0, notes.length).forEach((b, i) => {
      b.audit_note = notes[i] || "";
    });
  } catch (e) {
    console.warn("Gemini annotate skipped:", (e as Error).message);
  }
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
      .select("id, file_url, file_name, processor_id")
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

    // Load fee rates for this processor
    const { data: rateRows } = await admin
      .from("payment_processor_fee_rates")
      .select("payment_method, locality, merchant_number, rate, rounding_dp")
      .eq("processor_id", imp.processor_id);
    const rates: FeeRate[] = (rateRows || []) as any;

    const wb = XLSX.read(new Uint8Array(ab), { type: "array", cellDates: true });
    const { batches, monthly_audit } = parseKPayWorkbook(wb, rates);

    // Annotate flagged batches via Gemini (best-effort)
    await annotateFlaggedBatches(batches);

    // Audit summary
    const auditSummary = {
      transactions_flagged: batches.reduce((s, b) => s + b.transactions_flagged, 0),
      fee_variance: round2(batches.reduce((s, b) => s + b.fee_variance, 0)),
      expected_fee_total: round2(batches.reduce((s, b) => s + b.lines.reduce((x, l) => x + l.expected_fee, 0), 0)),
      actual_fee_total: round2(batches.reduce((s, b) => s + b.lines.reduce((x, l) => x + l.fee_amount, 0), 0)),
      reconciliation_off: monthly_audit.filter((m) => m.audit_status !== "ok").length,
      reconciliation_variance: round2(monthly_audit.reduce((s, m) => s + m.reconciliation_variance, 0)),
      settlement_fee_total: round2(monthly_audit.reduce((s, m) => s + m.settlement_fee, 0)),
    };

    const knownMerchants = await admin
      .from("payment_processor_merchants")
      .select("id, merchant_number, display_name");
    const known = new Set((knownMerchants.data || []).map((m: any) => m.merchant_number));
    const unknown_merchants = Array.from(new Set(batches.map((b) => b.merchant_number).filter((n) => n && !known.has(n))));

    return json({ batches, monthly_audit, unknown_merchants, audit: auditSummary, sheets: wb.SheetNames });
  } catch (e: any) {
    console.error("parse-kpay-settlement error:", e);
    return json({ error: e?.message || "Unknown error" }, 500);
  }
});
