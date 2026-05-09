// AI-assisted matcher: settlement batches → bank deposits.
// Strategy:
//   1. For each unmatched batch, prefilter bank txns on the merchant's default
//      bank account, money_in only, within ±N days of settlement_date.
//   2. If exactly one candidate's amount equals net_settlement (±0.01) → auto-match (high).
//   3. If several near-matches → ask Lovable AI to pick the best one with reasoning.
//   4. Return suggestions; the client decides which to apply.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const round2 = (n: number) => Math.round(n * 100) / 100;
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

type Suggestion = {
  batch_id: string;
  bank_transaction_id: string | null;
  confidence: "high" | "medium" | "low" | "none";
  reason: string;
  amount_delta: number | null;
  date_delta_days: number | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const { processor_id, batch_ids, day_window = 5, apply = false, suggestions: incoming } =
      await req.json().catch(() => ({}));

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ---------- APPLY mode ----------
    if (apply && Array.isArray(incoming) && incoming.length > 0) {
      let applied = 0;
      for (const s of incoming as Suggestion[]) {
        if (!s.batch_id || !s.bank_transaction_id) continue;
        const { error: e1 } = await sb
          .from("payment_settlement_batches")
          .update({ bank_transaction_id: s.bank_transaction_id, status: "matched" })
          .eq("id", s.batch_id);
        if (e1) continue;
        await sb
          .from("bank_transactions")
          .update({
            matched_record_type: "settlement_batch",
            matched_record_id: s.batch_id,
            status: "matched",
            match_confidence: s.confidence,
          })
          .eq("id", s.bank_transaction_id);
        applied += 1;
      }
      return json({ applied });
    }

    // ---------- SUGGEST mode ----------
    if (!processor_id) return json({ error: "processor_id required" }, 400);

    // Pull unmatched batches for the processor
    let q = sb
      .from("payment_settlement_batches")
      .select("id, merchant_id, settlement_date, transaction_date, net_settlement, status, bank_transaction_id")
      .eq("processor_id", processor_id)
      .is("bank_transaction_id", null);
    if (Array.isArray(batch_ids) && batch_ids.length > 0) q = q.in("id", batch_ids);
    const { data: batches, error: bErr } = await q;
    if (bErr) return json({ error: bErr.message }, 500);
    if (!batches || batches.length === 0) return json({ suggestions: [] });

    const merchantIds = [...new Set(batches.map((b) => b.merchant_id))];
    const { data: merchants } = await sb
      .from("payment_processor_merchants")
      .select("id, display_name, default_bank_account_id, merchant_number")
      .in("id", merchantIds);
    const merchantById = new Map((merchants || []).map((m) => [m.id, m]));

    const bankAcctIds = [...new Set((merchants || []).map((m) => m.default_bank_account_id).filter(Boolean))];
    if (bankAcctIds.length === 0) {
      return json({
        suggestions: batches.map((b) => ({
          batch_id: b.id, bank_transaction_id: null, confidence: "none",
          reason: "Merchant has no default bank account. Set it under Merchants.",
          amount_delta: null, date_delta_days: null,
        })),
      });
    }

    // Pull candidate bank txns: money_in > 0, in matching accounts, within max date span of any batch
    const dates = batches.map((b) => b.settlement_date).sort();
    const minDate = addDays(dates[0], -day_window);
    const maxDate = addDays(dates[dates.length - 1], day_window);

    const { data: txns } = await sb
      .from("bank_transactions")
      .select("id, bank_account_id, txn_date, money_in, money_out, description, reference, status, matched_record_id")
      .in("bank_account_id", bankAcctIds)
      .gte("txn_date", minDate)
      .lte("txn_date", maxDate)
      .gt("money_in", 0);

    const allTxns = txns || [];

    const suggestions: Suggestion[] = [];

    for (const b of batches) {
      const merchant = merchantById.get(b.merchant_id);
      const acctId = merchant?.default_bank_account_id;
      if (!acctId) {
        suggestions.push({
          batch_id: b.id, bank_transaction_id: null, confidence: "none",
          reason: `${merchant?.display_name || "Merchant"} has no default bank account.`,
          amount_delta: null, date_delta_days: null,
        });
        continue;
      }
      const target = round2(Number(b.net_settlement || 0));
      const settleDate = b.settlement_date;

      // Prefilter: same account, money_in within tolerance, date within ±day_window, not already matched to a different record
      const candidates = allTxns
        .filter((t) => t.bank_account_id === acctId)
        .filter((t) => !t.matched_record_id || t.matched_record_id === b.id)
        .map((t) => {
          const amt = round2(Number(t.money_in || 0));
          const dDays = Math.round(
            (new Date(t.txn_date + "T00:00:00Z").getTime() - new Date(settleDate + "T00:00:00Z").getTime()) /
              86_400_000,
          );
          return { ...t, amt, dDays, dAmt: round2(amt - target) };
        })
        .filter((t) => Math.abs(t.dDays) <= day_window)
        .sort((a, b) => Math.abs(a.dAmt) - Math.abs(b.dAmt) || Math.abs(a.dDays) - Math.abs(b.dDays))
        .slice(0, 8);

      // Exact unique match → high confidence, skip AI
      const exact = candidates.filter((c) => Math.abs(c.dAmt) <= 0.01);
      if (exact.length === 1) {
        const t = exact[0];
        suggestions.push({
          batch_id: b.id, bank_transaction_id: t.id, confidence: "high",
          reason: `Exact amount match (HK$ ${target.toFixed(2)}) on ${t.txn_date} (${t.dDays >= 0 ? "+" : ""}${t.dDays}d).`,
          amount_delta: 0, date_delta_days: t.dDays,
        });
        continue;
      }
      if (candidates.length === 0) {
        suggestions.push({
          batch_id: b.id, bank_transaction_id: null, confidence: "none",
          reason: `No bank deposit on ${merchant?.display_name} account within ±${day_window} days of ${settleDate}.`,
          amount_delta: null, date_delta_days: null,
        });
        continue;
      }

      // Ambiguous → ask AI
      if (!LOVABLE_API_KEY) {
        const t = candidates[0];
        suggestions.push({
          batch_id: b.id,
          bank_transaction_id: Math.abs(t.dAmt) <= 1 ? t.id : null,
          confidence: Math.abs(t.dAmt) <= 1 ? "medium" : "low",
          reason: `Closest deposit HK$ ${t.amt.toFixed(2)} on ${t.txn_date} (Δ HK$ ${t.dAmt.toFixed(2)}, ${t.dDays >= 0 ? "+" : ""}${t.dDays}d).`,
          amount_delta: t.dAmt, date_delta_days: t.dDays,
        });
        continue;
      }

      try {
        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content:
                  "You match a payment-processor settlement batch to a single incoming bank deposit. Prefer exact amount; small fee deductions (<1% or <HK$10) are OK. Closer date = better. Reject if no plausible match.",
              },
              {
                role: "user",
                content: JSON.stringify({
                  batch: {
                    merchant: merchant?.display_name,
                    merchant_number: merchant?.merchant_number,
                    settlement_date: settleDate,
                    transaction_date: b.transaction_date,
                    net_settlement: target,
                  },
                  candidates: candidates.map((c) => ({
                    id: c.id,
                    txn_date: c.txn_date,
                    amount: c.amt,
                    amount_delta: c.dAmt,
                    date_delta_days: c.dDays,
                    description: c.description,
                    reference: c.reference,
                  })),
                }),
              },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "pick_match",
                  description: "Pick the best bank transaction or none.",
                  parameters: {
                    type: "object",
                    properties: {
                      bank_transaction_id: { type: ["string", "null"] },
                      confidence: { type: "string", enum: ["high", "medium", "low", "none"] },
                      reason: { type: "string" },
                    },
                    required: ["bank_transaction_id", "confidence", "reason"],
                    additionalProperties: false,
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "pick_match" } },
          }),
        });

        if (aiResp.status === 429 || aiResp.status === 402) {
          return json(
            { error: aiResp.status === 429 ? "AI rate limit reached, try again shortly." : "Add credits to Lovable AI to continue." },
            aiResp.status,
          );
        }
        const aiJson = await aiResp.json();
        const args = aiJson?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        const picked = args ? JSON.parse(args) : null;
        const matchedTxn = picked?.bank_transaction_id ? candidates.find((c) => c.id === picked.bank_transaction_id) : null;
        suggestions.push({
          batch_id: b.id,
          bank_transaction_id: picked?.bank_transaction_id || null,
          confidence: (picked?.confidence as Suggestion["confidence"]) || "low",
          reason: picked?.reason || "AI suggestion",
          amount_delta: matchedTxn?.dAmt ?? null,
          date_delta_days: matchedTxn?.dDays ?? null,
        });
      } catch (e) {
        const t = candidates[0];
        suggestions.push({
          batch_id: b.id, bank_transaction_id: null, confidence: "low",
          reason: `AI error: ${e instanceof Error ? e.message : "unknown"}. Closest deposit Δ HK$ ${t.dAmt.toFixed(2)}.`,
          amount_delta: t.dAmt, date_delta_days: t.dDays,
        });
      }
    }

    return json({ suggestions });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
