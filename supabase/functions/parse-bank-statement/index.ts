// Parse a bank statement PDF using Lovable AI Gateway (Gemini).
// Accepts JSON: { file_base64, file_name, mime_type } (mime_type optional).
// Returns the extracted, structured JSON. No DB writes; client confirms then commits.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a precise bank statement extractor.
Return STRICT JSON via the provided tool. Rules:
- Detect every distinct bank account inside the statement (consolidated statements may contain several).
- For each account return: account_type (e.g. "HKD Current", "HKD Savings", "Foreign Currency Savings"), account_number (full as printed), account_number_last4, currency (3-letter), opening_balance, closing_balance, total_deposits, total_withdrawals, deposit_count, withdrawal_count.
- Each transaction must include: txn_date (YYYY-MM-DD), value_date (YYYY-MM-DD or null), raw_description (verbatim, preserve original wording incl. counterparty + reference), cleaned_counterparty (best guess), reference (string or null), deposit (number, 0 if none), withdrawal (number, 0 if none), running_balance (number or null), source_page (1-based PDF page).
- Skip "Balance Brought Forward" / "Balance Carried Forward" lines (do not include them as transactions).
- Numbers must be plain numbers (no commas, no currency symbol).
- Preserve order.
- Always include bank_name, company_name, statement_date (YYYY-MM-DD).`;

const TOOL = {
  type: "function",
  function: {
    name: "extract_statement",
    description: "Return the structured bank statement extraction.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["bank_name", "company_name", "statement_date", "accounts"],
      properties: {
        bank_name: { type: "string" },
        company_name: { type: "string" },
        statement_date: { type: "string" },
        accounts: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["account_type", "account_number", "currency", "opening_balance", "closing_balance", "transactions"],
            properties: {
              account_type: { type: "string" },
              account_number: { type: "string" },
              account_number_last4: { type: "string" },
              currency: { type: "string" },
              opening_balance: { type: "number" },
              closing_balance: { type: "number" },
              total_deposits: { type: "number" },
              total_withdrawals: { type: "number" },
              deposit_count: { type: "number" },
              withdrawal_count: { type: "number" },
              transactions: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["txn_date", "raw_description", "deposit", "withdrawal"],
                  properties: {
                    txn_date: { type: "string" },
                    value_date: { type: ["string", "null"] },
                    raw_description: { type: "string" },
                    cleaned_counterparty: { type: "string" },
                    reference: { type: ["string", "null"] },
                    deposit: { type: "number" },
                    withdrawal: { type: "number" },
                    running_balance: { type: ["number", "null"] },
                    source_page: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const { file_base64, file_name, mime_type } = body || {};
    if (!file_base64 || typeof file_base64 !== "string") {
      return new Response(JSON.stringify({ error: "file_base64 is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dataUrl = `data:${mime_type || "application/pdf"};base64,${file_base64}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `Extract the bank statement (file: ${file_name || "statement.pdf"}). Return ALL transactions across ALL pages and ALL accounts.` },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "extract_statement" } },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("AI gateway error", aiRes.status, txt);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Workspace → Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI extraction failed", detail: txt.slice(0, 500) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await aiRes.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) {
      return new Response(JSON.stringify({ error: "No tool call returned", raw: json }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let parsed: any;
    try {
      parsed = typeof call.function.arguments === "string" ? JSON.parse(call.function.arguments) : call.function.arguments;
    } catch (e) {
      return new Response(JSON.stringify({ error: "Failed to parse tool arguments", detail: String(e) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Derive last4 if missing
    for (const a of parsed.accounts || []) {
      if (!a.account_number_last4 && a.account_number) {
        const digits = String(a.account_number).replace(/\D/g, "");
        a.account_number_last4 = digits.slice(-4);
      }
    }

    return new Response(JSON.stringify({ ok: true, data: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-bank-statement error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
