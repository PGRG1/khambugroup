import { requireAuth } from "../_shared/auth.ts";
import * as XLSX from "npm:xlsx@0.18.5";
import { Buffer } from "node:buffer";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type FileEntry = { base64: string; mimeType: string; filename?: string };
type ClassificationHint = { id: string; name: string };

const buildSystemPrompt = (classifications: ClassificationHint[]) => `You extract PETTY CASH RECEIPTS from documents. Context: KHAMBU Group (restaurants/bars in Hong Kong — Assembly, Caliente, Hanabi, Events). A staff member paid for a small operational expense using the venue's petty cash float and is submitting the receipt.

You may receive: photographed receipts, PDF receipts, PDF envelope summaries (possibly with multiple receipts), or Excel spreadsheets listing receipts.

RULES:
- All output text MUST be in English. Translate any Chinese to English.
- Read every number digit by digit. Never invent an amount.
- receipt_date in YYYY-MM-DD. If you can't determine it, return "".
- Extract ONE entry per distinct receipt/row. A single document may produce many entries.
- description: short, concrete, in English — the merchant and/or what it was for (e.g. "ParknShop — cleaning supplies", "Taxi to supplier meeting").
- suggested_classification_id: MUST be one of the ids in the list below, or "" if none clearly fit. Match by intent.
- confidence: "high" | "medium" | "low".
- source_hint: brief origin note ("Excel row 4", "PDF page 2 receipt", "image 1") so the user can trace back.

Classifications available (id | name):
${classifications.map(c => `${c.id} | ${c.name}`).join("\n") || "(none provided)"}

Return ONLY valid JSON with this exact shape:

{
  "rows": [
    {
      "description": "string",
      "amount": number,
      "receipt_date": "YYYY-MM-DD or ''",
      "suggested_classification_id": "one of the ids above, or ''",
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
          text: `Extracted from spreadsheet "${label}" — treat each data row as a potential receipt. Use header rows to infer columns.\n\n${text}`,
        }],
      };
    } catch (e) {
      return { blocks: [], warning: `Failed to parse Excel file ${label}: ${(e as Error).message}` };
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
    const classifications: ClassificationHint[] = Array.isArray(body.classifications) ? body.classifications : [];

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
      { type: "text", text: "Extract every petty cash receipt from the attached document(s). Return ONLY the JSON object specified in your instructions." },
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
        { role: "system", content: buildSystemPrompt(classifications) },
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
    console.log(`parse-petty-cash-receipt: gateway in ${Date.now() - t0}ms, status ${resp.status}`);

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

    const validIds = new Set(classifications.map(c => c.id));
    const rows = (Array.isArray(parsed.rows) ? parsed.rows : []).map((r: any) => {
      const sid = String(r.suggested_classification_id || "").trim();
      return {
        description: String(r.description || "").trim(),
        amount: Number(r.amount || 0),
        receipt_date: String(r.receipt_date || "").trim(),
        suggested_classification_id: validIds.has(sid) ? sid : "",
        confidence: (["high", "medium", "low"].includes(r.confidence) ? r.confidence : "low") as string,
        source_hint: String(r.source_hint || "").trim(),
      };
    }).filter((r: any) => r.description || r.amount > 0);

    return new Response(JSON.stringify({ success: true, rows, warnings }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("parse-petty-cash-receipt error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
