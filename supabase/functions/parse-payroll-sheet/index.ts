import { requireAuth } from "../_shared/auth.ts";
import * as XLSX from "npm:xlsx@0.18.5";
import { Buffer } from "node:buffer";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type FileEntry = { base64: string; mimeType: string; filename?: string };
type EmployeeHint = { id: string; first_name: string; last_name: string; employment_type: string };

const buildSystemPrompt = (employees: EmployeeHint[]) => `You extract FINAL PAYROLL FIGURES from documents (payroll registers, PDF payroll runs, Excel spreadsheets, photographed pay sheets). Context: KHAMBU Group (restaurants/bars in Hong Kong).

Each row corresponds to one employee's payroll for the period. Report ONLY the figures actually printed on the document — do NOT compute, derive, or reconcile any value. What's on the sheet is authoritative.

Understand the three amount tiers:
- BASE (base_salary): the agreed / contracted monthly salary — the fixed figure per the employment contract. Labels: "Salary", "Basic", "Basic Salary", "Contract Salary".
- GROSS (gross_pay): what the employee actually EARNED this period — Base adjusted for reality, BEFORE any MPF or deduction. Labels: "Gross", "Gross Pay", "Total Earnings", "Earned", "Payable Gross". If a distinct gross figure is printed, extract it. Otherwise return 0.
- NET (net_pay): final take-home. Labels: "Net", "Net Pay", "Take Home", "Payable", "Actual Payment".

EARNINGS COMPONENTS — extract each as its OWN field, never fold them into other fields:
- overtime_pay: OT/overtime amount. Labels: "OT", "Overtime", "O.T.", "OT Pay".
- actual_bonus: bonus/commission amount. Labels: "Bonus", "Commission", "Discretionary Bonus", "Performance Bonus", "Sales Bonus", "13th Month".
- annual_leave_pay: Annual Leave / Public Holiday pay (ADDS to pay). Labels: "AL", "AL/PH", "A/L", "Annual Leave", "Annual Leave Pay", "Public Holiday", "PH", "PH Pay", "Statutory Holiday".
- unpaid_leave_deduction: Unpaid / No-Pay Leave deduction (SUBTRACTS from pay — always return a positive number; the sign is applied by the consumer). Labels: "NP", "NPL", "No Pay Leave", "No-Pay Leave", "Unpaid Leave", "U/L", "Unpaid Leave Deduction".

DEDUCTIONS:
- mpf_employee: employee MPF contribution. 0 if not present.
- mpf_employer: employer MPF contribution. 0 if not present.
- other_deductions: sum of any named non-MPF deduction lines (advance recovery, loan, salary advance, staff meal, uniform, etc.). Do NOT include NP here — NP has its own field. 0 if none.

UNPARSEABLE FIGURES — critical:
If you can SEE a labeled row but the adjacent NUMBER is unreadable/smudged/ambiguous, do NOT default that field to 0. Instead:
- Set the field to null.
- Add the field name to the "unparsed_fields" array on that row.
This lets the human reviewer catch it. A missing label (field is genuinely not on the sheet) is different — return 0 for that.

MATCHING:
- raw_name: person's name verbatim.
- matched_employee_id: id from roster below best matching raw_name (case-insensitive, tolerate initials, reversed Last/First, minor typos). "" if no confident match.

Rules:
- All output text in English.
- Read every number digit by digit. Never invent a value. Never calculate — copy what is printed.
- One row per distinct employee entry. Do NOT emit totals/subtotals rows.
- If a field is missing entirely on the sheet, return 0. Only use null when the label is present but the number is unreadable.

Employee roster (id | last_name, first_name | type):
${employees.map(e => `${e.id} | ${e.last_name}, ${e.first_name} | ${e.employment_type}`).join("\n") || "(none provided)"}

Return ONLY valid JSON:

{
  "rows": [
    {
      "raw_name": "string",
      "matched_employee_id": "one of the ids above, or ''",
      "base_salary": number,
      "gross_pay": number,
      "overtime_pay": number | null,
      "actual_bonus": number | null,
      "annual_leave_pay": number | null,
      "unpaid_leave_deduction": number | null,
      "mpf_employee": number,
      "mpf_employer": number,
      "other_deductions": number,
      "net_pay": number,
      "unparsed_fields": ["string"],
      "confidence": "high | medium | low",
      "source_hint": "string"
    }
  ]
}

If nothing extractable, return {"rows": []}.`;


const XLSX_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

async function fileToPromptBlocks(f: FileEntry): Promise<{ blocks: any[]; warning?: string }> {
  const mt = (f.mimeType || "").toLowerCase();
  const dataUrl = `data:${f.mimeType};base64,${f.base64}`;
  const label = f.filename || "file";

  if (mt.startsWith("image/")) {
    return { blocks: [{ type: "image_url", image_url: { url: dataUrl } }] };
  }
  if (mt === "application/pdf") {
    return { blocks: [{ type: "file", file: { filename: label, file_data: dataUrl } }] };
  }
  if (XLSX_MIMES.has(mt) || /\.xlsx?$/i.test(label)) {
    try {
      const buf = Buffer.from(f.base64, "base64");
      const wb = XLSX.read(buf, { type: "buffer" });
      const chunks: string[] = [];
      for (const name of wb.SheetNames) {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
        if (csv.trim()) chunks.push(`--- Sheet: ${name} ---\n${csv}`);
      }
      const text = chunks.join("\n\n") || "(empty spreadsheet)";
      return {
        blocks: [{
          type: "text",
          text: `Extracted from spreadsheet "${label}" — treat each data row as a payroll entry:\n\n${text}`,
        }],
      };
    } catch (e) {
      return { blocks: [], warning: `Failed to parse Excel ${label}: ${(e as Error).message}` };
    }
  }
  return { blocks: [], warning: `Unsupported file type: ${f.mimeType} (${label})` };
}

