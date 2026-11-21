// Bani conversation evals. Runs each case against the deployed chat-assistant for the isolated
// QA tenant only (AGENTS.md), then has a judge model score each transcript against the case's
// good/bad notes. Prints a markdown report; keep two reports to compare before/after a change.
//
//   SUPABASE_URL=… SUPABASE_ANON_KEY=… BANI_QA_JWT=<QA user access token> LOVABLE_API_KEY=… \
//   node scripts/bani-evals/run.mjs > before.md
//
// Read-only by design: cases never confirm cards, and the QA tenant is the only target.
import { readFileSync } from "node:fs";

const QA_TENANT = "ff000000-0000-4000-8000-000000000001";
const { SUPABASE_URL, SUPABASE_ANON_KEY, BANI_QA_JWT, LOVABLE_API_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !BANI_QA_JWT) { console.error("Set SUPABASE_URL, SUPABASE_ANON_KEY and BANI_QA_JWT (QA tenant user)."); process.exit(1); }
const cases = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8"));
const only = process.argv[2];

async function ask(messages) {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/chat-assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${BANI_QA_JWT}` },
    body: JSON.stringify({ messages, tenant_id: QA_TENANT, floating: true }),
  });
  const text = await r.text();
  let out = "", cards = [], tools = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    try {
      const e = JSON.parse(line.slice(6));
      out += e.choices?.[0]?.delta?.content ?? "";
      if (e.action?.type === "action_card") cards.push(e.action.title);
      if (e.status) tools.push(e.status);
    } catch { /* keep going */ }
  }
  return { reply: out.trim() || `(HTTP ${r.status}) ${text.slice(0, 200)}`, cards, tools };
}

async function judge(c, transcript) {
  if (!LOVABLE_API_KEY) return { score: null, notes: "no judge key" };
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({ model: "openai/gpt-6-astra", messages: [
      { role: "system", content: "Score an assistant transcript 1-5 for helpfulness and intelligence (5 = what an excellent human assistant would do). Use the good/bad notes. Reply as JSON {\"score\":n,\"notes\":\"one line\"}." },
      { role: "user", content: JSON.stringify({ good: c.good, bad: c.bad, transcript }) },
    ] }),
  });
  try { const d = await r.json(); return JSON.parse(d.choices[0].message.content.replace(/^```json|```$/g, "")); } catch { return { score: null, notes: "judge failed" }; }
}

const rows = [];
for (const c of cases.filter(c => !only || c.id === only)) {
  const messages = [], transcript = [];
  for (const q of c.ask) {
    messages.push({ role: "user", content: q });
    const a = await ask(messages);
    messages.push({ role: "assistant", content: a.reply });
    transcript.push({ user: q, bani: a.reply, cards: a.cards, steps: a.tools });
  }
  const j = await judge(c, transcript);
  rows.push({ c, transcript, j });
  console.error(`${c.id}: ${j.score ?? "-"}`);
}
const avg = rows.filter(r => r.j.score != null).reduce((n, r, _, a) => n + r.j.score / a.length, 0);
console.log(`# Bani evals · ${new Date().toISOString().slice(0, 16)} · average ${avg ? avg.toFixed(2) : "-"}\n`);
for (const { c, transcript, j } of rows) {
  console.log(`## ${c.id} · ${j.score ?? "-"}/5 · ${j.notes ?? ""}\n`);
  for (const t of transcript) console.log(`**You:** ${t.user}\n\n**Bani:** ${t.bani}${t.cards.length ? `\n\n_Cards: ${t.cards.join(", ")}_` : ""}\n`);
}
