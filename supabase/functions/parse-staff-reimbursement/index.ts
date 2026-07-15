import { requireAuth } from "../_shared/auth.ts";
import * as XLSX from "npm:xlsx@0.18.5";
import mammoth from "npm:mammoth@1.8.0";
import { Buffer } from "node:buffer";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type FileEntry = { base64: string; mimeType: string; filename?: string };
type CategoryHint = { id: string; name: string; financial_type: string };

const buildSystemPrompt = (categories: CategoryHint[]) => `You extract STAFF REIMBURSEMENT CLAIMS from documents an employee submits when they've paid for a work expense out of their own pocket. Context: KHAMBU Group (restaurants/bars in Hong Kong — Assembly, Caliente, Hanabi, Events).

You may receive: photographed receipts, PDF receipts, PDF expense reports (possibly with multiple receipts), Excel spreadsheets of claims (one row per claim), or Word documents.

RULES:
- All output text MUST be in English. Translate any Chinese to English.
- Read every number digit by digit. Never invent an amount.
- Dates in YYYY-MM-DD. If you can't determine the date, return "".
- Extract ONE claim per distinct receipt/row. A single document may produce many claims.
- claimant_name: only fill it if the document identifies the person who paid (e.g. an expense sheet with a "Claimed by" field, or a row explicitly naming a staff member). If a raw receipt doesn't identify the payer, leave "" — the user will fill it in.
- description: short, concrete, in English (e.g. "Uber to supplier meeting", "Cleaning supplies for Hanabi bar").
- suggested_category_id: MUST be one of the ids in the categories list below, or "" if none fit. Match by intent (COGS = food/beverage/ingredient purchases, Opex = operating expenses, Asset = deposits/refundable/equipment purchases).
- confidence: "high" | "medium" | "low".
- source_hint: brief origin note ("Excel row 4", "PDF page 2 receipt", "image 1"), so the user can trace back.

Categories available (id | name | financial_type):
${categories.map(c => `${c.id} | ${c.name} | ${c.financial_type}`).join("\n") || "(none provided)"}

Return ONLY valid JSON with this exact shape:

{
  "claims": [
    {
      "claimant_name": "string or ''",
      "description": "string",
      "amount": number,
      "claim_date": "YYYY-MM-DD or ''",
      "suggested_category_id": "one of the ids above, or ''",
      "confidence": "high | medium | low",
      "source_hint": "string"
    }
  ]
}

If nothing extractable, return {"claims": []}.`;

const XLSX_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function fileToPromptBlocks(f: FileEntry): Promise<{ blocks: any[]; warning?: string }> {
  const mt = (f.mimeType || "").toLowerCase();
  const dataUrl = `data:${f.mimeType};base64,${f.base64}`;
  const label = f.filename || "file";

  if (mt.startsWith("image/")) {
    return { blocks: [{ type: "image_url", image_url: { url: dataUrl } }] };
  }
  if (mt === "application/pdf") {
    return {
      blocks: [{ type: "file", file: { filename: label, file_data: dataUrl } }],
    };
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
          text: `Extracted from spreadsheet "${label}" — treat each data row as a potential claim. Header rows should be used to infer columns.\n\n${text}`,
        }],
      };
    } catch (e) {
      return { blocks: [], warning: `Failed to parse Excel file ${label}: ${(e as Error).message}` };
    }
  }
  if (mt === DOCX_MIME || /\.docx$/i.test(label)) {
    try {
      const buf = Buffer.from(f.base64, "base64");
      const { value } = await mammoth.extractRawText({ buffer: buf });
      const text = (value || "").trim() || "(empty document)";
      return {
        blocks: [{
          type: "text",
          text: `Extracted text from Word document "${label}":\n\n${text}`,
        }],
      };
    } catch (e) {
      return { blocks: [], warning: `Failed to parse Word file ${label}: ${(e as Error).message}` };
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
    const categories: CategoryHint[] = Array.isArray(body.categories) ? body.categories : [];

    if (files.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No files provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userContent: any[] = [
      { type: "text", text: "Extract every reimbursement claim from the attached document(s). Return ONLY the JSON object specified in your instructions." },
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
        { role: "system", content: buildSystemPrompt(categories) },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    };

    const t0 = Date.now();
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    console.log(`parse-staff-reimbursement: gateway in ${Date.now() - t0}ms, status ${resp.status}`);

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
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || "";
    let parsed: any = {};
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch { /* keep {} */ }
      }
    }

    const validIds = new Set(categories.map(c => c.id));
    const claims = (Array.isArray(parsed.claims) ? parsed.claims : []).map((c: any) => {
      const sid = String(c.suggested_category_id || "").trim();
      return {
        claimant_name: String(c.claimant_name || "").trim(),
        description: String(c.description || "").trim(),
        amount: Number(c.amount || 0),
        claim_date: String(c.claim_date || "").trim(),
        suggested_category_id: validIds.has(sid) ? sid : "",
        confidence: (["high", "medium", "low"].includes(c.confidence) ? c.confidence : "low") as string,
        source_hint: String(c.source_hint || "").trim(),
      };
    }).filter((c: any) => c.description || c.amount > 0);

    return new Response(JSON.stringify({ success: true, claims, warnings }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("parse-staff-reimbursement error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
