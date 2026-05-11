// Shared AI classification + learning endpoint.
// Two operations:
//   POST /  body { op: "suggest", domain, workflow, input, tenant_id, venue_id?, max_examples? }
//   POST /  body { op: "apply",   domain, workflow, input, output_action, rule_pattern?,
//                  teach: bool, tenant_id, record_type?, record_id?, was_overridden? }
//
// Tenant scoping: client passes tenant_id; we verify the caller is a member.
// Pre-AI rule lookup: for "suggest", we first try active learned rules for the tenant.
// If a rule's input_pattern matches the input we return it directly (no AI call).
// Only when nothing matches do we call the model.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const WORKFLOW_PROMPTS: Record<string, string> = {
  bank_txn_classify:
    `You classify bank-statement transactions into accounting categories.

The "output_action" object you return MUST have this exact shape:
{
  "suggested_type": one of ["sales_deposit","supplier_payment","payroll","bank_fee","transfer","refund","settlement","other"],
  "suggested_category": short human label like "KPay Settlement", "FPS Bank Fee", "Rent", or null
}

Examples:
- "Autopay KPAY MERCHANT SERVICE LIMITED" (money_in > 0)  -> {"suggested_type":"settlement","suggested_category":"KPay Settlement"}
- "FPS Transfer Charge" / "FPS FEE"                       -> {"suggested_type":"bank_fee","suggested_category":"FPS Bank Fee"}
- "SALARY" / "PAYROLL"                                    -> {"suggested_type":"payroll","suggested_category":"Payroll"}
- transfer between own accounts                           -> {"suggested_type":"transfer","suggested_category":"Internal Transfer"}

Be conservative — use "other" only if truly unclear. NEVER return an empty output_action.`,
};

type Caller = { user_id: string; tenant_id: string; role: string; isSuper: boolean };

async function resolveCaller(req: Request, requestedTenantId: string | null): Promise<Caller | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: u } = await userClient.auth.getUser();
  const userId = u?.user?.id;
  if (!userId) return null;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: memberships } = await admin
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", userId);
  if (!memberships || memberships.length === 0) return null;

  const isSuper = memberships.some((m: any) => m.role === "super_admin");
  let tenantId = requestedTenantId;
  if (tenantId) {
    const allowed = isSuper || memberships.some((m: any) => m.tenant_id === tenantId);
    if (!allowed) return null;
  } else {
    tenantId = memberships[0].tenant_id;
  }
  const role = memberships.find((m: any) => m.tenant_id === tenantId)?.role || (isSuper ? "super_admin" : "member");
  return { user_id: userId, tenant_id: tenantId!, role, isSuper };
}

/** Cheap pattern matcher. Supports {contains, equals, regex, eq:{field:value}}.
 * If keys are simple field paths, treat them as equals on input[field]. */
function matchesPattern(pattern: any, input: any): boolean {
  if (!pattern || typeof pattern !== "object") return false;
  const desc = String(input?.description ?? "").toLowerCase();

  if (typeof pattern.contains === "string") {
    if (!desc.includes(pattern.contains.toLowerCase())) return false;
  }
  if (typeof pattern.equals === "string") {
    if (desc !== pattern.equals.toLowerCase()) return false;
  }
  if (typeof pattern.regex === "string") {
    try {
      if (!new RegExp(pattern.regex, "i").test(desc)) return false;
    } catch { return false; }
  }
  if (pattern.eq && typeof pattern.eq === "object") {
    for (const [k, v] of Object.entries(pattern.eq)) {
      if (String(input?.[k] ?? "") !== String(v)) return false;
    }
  }
  // require at least one matcher key to be present
  const known = ["contains", "equals", "regex", "eq"];
  if (!known.some((k) => k in pattern)) return false;
  return true;
}

function outputActionSchema(workflow: string) {
  if (workflow === "bank_txn_classify") {
    return {
      type: "object",
      properties: {
        suggested_type: {
          type: "string",
          enum: ["sales_deposit","supplier_payment","payroll","bank_fee","transfer","refund","settlement","other"],
        },
        suggested_category: { type: ["string", "null"] },
      },
      required: ["suggested_type"],
      additionalProperties: false,
    };
  }
  return { type: "object", additionalProperties: true };
}

