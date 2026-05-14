// AI-powered bank transaction classifier that learns from user-confirmed examples and active rules.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUGGESTED_TYPES = [
  "kpay_settlement", "bank_fee", "customer_receipt", "supplier_payment",
  "internal_transfer", "reversal", "cash_deposit", "utility_payment", "interest_income",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { description, money_in, money_out } = await req.json();
    if (!description || typeof description !== "string") {
      return new Response(JSON.stringify({ error: "description required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    // Pull existing rules + recent confirmed transactions as few-shot context
    const [{ data: rules }, { data: confirmed }] = await Promise.all([
      sb.from("bank_recon_rules").select("name, match_contains, suggested_type, suggested_category").eq("is_active", true).order("sort_order").limit(50),
      sb.from("bank_transactions")
        .select("description, suggested_type, money_in, money_out")
        .eq("status", "matched")
        .not("suggested_type", "is", null)
        .order("updated_at", { ascending: false })
        .limit(40),
    ]);

    const rulesText = (rules ?? []).map((r: any) => `- if description contains "${r.match_contains}" → ${r.suggested_type}${r.suggested_category ? " ("+r.suggested_category+")" : ""}`).join("\n");
    const examples = (confirmed ?? []).slice(0, 25).map((t: any) =>
      `desc: "${(t.description||"").slice(0,120)}"  in:${t.money_in} out:${t.money_out} → ${t.suggested_type}`
    ).join("\n");

    const sys = `You categorize Hong Kong bank statement transactions for KHAMBU group F&B.
Allowed types: ${SUGGESTED_TYPES.join(", ")}.
Bank fees (FPS OUT FEE, wire fees, charges) → bank_fee, post to non-operating expense COA 7110.
Return ONLY JSON: {"suggested_type":"...","suggested_category":"...","confidence":0..1,"reason":"...","rule_pattern":"<short uppercase substring that uniquely identifies this txn family for future matches>"}`;

    const user = `KNOWN RULES:
${rulesText || "(none yet)"}

RECENT CONFIRMED EXAMPLES:
${examples || "(none yet)"}

CLASSIFY:
desc: "${description}"  in: ${money_in ?? 0}  out: ${money_out ?? 0}`;

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return new Response(JSON.stringify({ error: `AI gateway: ${resp.status} ${t}` }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const json = await resp.json();
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { reason: raw }; }
    if (parsed.suggested_type && !SUGGESTED_TYPES.includes(parsed.suggested_type)) parsed.suggested_type = null;

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
