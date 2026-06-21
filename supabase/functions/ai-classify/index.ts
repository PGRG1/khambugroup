// Shared AI classification + learning endpoint.
// Operations:
//   POST /  body { op: "suggest",       domain, workflow, input, tenant_id, venue_id?, max_examples? }
//   POST /  body { op: "suggest_batch", domain, workflow, items:[input,...], tenant_id, venue_id?, context? }
//   POST /  body { op: "apply",         domain, workflow, input, output_action, rule_pattern?,
//                                       teach, tenant_id, record_type?, record_id?, was_overridden? }
//
// Tenant scoping: client passes tenant_id; we verify the caller is a member.
// Pre-AI rule lookup: for "suggest"/"suggest_batch", we first try active learned rules for the tenant.
// If a rule's input_pattern matches the input we return it directly (no AI call).
// Only when nothing matches do we call the model. Gemini 2.5 Flash by default;
// Pro fallback is workflow-gated, capped at 1/invoice/workflow, and always logged.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const FLASH_MODEL = "google/gemini-2.5-flash";
const PRO_MODEL = "google/gemini-2.5-pro";

// Workflows allowed to fall back to Pro, with the trigger reason.
const PRO_ALLOWED: Record<string, "validation_failed" | "low_confidence"> = {
  parse_invoice_review: "validation_failed",
  invoice_anomaly: "low_confidence",
};

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

  supplier_match:
    `You match a raw supplier name (and optional address) from a scanned invoice to a known supplier_id.
You will receive an array "candidates" of {id, name, aliases[]}.
Return output_action: { "supplier_id": uuid|null, "supplier_name": string, "alias_to_learn": string|null, "confidence": 0..1 }
- Use null supplier_id if no candidate is a confident match (>0.7).
- alias_to_learn = the raw name string, only if it differs from the matched supplier's canonical name.`,

  line_to_product:
    `You match invoice line items to product_master records.
You will receive "candidates" (array of {id, internal_sku, internal_product_name, supplier_id, item_code, pack_size_norm, unit_norm}) and an array "lines" of normalized line inputs.
For each line return: { line_index, product_master_id|null, internal_sku|null, confidence:0..1, needs_review_reason?: "pack_size_changed"|"unit_changed"|"no_match" }
- Prefer same supplier_id + item_code matches.
- If pack_size_norm or unit_norm of the candidate differs from the line, still return the id but set needs_review_reason.`,

  invoice_categorize:
    `You assign accounting metadata per invoice line.
Return for each line: { line_index, category_id|null, coa_account_id|null, venue|null, inventory_treatment: "consumable"|"resale"|"service"|"capex", confidence:0..1 }
Use the supplied "categories", "coa_accounts" and "venues" arrays. Inventory_treatment defaults to "consumable" for F&B supplies, "resale" for beverages sold to guests, "service" for non-physical, "capex" for equipment.`,

  invoice_anomaly:
    `You detect anomalies on a procurement invoice. You receive {invoice, lines, history_window, duplicates_check}.
Each line has normalized_unit_cost. history_window contains median_90d per (supplier_id, product_master_id).
Return output_action:
{
  "confidence": 0..1,
  "flags": [
    { "type": "duplicate_invoice"|"price_spike"|"price_drop_check"|"qty_outlier"|"unmatched_line"|"credit_note_suspected"|"missing_coding",
      "reason": string,
      "evidence": object,
      "confidence": 0..1,
      "suspected_ref"?: { "invoice_id"?: uuid, "line_id"?: uuid, "product_master_id"?: uuid }
    }
  ]
}
Use evidence with concrete numbers (current_norm_cost, median_90d, n_observations, etc.). Return empty flags array if nothing is wrong.`,
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

