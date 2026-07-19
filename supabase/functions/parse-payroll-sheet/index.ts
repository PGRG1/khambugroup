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

Fields to extract per row:
- raw_name: the person's name as it appears in the document (verbatim).
- matched_employee_id: the id from the employee roster below that best matches raw_name (case-insensitive, tolerate initials, reversed order Last/First, minor typos). If no confident match, "".
- base_salary: the basic/base salary figure shown on the sheet. Number. 0 if not present.
- mpf_employee: the employee MPF contribution shown. Number. 0 if not present.
- mpf_employer: the employer MPF contribution shown. Number. 0 if not present.
- net_pay: the net pay (take-home) figure shown. Number. 0 if not present.
- gross_pay: the gross pay figure shown, if the sheet prints one. Number. 0 if not present (optional).
- confidence: "high" | "medium" | "low".
- source_hint: short origin note ("Excel row 4", "PDF page 2", "image 1").

Rules:
- All output text in English.
- Read every number digit by digit. Never invent a value. Never calculate — copy what is printed.
- One row per distinct employee entry. Do NOT emit totals/subtotals rows.
- If a field is missing on the sheet, return 0 (numbers) or "" (strings). Do not guess.

Employee roster (id | last_name, first_name | type):
${employees.map(e => `${e.id} | ${e.last_name}, ${e.first_name} | ${e.employment_type}`).join("\n") || "(none provided)"}

Return ONLY valid JSON:

{
  "rows": [
    {
      "raw_name": "string",
      "matched_employee_id": "one of the ids above, or ''",
      "base_salary": number,
      "mpf_employee": number,
      "mpf_employer": number,
      "net_pay": number,
      "gross_pay": number,
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
      return {
        raw_name: String(r.raw_name || "").trim(),
        matched_employee_id: validIds.has(mid) ? mid : "",
        base_salary: Number(r.base_salary || 0),
        mpf_employee: Number(r.mpf_employee || 0),
        mpf_employer: Number(r.mpf_employer || 0),
        net_pay: Number(r.net_pay || 0),
        gross_pay: Number(r.gross_pay || 0),
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
