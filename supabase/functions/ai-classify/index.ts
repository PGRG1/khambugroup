// Shared AI classification + learning endpoint.
// Two operations on a single function:
//   POST /  body { op: "suggest", domain, workflow, input, venue_id?, max_examples? }
//   POST /  body { op: "apply",   domain, workflow, decision, input, output_action, rule_pattern?, teach: bool, record_type?, record_id?, rule_id? }
//
// Tenant scoping: derived from the caller's JWT via tenant_members.
// Never persists from /suggest. /apply records the application and (if teach=true) upserts a rule.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

// Domain-aware system prompts. Keeps the function generic; just add new entries here.
const WORKFLOW_PROMPTS: Record<string, string> = {
  bank_txn_classify:
    "You classify bank-statement transactions into accounting categories. Decide a transaction type (e.g. sales_deposit, supplier_payment, payroll, bank_fee, transfer, refund, other) and an optional category. Be conservative — prefer 'other' if unclear.",
  settlement_to_deposit:
    "You match a payment-processor settlement batch to a bank deposit. Use amount, date proximity (±3 days), and processor/merchant identifiers in the bank description. Return the candidate bank_transaction_id and a confidence score.",
  invoice_line_to_coa:
    "You map an invoice line (description + supplier + product if any) to a Chart of Accounts entry and a financial treatment (COGS / OpEx / Asset).",
  receipt_field_extract:
    "You extract or correct fields from a scanned receipt/invoice (supplier, invoice number, date, totals, tax). Use prior corrections as authoritative for the same supplier layout.",
  product_match:
    "You match a free-text procurement description to a product in product_master. Return product_master_id and confidence.",
};

async function getCallerTenant(authHeader: string | null) {
  if (!authHeader) return null;
  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return null;
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: m } = await admin
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", u.user.id)
    .order("role", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!m) return null;
  return { user_id: u.user.id, tenant_id: m.tenant_id as string, role: m.role as string };
}