// ---------- Pattern matcher ----------
/** Supports {contains, equals, regex, eq:{field:value}, eq_all:{field:value,...}}. */
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
  if (pattern.eq_all && typeof pattern.eq_all === "object") {
    for (const [k, v] of Object.entries(pattern.eq_all)) {
      if (String(input?.[k] ?? "") !== String(v)) return false;
    }
  }
  const known = ["contains", "equals", "regex", "eq", "eq_all"];
  if (!known.some((k) => k in pattern)) return false;
  return true;
}

// ---------- Normalization helpers (line_to_product) ----------
const UNIT_CANON: Record<string, string> = {
  case: "case", cs: "case", ctn: "case", carton: "case", box: "box",
  bottle: "bottle", btl: "bottle", btls: "bottle",
  keg: "keg", bucket: "bucket",
  kg: "kg", kgs: "kg", g: "g",
  lb: "lb", lbs: "lb",
  piece: "piece", pc: "piece", pcs: "piece", ea: "piece", each: "piece",
  dozen: "dozen", doz: "dozen",
  pack: "pack", pk: "pack", bag: "bag", roll: "roll",
  litre: "l", liter: "l", l: "l", ml: "ml",
};

function normalizeUnit(s: string | null | undefined): string {
  if (!s) return "";
  const k = String(s).toLowerCase().replace(/[^\w]/g, "");
  return UNIT_CANON[k] ?? k;
}

function normalizePackSize(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[×x✕]/g, "x")
    .replace(/litre|liter/g, "l");
}