/** Return a finite number, or `null` if the value is null/undefined/NaN. */
function nullableNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
/** Coerce to a finite number (0 fallback). Use only for fields where "0" and "missing" mean the same thing (base, mpf, net). */
function num(v: unknown): number {
  const n = Number(v || 0);
  return Number.isFinite(n) ? n : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireAuth(req, corsHeaders);
  if (auth.response) return auth.response;

  try {
    const body = await req.json();
    const files: FileEntry[] = Array.isArray(body.files) ? body.files : [];
    const employees: EmployeeHint[] = Array.isArray(body.employees) ? body.employees : [];

    if (files.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No files provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userContent: any[] = [
      { type: "text", text: "Extract every payroll row from the attached document(s). Return ONLY the JSON object specified in your instructions." },
    ];
    const warnings: string[] = [];
    for (const f of files) {
      const { blocks, warning } = await fileToPromptBlocks(f);
      if (warning) warnings.push(warning);
      for (const b of blocks) userContent.push(b);
    }

    const requestBody = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: buildSystemPrompt(employees) },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    };

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Gateway error:", resp.status, errText);
      const status = resp.status === 429 ? 429 : resp.status === 402 ? 402 : 500;
      return new Response(
        JSON.stringify({
          success: false,
          error:
            status === 429 ? "Rate limit — please retry shortly." :
            status === 402 ? "AI credits depleted." :
            "AI extraction failed",
        }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || "";
    let parsed: any = {};
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (m) { try { parsed = JSON.parse(m[0]); } catch { /* ignore */ } }
    }

    const validIds = new Set(employees.map(e => e.id));
    const rows = (Array.isArray(parsed.rows) ? parsed.rows : []).map((r: any) => {
      const mid = String(r.matched_employee_id || "").trim();

      const base_salary = num(r.base_salary);
      const gross_pay = num(r.gross_pay);
      const mpf_employee = num(r.mpf_employee);
      const mpf_employer = num(r.mpf_employer);
      const other_deductions = num(r.other_deductions);
      const net_pay = num(r.net_pay);

      // Component earnings: null = smudged/unreadable label. Treat null as 0 in the
      // reconciliation math but keep the null in the payload for the reviewer.
      const overtime_pay = nullableNum(r.overtime_pay);
      const actual_bonus = nullableNum(r.actual_bonus);
      const annual_leave_pay = nullableNum(r.annual_leave_pay);
      const unpaid_leave_deduction = nullableNum(r.unpaid_leave_deduction);

      const unparsed_fields: string[] = Array.isArray(r.unparsed_fields)
        ? r.unparsed_fields.filter((f: any) => typeof f === "string")
        : [];

      // New Gross composition:
      //   Gross = Base + OT + Bonus + AL/PH − NP + Adjustments
      // Reconciliation residual (= "Adjustments"):
      //   adj = Net − (Base + OT + Bonus + AL − NP − MPF_EE − Other_Ded)
      const ot0 = overtime_pay ?? 0;
      const bn0 = actual_bonus ?? 0;
      const al0 = annual_leave_pay ?? 0;
      const np0 = unpaid_leave_deduction ?? 0;
      const expected_net = base_salary + ot0 + bn0 + al0 - np0 - mpf_employee - other_deductions;
      const computed_adjustment = net_pay > 0
        ? net_pay - expected_net
        : 0;
      // Green tick only when scanned Net matches components with ZERO residual adjustment
      // AND no fields needed manual review.
      const reconciles = net_pay > 0
        && Math.abs(computed_adjustment) < 1
        && unparsed_fields.length === 0;

      return {
        raw_name: String(r.raw_name || "").trim(),
        matched_employee_id: validIds.has(mid) ? mid : "",
        base_salary,
        gross_pay,
        overtime_pay,
        actual_bonus,
        annual_leave_pay,
        unpaid_leave_deduction,
        mpf_employee,
        mpf_employer,
        other_deductions,
        net_pay,
        unparsed_fields,
        expected_net: Number(expected_net.toFixed(2)),
        reconciles,
        computed_adjustment: Number(computed_adjustment.toFixed(2)),
        needs_review: unparsed_fields.length > 0,
        confidence: (["high", "medium", "low"].includes(r.confidence) ? r.confidence : "low") as string,
        source_hint: String(r.source_hint || "").trim(),
      };
    }).filter((r: any) => r.raw_name || r.base_salary > 0 || r.net_pay > 0);


    return new Response(JSON.stringify({ success: true, rows, warnings }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("parse-payroll-sheet error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