async function callAI(systemPrompt: string, userPayload: unknown) {
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "return_suggestion",
            description: "Return the structured suggestion for this workflow.",
            parameters: {
              type: "object",
              properties: {
                output_action: {
                  type: "object",
                  description: "The mapping/action the AI proposes (workflow-specific JSON).",
                  additionalProperties: true,
                },
                rule_pattern: {
                  type: "object",
                  description:
                    "A reusable trigger that would auto-match similar future inputs (workflow-specific JSON).",
                  additionalProperties: true,
                },
                confidence: { type: "number", minimum: 0, maximum: 1 },
                rationale: { type: "string" },
              },
              required: ["output_action", "confidence"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "return_suggestion" } },
    }),
  });
  if (!resp.ok) {
    if (resp.status === 429) throw new Error("rate_limited");
    if (resp.status === 402) throw new Error("payment_required");
    throw new Error(`ai_gateway_${resp.status}`);
  }
  const j = await resp.json();
  const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("ai_no_tool_call");
  return JSON.parse(args);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await getCallerTenant(req.headers.get("Authorization"));
    if (!ctx) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();
    const op = body.op as "suggest" | "apply";
    const domain = String(body.domain || "");
    const workflow = String(body.workflow || "");
    if (!domain || !workflow) {
      return new Response(JSON.stringify({ error: "domain and workflow required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (op === "suggest") {
      // Pull few-shot context: top active rules + recent confirmed applications.
      const { data: rules } = await admin
        .from("ai_learned_rules")
        .select("input_pattern, output_action, hit_count, confidence")
        .eq("tenant_id", ctx.tenant_id)
        .eq("domain", domain)
        .eq("workflow", workflow)
        .eq("status", "active")
        .order("hit_count", { ascending: false })
        .limit(20);

      const { data: recent } = await admin
        .from("ai_rule_applications")
        .select("input_snapshot, output_snapshot")
        .eq("tenant_id", ctx.tenant_id)
        .eq("domain", domain)
        .eq("workflow", workflow)
        .eq("was_overridden", false)
        .order("created_at", { ascending: false })
        .limit(Math.min(Number(body.max_examples) || 25, 50));

      const systemPrompt = `${WORKFLOW_PROMPTS[workflow] ??
        "You are an accounting assistant that returns structured suggestions."}

You will receive:
- learned_rules: prior rules the user already taught you (highest authority).
- recent_examples: recent confirmed user decisions.
- input: the new record to classify.

Return your answer ONLY by calling the return_suggestion tool. Confidence ∈ [0,1]. The rule_pattern must be a generic trigger (e.g. {"contains":"FPS"}) that would match similar future inputs — not a copy of the input.`;

      const out = await callAI(systemPrompt, {
        learned_rules: rules ?? [],
        recent_examples: recent ?? [],
        input: body.input ?? {},
      });

      return new Response(
        JSON.stringify({
          suggestion: out.output_action,
          rule_pattern: out.rule_pattern ?? null,
          confidence: out.confidence ?? 0.7,
          rationale: out.rationale ?? "",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (op === "apply") {
      // Record the application. If teach=true, upsert a rule.
      let ruleId: string | null = body.rule_id ?? null;

      if (body.teach && body.rule_pattern && body.output_action) {
        // De-dupe by (tenant, domain, workflow, input_pattern) — bump hit_count if found.
        const { data: existing } = await admin
          .from("ai_learned_rules")
          .select("id, hit_count")
          .eq("tenant_id", ctx.tenant_id)
          .eq("domain", domain)
          .eq("workflow", workflow)
          .contains("input_pattern", body.rule_pattern)
          .maybeSingle();
        if (existing) {
          ruleId = existing.id;
          await admin
            .from("ai_learned_rules")
            .update({
              hit_count: (existing.hit_count ?? 0) + 1,
              last_used_at: new Date().toISOString(),
              output_action: body.output_action,
            })
            .eq("id", existing.id);
        } else {
          const { data: ins, error: insErr } = await admin
            .from("ai_learned_rules")
            .insert({
              tenant_id: ctx.tenant_id,
              venue_id: body.venue_id ?? null,
              domain,
              workflow,
              rule_type: body.rule_type ?? null,
              name: body.name ?? null,
              input_pattern: body.rule_pattern,
              output_action: body.output_action,
              confidence: body.confidence ?? 0.85,
              hit_count: 1,
              last_used_at: new Date().toISOString(),
              source_examples: body.record_id
                ? [{ record_type: body.record_type, record_id: body.record_id }]
                : [],
              status: "active",
              created_by: ctx.user_id,
            })
            .select("id")
            .single();
          if (insErr) throw insErr;
          ruleId = ins.id;
        }
      } else if (ruleId) {
        // Existing rule applied — bump counters.
        await admin.rpc("noop").catch(() => {}); // no-op; inline update below
        const { data: r } = await admin
          .from("ai_learned_rules")
          .select("hit_count")
          .eq("id", ruleId)
          .maybeSingle();
        if (r) {
          await admin
            .from("ai_learned_rules")
            .update({ hit_count: (r.hit_count ?? 0) + 1, last_used_at: new Date().toISOString() })
            .eq("id", ruleId);
        }
      }

      await admin.from("ai_rule_applications").insert({
        rule_id: ruleId,
        tenant_id: ctx.tenant_id,
        domain,
        workflow,
        record_type: body.record_type ?? null,
        record_id: body.record_id ?? null,
        applied_by: ctx.user_id,
        was_overridden: !!body.was_overridden,
        input_snapshot: body.input ?? {},
        output_snapshot: body.output_action ?? {},
      });

      return new Response(JSON.stringify({ ok: true, rule_id: ruleId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown op" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === "rate_limited" ? 429 : msg === "payment_required" ? 402 : 500;
    console.error("ai-classify error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