function rulePatternSchema() {
  return {
    type: "object",
    properties: {
      contains: { type: "string" },
      equals: { type: "string" },
      regex: { type: "string" },
    },
    additionalProperties: true,
  };
}

async function callAI(systemPrompt: string, userPayload: unknown, workflow: string) {
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
                output_action: outputActionSchema(workflow),
                rule_pattern: rulePatternSchema(),
                confidence: { type: "number", minimum: 0, maximum: 1 },
                rationale: { type: "string" },
              },
              required: ["output_action", "rule_pattern", "confidence"],
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
    const body = await req.json();
    const op = body.op as "suggest" | "apply";
    const domain = String(body.domain || "");
    const workflow = String(body.workflow || "");
    const requestedTenantId = (body.tenant_id as string | undefined) ?? null;

    const ctx = await resolveCaller(req, requestedTenantId);
    if (!ctx) {
      return new Response(JSON.stringify({ error: "unauthorized_or_wrong_tenant" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!domain || !workflow) {
      return new Response(JSON.stringify({ error: "domain and workflow required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (op === "suggest") {
      // Step 1: try active learned rules first.
      const { data: activeRules } = await admin
        .from("ai_learned_rules")
        .select("id, input_pattern, output_action, confidence, hit_count")
        .eq("tenant_id", ctx.tenant_id)
        .eq("domain", domain)
        .eq("workflow", workflow)
        .eq("status", "active")
        .order("hit_count", { ascending: false })
        .limit(200);

      const matched = (activeRules ?? []).find((r) => matchesPattern(r.input_pattern, body.input ?? {}));
      if (matched) {
        return new Response(JSON.stringify({
          suggestion: matched.output_action,
          rule_pattern: matched.input_pattern,
          confidence: Math.max(Number(matched.confidence ?? 0.9), 0.9),
          rationale: "Matched an existing learned rule for this tenant.",
          source: "learned_rule",
          rule_id: matched.id,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Step 2: call AI with few-shot context (top rules + recent confirmed apps).
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
        "You are an assistant that returns structured suggestions."}

You will receive learned_rules, recent_examples and the new input.
Return your answer ONLY by calling the return_suggestion tool. Confidence ∈ [0,1].
The rule_pattern must be a generic trigger like {"contains":"FPS"} that would match similar future inputs — never a copy of the input.`;

      const out = await callAI(systemPrompt, {
        learned_rules: activeRules ?? [],
        recent_examples: recent ?? [],
        input: body.input ?? {},
      });

      return new Response(JSON.stringify({
        suggestion: out.output_action,
        rule_pattern: out.rule_pattern ?? null,
        confidence: out.confidence ?? 0.7,
        rationale: out.rationale ?? "",
        source: "ai_model",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (op === "apply") {
      let ruleId: string | null = body.rule_id ?? null;

      if (body.teach && body.rule_pattern && body.output_action) {
        // Upsert by unique (tenant, domain, workflow, rule_key). The rule_key is
        // computed automatically by a DB trigger from input_pattern + output_action.
        const { data: ins, error: insErr } = await admin
          .from("ai_learned_rules")
          .upsert({
            tenant_id: ctx.tenant_id,
            venue_id: body.venue_id ?? null,
            domain,
            workflow,
            rule_type: body.rule_type ?? null,
            name: body.name ?? null,
            input_pattern: body.rule_pattern,
            output_action: body.output_action,
            confidence: body.confidence ?? 0.85,
            status: "active",
            created_by: ctx.user_id,
            last_used_at: new Date().toISOString(),
          }, { onConflict: "tenant_id,domain,workflow,rule_key" })
          .select("id, hit_count")
          .single();
        if (insErr) throw insErr;
        ruleId = ins.id;
        // Bump counter (separate update to atomically increment)
        await admin
          .from("ai_learned_rules")
          .update({ hit_count: (ins.hit_count ?? 0) + 1, last_used_at: new Date().toISOString() })
          .eq("id", ins.id);
      } else if (ruleId) {
        const { data: r } = await admin
          .from("ai_learned_rules")
          .select("hit_count, tenant_id")
          .eq("id", ruleId)
          .maybeSingle();
        if (r && r.tenant_id === ctx.tenant_id) {
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
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === "rate_limited" ? 429 : msg === "payment_required" ? 402 : 500;
    console.error("ai-classify error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