function normalizeDescription(s: string | null | undefined): string {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .replace(/\d+\s*x\s*\d+\s*(ml|l|g|kg|lb|oz)?/gi, "") // strip pack tokens
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePackQty(packNorm: string): number {
  // e.g. "24x330ml" -> 24 ; "4x4lb" -> 4 ; "12" -> 12
  const m = packNorm.match(/^(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 1;
}

function computeNormalizedUnitCost(unitPrice: number, packNorm: string): number | null {
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null;
  const qty = parsePackQty(packNorm || "");
  if (!qty || qty <= 0) return null;
  return Number((unitPrice / qty).toFixed(6));
}

// ---------- Output schemas ----------
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
  if (workflow === "supplier_match") {
    return {
      type: "object",
      properties: {
        supplier_id: { type: ["string", "null"] },
        supplier_name: { type: "string" },
        alias_to_learn: { type: ["string", "null"] },
        confidence: { type: "number" },
      },
      required: ["supplier_name", "confidence"],
      additionalProperties: true,
    };
  }
  if (workflow === "line_to_product") {
    return {
      type: "object",
      properties: {
        product_master_id: { type: ["string", "null"] },
        internal_sku: { type: ["string", "null"] },
        confidence: { type: "number" },
        needs_review_reason: { type: ["string", "null"] },
      },
      required: ["confidence"],
      additionalProperties: true,
    };
  }
  if (workflow === "invoice_categorize") {
    return {
      type: "object",
      properties: {
        category_id: { type: ["string", "null"] },
        coa_account_id: { type: ["string", "null"] },
        venue: { type: ["string", "null"] },
        inventory_treatment: { type: "string", enum: ["consumable", "resale", "service", "capex"] },
        confidence: { type: "number" },
      },
      required: ["confidence"],
      additionalProperties: true,
    };
  }
  if (workflow === "invoice_anomaly") {
    return {
      type: "object",
      properties: {
        confidence: { type: "number" },
        flags: { type: "array", items: { type: "object", additionalProperties: true } },
      },
      required: ["flags", "confidence"],
      additionalProperties: true,
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
      eq: { type: "object", additionalProperties: true },
      eq_all: { type: "object", additionalProperties: true },
    },
    additionalProperties: true,
  };
}

// ---------- AI call ----------
async function callAI(
  systemPrompt: string,
  userPayload: unknown,
  workflow: string,
  model: string,
): Promise<{ args: any; latency_ms: number; tokens?: number }> {
  const t0 = Date.now();
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
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
              required: ["output_action", "confidence"],
              additionalProperties: true,
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
  const tokens = j?.usage?.total_tokens;
  return { args: JSON.parse(args), latency_ms: Date.now() - t0, tokens };
}

/**
 * Run a workflow with Flash, optionally fall back to Pro when:
 *  - workflow is in PRO_ALLOWED, AND
 *  - trigger is "validation_failed" (Flash threw) OR "low_confidence" (returned conf < 0.5)
 *  - AND no Pro call has yet been recorded for (invoice_id, workflow).
 * Always logs to ai_rule_applications via logCall.
 */
async function runWithFallback(opts: {
  admin: any;
  ctx: Caller;
  systemPrompt: string;
  userPayload: any;
  workflow: string;
  domain: string;
  invoiceId?: string | null;
  inputSnapshot: any;
}) {
  const { admin, ctx, systemPrompt, userPayload, workflow, domain, invoiceId, inputSnapshot } = opts;

  let flashResult: any = null;
  let flashError: any = null;
  let flashLatency = 0;
  let flashTokens: number | undefined;

  try {
    const r = await callAI(systemPrompt, userPayload, workflow, FLASH_MODEL);
    flashResult = r.args;
    flashLatency = r.latency_ms;
    flashTokens = r.tokens;
  } catch (e) {
    flashError = e instanceof Error ? e.message : String(e);
  }

  const proTrigger = PRO_ALLOWED[workflow];
  const lowConf =
    flashResult &&
    typeof flashResult.confidence === "number" &&
    flashResult.confidence < 0.5;

  let usePro = false;
  if (proTrigger === "validation_failed" && flashError) usePro = true;
  if (proTrigger === "low_confidence" && lowConf) usePro = true;

  // Cap: at most 1 Pro call per (invoice_id, workflow)
  if (usePro && invoiceId) {
    const { count } = await admin
      .from("ai_rule_applications")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", ctx.tenant_id)
      .eq("domain", domain)
      .eq("workflow", workflow)
      .eq("record_id", invoiceId)
      .contains("input_snapshot", { _model_used: PRO_MODEL });
    if ((count ?? 0) > 0) usePro = false;
  }

  let finalResult = flashResult;
  let modelUsed = FLASH_MODEL;
  let proLatency = 0;
  let proTokens: number | undefined;

  if (usePro) {
    try {
      const r = await callAI(systemPrompt, userPayload, workflow, PRO_MODEL);
      finalResult = r.args;
      modelUsed = PRO_MODEL;
      proLatency = r.latency_ms;
      proTokens = r.tokens;
    } catch (e) {
      if (!flashResult) throw e;
      // Pro failed but Flash worked — keep Flash result.
    }
  } else if (flashError && !flashResult) {
    throw new Error(flashError);
  }

  // Audit log
  try {
    await admin.from("ai_rule_applications").insert({
      tenant_id: ctx.tenant_id,
      domain,
      workflow,
      record_type: "invoice",
      record_id: invoiceId ?? null,
      applied_by: ctx.user_id,
      was_overridden: false,
      input_snapshot: {
        ...inputSnapshot,
        _model_used: modelUsed,
        _flash_error: flashError ?? null,
        _pro_used: modelUsed === PRO_MODEL,
        _latency_ms: modelUsed === PRO_MODEL ? proLatency : flashLatency,
        _tokens: modelUsed === PRO_MODEL ? proTokens : flashTokens,
      },
      output_snapshot: finalResult?.output_action ?? {},
    });
  } catch { /* non-fatal */ }

  return { result: finalResult, model_used: modelUsed };
}

// ---------- Per-workflow context loaders ----------
async function loadAnomalyHistory(admin: any, supplierId: string | null, productIds: string[]) {
  if (!supplierId || productIds.length === 0) return [];
  const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const { data } = await admin
    .from("invoice_line_items")
    .select("product_master_id, normalized_unit_cost, invoices!inner(invoice_date, supplier_id)")
    .in("product_master_id", productIds)
    .gte("invoices.invoice_date", cutoff)
    .eq("invoices.supplier_id", supplierId)
    .not("normalized_unit_cost", "is", null)
    .limit(5000);
  const byProduct: Record<string, number[]> = {};
  for (const r of data ?? []) {
    const pid = r.product_master_id as string;
    const c = Number(r.normalized_unit_cost);
    if (!byProduct[pid]) byProduct[pid] = [];
    byProduct[pid].push(c);
  }
  const out: Array<{ product_master_id: string; median_90d: number; n_observations: number }> = [];
  for (const [pid, arr] of Object.entries(byProduct)) {
    arr.sort((a, b) => a - b);
    const mid = arr.length >> 1;
    const median = arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
    out.push({ product_master_id: pid, median_90d: Number(median.toFixed(6)), n_observations: arr.length });
  }
  return out;
}

async function loadDuplicateCheck(admin: any, supplierId: string | null, invoiceNumber: string | null, excludeInvoiceId: string | null) {
  if (!supplierId || !invoiceNumber) return null;
  const { data } = await admin
    .from("invoices")
    .select("id, invoice_number, invoice_date, total_amount")
    .eq("supplier_id", supplierId)
    .eq("invoice_number", invoiceNumber)
    .neq("id", excludeInvoiceId ?? "00000000-0000-0000-0000-000000000000")
    .limit(3);
  return data && data.length > 0 ? data : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const op = body.op as "suggest" | "suggest_batch" | "apply";
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

    // ============= SUGGEST (single) =============
    if (op === "suggest") {
      const { data: activeRules } = await admin
        .from("ai_learned_rules")
        .select("id, input_pattern, output_action, confidence, hit_count")
        .eq("tenant_id", ctx.tenant_id)
        .eq("domain", domain)
        .eq("workflow", workflow)
        .eq("status", "active")
        .order("hit_count", { ascending: false })
        .limit(500);

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

      const { data: recent } = await admin
        .from("ai_rule_applications")
        .select("input_snapshot, output_snapshot")
        .eq("tenant_id", ctx.tenant_id)
        .eq("domain", domain)
        .eq("workflow", workflow)
        .eq("was_overridden", false)
        .order("created_at", { ascending: false })
        .limit(Math.min(Number(body.max_examples) || 25, 50));

      const systemPrompt = `${WORKFLOW_PROMPTS[workflow] ?? "You are an assistant that returns structured suggestions."}

You will receive learned_rules, recent_examples and the new input.
Return your answer ONLY by calling the return_suggestion tool. Confidence ∈ [0,1].
The rule_pattern must be a generic trigger that would match similar future inputs.`;

      const userPayload = {
        learned_rules: activeRules ?? [],
        recent_examples: recent ?? [],
        input: body.input ?? {},
        context: body.context ?? null,
      };

      const { result, model_used } = await runWithFallback({
        admin, ctx, systemPrompt, userPayload, workflow, domain,
        invoiceId: body.invoice_id ?? null,
        inputSnapshot: body.input ?? {},
      });

      return new Response(JSON.stringify({
        suggestion: result.output_action,
        rule_pattern: result.rule_pattern ?? null,
        confidence: result.confidence ?? 0.7,
        rationale: result.rationale ?? "",
        source: "ai_model",
        model_used,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ============= SUGGEST_BATCH =============
    // For per-line workflows. Items resolved against learned rules first;
    // unmatched residue goes to a single Flash call.
    if (op === "suggest_batch") {
      const items: any[] = Array.isArray(body.items) ? body.items : [];
      if (items.length === 0) {
        return new Response(JSON.stringify({ results: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Pre-normalize line_to_product items so rule lookup is consistent.
      const prepared = items.map((raw, idx) => {
        if (workflow === "line_to_product") {
          const pack_size_norm = normalizePackSize(raw.pack_size);
          const unit_norm = normalizeUnit(raw.unit);
          const description_norm = normalizeDescription(raw.description);
          return {
            line_index: idx,
            ...raw,
            pack_size_norm,
            unit_norm,
            description_norm,
            normalized_unit_cost: computeNormalizedUnitCost(Number(raw.unit_price) || 0, pack_size_norm),
          };
        }
        return { line_index: idx, ...raw };
      });

      const { data: activeRules } = await admin
        .from("ai_learned_rules")
        .select("id, input_pattern, output_action, confidence, hit_count")
        .eq("tenant_id", ctx.tenant_id)
        .eq("domain", domain)
        .eq("workflow", workflow)
        .eq("status", "active")
        .order("hit_count", { ascending: false })
        .limit(2000);

      const results: any[] = new Array(prepared.length).fill(null);
      const unmatched: any[] = [];

      for (const item of prepared) {
        const matched = (activeRules ?? []).find((r) => matchesPattern(r.input_pattern, item));
        if (matched) {
          // For line_to_product, validate pack_size / unit against the rule eq_all values.
          let needs_review_reason: string | null = null;
          if (workflow === "line_to_product" && matched.input_pattern?.eq_all) {
            const eq = matched.input_pattern.eq_all;
            if (eq.pack_size_norm && eq.pack_size_norm !== item.pack_size_norm) needs_review_reason = "pack_size_changed";
            else if (eq.unit_norm && eq.unit_norm !== item.unit_norm) needs_review_reason = "unit_changed";
          }
          results[item.line_index] = {
            line_index: item.line_index,
            source: "learned_rule",
            rule_id: matched.id,
            rule_pattern: matched.input_pattern,
            suggestion: needs_review_reason
              ? { ...matched.output_action, needs_review_reason }
              : matched.output_action,
            confidence: needs_review_reason ? 0.5 : Math.max(Number(matched.confidence ?? 0.9), 0.9),
            normalized_unit_cost: item.normalized_unit_cost ?? null,
            pack_size_norm: item.pack_size_norm ?? null,
            unit_norm: item.unit_norm ?? null,
          };
        } else {
          unmatched.push(item);
        }
      }

      let modelUsed: string | null = null;
      if (unmatched.length > 0) {
        const systemPrompt = `${WORKFLOW_PROMPTS[workflow] ?? "You assign structured metadata for each item."}

You will receive context (candidates, categories, etc.) and an array "lines".
Return ONLY by calling return_suggestion with output_action = { "items": [ {line_index, ...per-line fields} ] }`;
        const userPayload = {
          context: body.context ?? null,
          lines: unmatched,
        };
        const r = await runWithFallback({
          admin, ctx, systemPrompt, userPayload, workflow, domain,
          invoiceId: body.invoice_id ?? null,
          inputSnapshot: { batch_size: unmatched.length },
        });
        modelUsed = r.model_used;
        const items = r.result?.output_action?.items ?? [];
        for (const it of items) {
          const idx = Number(it.line_index);
          const orig = prepared.find((p) => p.line_index === idx);
          if (orig) {
            results[idx] = {
              line_index: idx,
              source: "ai_model",
              suggestion: it,
              confidence: Number(it.confidence ?? 0.7),
              normalized_unit_cost: orig.normalized_unit_cost ?? null,
              pack_size_norm: orig.pack_size_norm ?? null,
              unit_norm: orig.unit_norm ?? null,
            };
          }
        }
      }

      return new Response(JSON.stringify({ results, model_used: modelUsed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============= APPLY =============
    if (op === "apply") {
      let ruleId: string | null = body.rule_id ?? null;

      if (body.teach && body.rule_pattern && body.output_action) {
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

// Exported for the orchestrator side if needed in the future.
export { normalizePackSize, normalizeUnit, normalizeDescription, computeNormalizedUnitCost, loadAnomalyHistory, loadDuplicateCheck };
