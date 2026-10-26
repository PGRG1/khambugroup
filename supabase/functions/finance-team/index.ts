// "Your Finance Team" — generates immutable review snapshots and answers grounded questions.
// Modes:
//   run       (user JWT)            → deterministic review + optional AI interpretation
//   ask       (user JWT)            → grounded Q&A on one saved review (optional `role` voices one specialist)
//   scheduled (x-scheduler-token)   → hourly sweep of due schedule preferences (pg_cron)
// Never writes to purchasing, payroll, payments or ledger tables.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireAuth, resolveTenant } from "../_shared/auth.ts";
import {
  buildSpecialists, deterministicSynthesis, evaluatePriorActions, localParts, mergeAiSynthesis, reviewPeriod, addDays,
  ungroundedNumbers, validateAiSynthesis, type ReviewType, type SpecialistReport, type SpecialistRole, type ReviewInput, type WorkDoneItem,
} from "../_shared/financeTeamReview.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const MODEL = "openai/gpt-6-astra";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isUuid = (s: unknown) => typeof s === "string" && /^[0-9a-f-]{36}$/i.test(s);

type Admin = ReturnType<typeof createClient>;

async function fetchAll(build: (from: number, to: number) => any): Promise<any[]> {
  const out: any[] = [];
  for (let off = 0; ; off += 1000) {
    const { data, error } = await build(off, off + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const SALES_COLS = "date,venue_id,subtotal,service_charge,discount,total_sales,guests,visa,mastercard,amex,union_pay,jcb,alipay,wechat,payme,cash,deliveroo,foodpanda,keeta,card_tips";
const INV_COLS = "id,invoice_date,due_date,status,payment_status,total_amount,remaining_balance,amount_paid,has_disputes,disputed_amount,voided_at,suppliers(name)";

async function countSince(admin: Admin, table: string, tenantId: string, sinceIso: string, col = "created_at"): Promise<number> {
  const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte(col, sinceIso);
  if (error) return 0;
  return count ?? 0;
}

async function loadInput(admin: Admin, tenantId: string, venueId: string | null, type: ReviewType, endDate: string, asOf: string): Promise<ReviewInput> {
  const p = reviewPeriod(type, endDate);
  const scoped = (q: any) => (venueId ? q.eq("venue_id", venueId) : q);
  const sales = (a: string, b: string) => fetchAll((f, t) => scoped(admin.from("sales_records").select(SALES_COLS).eq("tenant_id", tenantId).gte("date", a).lte("date", b)).range(f, t));
  const invs = (a: string, b: string) => fetchAll((f, t) => scoped(admin.from("invoices").select(INV_COLS).eq("tenant_id", tenantId).gte("invoice_date", a).lte("invoice_date", b)).range(f, t));
  const mapInv = (r: any) => ({ ...r, supplier_name: r.suppliers?.name ?? null });
  const monthStart = `${asOf.slice(0, 7)}-01`;
  const dayOfMonth = Number(asOf.slice(8, 10));
  const prevMonthDate = new Date(`${monthStart}T00:00:00Z`);
  prevMonthDate.setUTCMonth(prevMonthDate.getUTCMonth() - 1);
  const prevMonthStart = prevMonthDate.toISOString().slice(0, 10);
  const prevMonthEnd = addDays(prevMonthStart, dayOfMonth - 1);
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const nextWeekEnd = addDays(asOf, 7);
  const twoWeeksAgo = addDays(asOf, -14);
  const sixtyDaysAgo = addDays(asOf, -60);
  const fourMonthsAgo = `${addDays(monthStart, -120).slice(0, 7)}-01`;

  const notesP = fetchAll((f, t) => {
    let q = admin.from("sales_record_notes").select("tag,body,sales_records!inner(date,venue_id)").eq("tenant_id", tenantId)
      .gte("sales_records.date", p.periodStart).lte("sales_records.date", p.periodEnd);
    if (venueId) q = q.eq("sales_records.venue_id", venueId);
    return q.range(f, t);
  }).catch(() => [] as any[]);
  const closedP = fetchAll((f, t) => {
    let q = admin.from("venue_closed_days").select("venue_id,date").eq("tenant_id", tenantId).gte("date", p.periodStart).lte("date", p.periodEnd);
    if (venueId) q = q.eq("venue_id", venueId);
    return q.range(f, t);
  }).catch(() => [] as any[]);
  const closuresP = fetchAll((f, t) => {
    let q = admin.from("venue_closures").select("venue_id,date").eq("tenant_id", tenantId).gte("date", p.periodStart).lte("date", p.periodEnd);
    if (venueId) q = q.eq("venue_id", venueId);
    return q.range(f, t);
  }).catch(() => [] as any[]);
  const rulesP = fetchAll((f, t) => {
    let q = admin.from("venue_closure_rules").select("venue_id,weekday,start_date,end_date").eq("tenant_id", tenantId).lte("start_date", p.periodEnd);
    if (venueId) q = q.eq("venue_id", venueId);
    return q.range(f, t);
  }).catch(() => [] as any[]);
  const allClosedDays = async () => {
    const out = [...((await closedP) as any[]), ...((await closuresP) as any[])];
    for (const r of (await rulesP) as any[]) {
      for (let d = p.periodStart; d <= p.periodEnd; d = addDays(d, 1)) {
        if (d < r.start_date || (r.end_date && d > r.end_date)) continue;
        if (r.weekday == null ? !r.end_date : new Date(`${d}T00:00:00Z`).getUTCDay() !== r.weekday) continue;
        out.push({ venue_id: r.venue_id, date: d });
      }
    }
    return out;
  };
  const [s, cs, inv, cinv, open, bills, accts, venues, priceInvs, payroll, leave, employees, nextShifts, recentShifts, attendance, billsMtd, billsPrevMtd, batches, salesMonths] = await Promise.all([
    sales(p.periodStart, p.periodEnd), sales(p.comparisonStart, p.comparisonEnd),
    invs(p.periodStart, p.periodEnd), invs(p.comparisonStart, p.comparisonEnd),
    fetchAll((f, t) => scoped(admin.from("invoices").select(INV_COLS).eq("tenant_id", tenantId).neq("payment_status", "paid")).range(f, t)),
    fetchAll((f, t) => scoped(admin.from("expense_bills").select("id,bill_date,due_date,approval_status,payment_status,total_amount,paid_amount,reversed_at").eq("tenant_id", tenantId).neq("payment_status", "paid")).range(f, t)),
    fetchAll((f, t) => scoped(admin.from("bank_accounts").select("id,account_name,last_reconciled_date").eq("tenant_id", tenantId).eq("is_active", true)).range(f, t)),
    fetchAll((f, t) => admin.from("venues").select("id,name,is_active").eq("tenant_id", tenantId).range(f, t)),
    fetchAll((f, t) => scoped(admin.from("invoices").select("id,invoice_date,suppliers(name)").eq("tenant_id", tenantId).gte("invoice_date", sixtyDaysAgo).is("voided_at", null)).range(f, t)),
    fetchAll((f, t) => admin.from("hr_payroll").select("year,month,employee_id,actual_total,forecast_total").eq("tenant_id", tenantId).range(f, t)),
    fetchAll((f, t) => admin.from("hr_leave_requests").select("id,status,start_date,end_date,days").eq("tenant_id", tenantId).range(f, t)),
    fetchAll((f, t) => admin.from("hr_employees").select("id,venue_id,status").eq("tenant_id", tenantId).range(f, t)),
    fetchAll((f, t) => admin.from("hr_shifts").select("shift_date,employee_id,actual_hours_worked,variance_minutes,no_show").eq("tenant_id", tenantId).gt("shift_date", asOf).lte("shift_date", nextWeekEnd).range(f, t)),
    fetchAll((f, t) => admin.from("hr_shifts").select("shift_date,employee_id,actual_hours_worked,variance_minutes,no_show").eq("tenant_id", tenantId).gte("shift_date", twoWeeksAgo).lte("shift_date", asOf).range(f, t)),
    fetchAll((f, t) => admin.from("hr_attendance").select("date,hours_worked,overtime_hours").eq("tenant_id", tenantId).gte("date", twoWeeksAgo).lte("date", asOf).range(f, t)),
    fetchAll((f, t) => scoped(admin.from("expense_bills").select("bill_date,total_amount,department,reversed_at").eq("tenant_id", tenantId).gte("bill_date", monthStart).lte("bill_date", asOf)).range(f, t)),
    fetchAll((f, t) => scoped(admin.from("expense_bills").select("bill_date,total_amount,department,reversed_at").eq("tenant_id", tenantId).gte("bill_date", prevMonthStart).lte("bill_date", prevMonthEnd)).range(f, t)),
    fetchAll((f, t) => admin.from("payment_settlement_batches").select("id,settlement_date,net_settlement,bank_transaction_id,status").eq("tenant_id", tenantId).lte("settlement_date", asOf).range(f, t)),
    fetchAll((f, t) => scoped(admin.from("sales_records").select("date,subtotal,service_charge").eq("tenant_id", tenantId).gte("date", fourMonthsAgo).lt("date", monthStart)).range(f, t)),
  ]);

  const bankAccounts = await Promise.all(accts.map(async (a: any) => {
    const { data: last } = await admin.from("bank_transactions").select("txn_date,running_balance").eq("tenant_id", tenantId).eq("bank_account_id", a.id).order("txn_date", { ascending: false }).limit(1).maybeSingle();
    const { count } = await admin.from("bank_transactions").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("bank_account_id", a.id).eq("status", "unmatched").gte("txn_date", p.periodStart).lte("txn_date", p.periodEnd);
    return { id: a.id, account_name: a.account_name, last_reconciled_date: a.last_reconciled_date, latest_txn_date: (last as any)?.txn_date ?? null,
      latest_running_balance: (last as any)?.running_balance ?? null, unmatched_in_period: count ?? 0 };
  }));

  // Price history: lines of last-60-day invoices with a matched product.
  const invMeta = new Map((priceInvs as any[]).map((i) => [i.id, { date: i.invoice_date, supplier: i.suppliers?.name ?? "Unknown supplier" }]));
  const invIds = [...invMeta.keys()];
  let priceLines: ReviewInput["priceLines"] = [];
  if (invIds.length) {
    const lines = await fetchAll((f, t) => admin.from("invoice_line_items")
      .select("invoice_id,description,scanned_description,quantity,unit_price,net_unit_cost,standard_product_id,product_master_id")
      .eq("tenant_id", tenantId).in("invoice_id", invIds.slice(0, 500)).range(f, t));
    priceLines = (lines as any[])
      .map((l) => {
        const meta = invMeta.get(l.invoice_id);
        const key = l.standard_product_id ?? l.product_master_id;
        const price = l.net_unit_cost ?? l.unit_price;
        if (!meta || !key || price == null) return null;
        return { product_key: String(key), item_label: l.scanned_description || l.description || "Item", supplier_name: meta.supplier,
          invoice_date: meta.date, unit_price: Number(price), quantity: Number(l.quantity) || 0 };
      })
      .filter(Boolean) as ReviewInput["priceLines"];
  }

  // Revenue per calendar month (for staff-cost ratio).
  const byMonth = new Map<string, number>();
  for (const r of salesMonths as any[]) {
    const k = r.date.slice(0, 7);
    byMonth.set(k, (byMonth.get(k) ?? 0) + (Number(r.subtotal) || 0) + (Number(r.service_charge) || 0));
  }
  const salesByMonth = [...byMonth.entries()].map(([k, revenue]) => ({ year: Number(k.slice(0, 4)), month: Number(k.slice(5, 7)), revenue }));

  // Work done in the last 24h (real counts only).
  const [salesNew, invNew, billsNew, paymentsNew, shiftsNew, leaveNew, bankMatched, stmtImports] = await Promise.all([
    countSince(admin, "sales_records", tenantId, since24h),
    countSince(admin, "invoices", tenantId, since24h),
    countSince(admin, "expense_bills", tenantId, since24h),
    countSince(admin, "payments", tenantId, since24h),
    countSince(admin, "hr_shifts", tenantId, since24h),
    countSince(admin, "hr_leave_requests", tenantId, since24h),
    countSince(admin, "bank_transaction_matches", tenantId, since24h),
    countSince(admin, "bank_statement_imports", tenantId, since24h),
  ]);
  const wd = (label: string, count: number): WorkDoneItem[] => (count > 0 ? [{ label, count }] : []);
  const workDone: Record<SpecialistRole, WorkDoneItem[]> = {
    revenue: wd("sales records imported", salesNew),
    procurement: wd("supplier invoices scanned", invNew),
    accountant: [...wd("expense bills entered", billsNew), ...wd("payments recorded", paymentsNew)],
    people: [...wd("shifts rostered", shiftsNew), ...wd("leave requests filed", leaveNew)],
    controller: [...wd("bank lines matched", bankMatched), ...wd("bank statements imported", stmtImports)],
  };

  return {
    reviewType: type, ...p, asOf,
    sales: s, comparisonSales: cs, invoices: inv.map(mapInv), comparisonInvoices: cinv.map(mapInv), openPayableInvoices: open.map(mapInv), bills, bankAccounts,
    venues: venues as any,
    priceLines,
    payroll: payroll as any,
    leaveRequests: leave as any,
    employees: employees as any,
    nextWeekShifts: nextShifts as any,
    recentShifts: recentShifts as any,
    attendance: attendance as any,
    expenseBillsMtd: (billsMtd as any[]).map((b) => ({ ...b, category: b.department || "General" })),
    expenseBillsPrevMtd: (billsPrevMtd as any[]).map((b) => ({ ...b, category: b.department || "General" })),
    settlementBatches: batches as any,
    salesByMonth,
    closedDays: await allClosedDays(),
    salesNotes: ((await notesP) as any[]).map((n) => ({ date: n.sales_records?.date, venue_id: n.sales_records?.venue_id ?? null, tag: n.tag ?? null, body: n.body ?? "" })).filter((n) => n.date),
    workDone,
  };
}

// ---------- Lovable AI Gateway (Responses API, streamed) ----------
async function callAiJson(instructions: string, input: string, name: string, schema: Record<string, unknown>):
  Promise<{ ok: true; value: unknown } | { ok: false; status: number; error: string }> {
  if (!LOVABLE_API_KEY) return { ok: false, status: 0, error: "AI key not configured" };
  let resp: Response;
  try {
    resp = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": LOVABLE_API_KEY, Authorization: `Bearer ${LOVABLE_API_KEY}`, "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({ model: MODEL, instructions, input, stream: true, store: false, reasoning: { effort: "low" },
        text: { format: { type: "json_schema", name, schema, strict: true } } }),
    });
  } catch (e) { return { ok: false, status: 0, error: `AI request failed: ${(e as Error).message}` }; }
  if (!resp.ok || !resp.body) {
    const t = await resp.text().catch(() => "");
    let msg = t.slice(0, 300);
    try { msg = JSON.parse(t)?.error?.message ?? JSON.parse(t)?.message ?? msg; } catch { /* keep */ }
    return { ok: false, status: resp.status, error: msg || `AI gateway returned ${resp.status}` };
  }
  const reader = resp.body.getReader(); const dec = new TextDecoder();
  let buf = "", text = "", failed: string | null = null, refused = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const d = line.slice(5).trim(); if (!d || d === "[DONE]") continue;
      try {
        const ev = JSON.parse(d);
        if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
        else if (ev.type === "response.refusal.delta") refused = true;
        else if (ev.type === "response.failed" || ev.type === "error") failed = ev.response?.error?.message ?? ev.message ?? "AI response failed";
      } catch { /* ignore partial */ }
    }
  }
  if (refused) return { ok: false, status: 200, error: "AI declined to answer" };
  if (failed) return { ok: false, status: 500, error: failed };
  try { return { ok: true, value: JSON.parse(text) }; } catch { return { ok: false, status: 200, error: "AI returned invalid JSON" } };
}

const ROLE_ENUM = ["revenue", "procurement", "accountant", "people", "controller"];
const SYNTH_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["headline", "what_changed", "profit_cash_implication", "priorities", "specialist_summaries"],
  properties: {
    headline: { type: "string" },
    what_changed: { type: "array", items: { type: "string" } },
    profit_cash_implication: { type: "string" },
    priorities: { type: "array", items: { type: "object", additionalProperties: false, required: ["finding_key", "why"], properties: { finding_key: { type: "string" }, why: { type: "string" } } } },
    specialist_summaries: { type: "array", items: { type: "object", additionalProperties: false, required: ["role", "summary"], properties: { role: { type: "string", enum: ROLE_ENUM }, summary: { type: "string" } } } },
  },
};
const SYNTH_INSTRUCTIONS = `You are the Finance Director of a restaurant group, synthesising reports from the Revenue Manager, Procurement Manager, Accountant, People Manager and Financial Controller.
The reader is a restaurant owner with little finance knowledge: use plain English, no accounting jargon.
Use ONLY the facts provided. Never calculate new numbers; you may only repeat figures exactly as they appear in the facts (use the "display" strings).
Never infer causes the facts do not show. If something is marked not assessable, say it cannot be checked yet and why.
Purchases are invoice spend, never cost of goods sold. Bank balances are last imported statement lines, never verified cash. Profit cannot be assessed unless the facts say so.
Do not claim any action was agreed. Never say "paid", "sent" or "chased" — the team never pays, emails or chases anyone.
headline: one sentence. what_changed: up to 4 short bullets. profit_cash_implication: 1-2 sentences, stating clearly what cannot be assessed.
priorities: up to 3, finding_key MUST be one of the actionable keys listed. specialist_summaries: one concise sentence per role.`;

function factsFor(specialists: SpecialistReport[], periodLabel: string) {
  return JSON.stringify({
    period: periodLabel,
    actionable_finding_keys: specialists.flatMap((s) => s.findings).filter((f) => f.recommendation).map((f) => f.key),
    specialists: specialists.map((s) => ({ role: s.role, data_quality: s.data_quality,
      findings: s.findings.map((f) => ({ key: f.key, title: f.title, severity: f.severity, assessable: f.assessable, statement: f.statement, recommendation: f.recommendation,
        figures: f.figures.map((x) => ({ label: x.label, display: x.display, comparison: x.comparison ? { label: x.comparison.label, display: x.comparison.display, change: x.comparison.change_display } : null })) })) })),
  });
}

// ---------- review generation ----------
async function generateReview(admin: Admin, opts: { tenantId: string; venueId: string | null; type: ReviewType; endDate?: string | null; trigger: "manual" | "scheduled"; userId: string | null }) {
  const { data: tenant } = await admin.from("tenants").select("timezone").eq("id", opts.tenantId).maybeSingle();
  const tz = (tenant as any)?.timezone || "Asia/Hong_Kong";
  const today = localParts(new Date(), tz).date;
  const endDate = opts.endDate && opts.endDate < today ? opts.endDate : addDays(today, -1);
  const p = reviewPeriod(opts.type, endDate);
  let venueLabel = "All venues";
  if (opts.venueId) {
    const { data: v } = await admin.from("venues").select("name,tenant_id").eq("id", opts.venueId).maybeSingle();
    if (!v || (v as any).tenant_id !== opts.tenantId) return { status: 400, body: { error: "Venue not found for this organization." } };
    venueLabel = (v as any).name;
  }
  // Release stale locks (crashed runs older than 10 minutes).
  await admin.from("finance_team_reviews").update({ status: "failed", error: "Run timed out", generated_at: new Date().toISOString() })
    .eq("status", "running").lt("started_at", new Date(Date.now() - 10 * 60000).toISOString());

  const { data: row, error: insErr } = await admin.from("finance_team_reviews").insert({
    tenant_id: opts.tenantId, venue_id: opts.venueId, venue_label: venueLabel, review_type: opts.type,
    period_start: p.periodStart, period_end: p.periodEnd, comparison_start: p.comparisonStart, comparison_end: p.comparisonEnd,
    trigger_source: opts.trigger, generated_by: opts.userId, status: "running",
  }).select("id").single();
  if (insErr) {
    if ((insErr as any).code === "23505") return { status: 409, body: { error: "A review for this venue and period is already running." } };
    return { status: 500, body: { error: insErr.message } };
  }
  const id = (row as any).id;
  try {
    const input = await loadInput(admin, opts.tenantId, opts.venueId, opts.type, endDate, today);
    let specialists = buildSpecialists(input);
    let synthesis = deterministicSynthesis(specialists);
    const deterministic = { synthesis, summaries: specialists.map((s) => ({ role: s.role, summary: s.summary })) };

    let actQ = admin.from("finance_team_actions").select("id,title,finding_key,status,due_date,assignee_id,accepted_at,completed_at").eq("tenant_id", opts.tenantId);
    actQ = opts.venueId ? actQ.eq("venue_id", opts.venueId) : actQ.is("venue_id", null);
    const { data: acts } = await actQ.order("accepted_at", { ascending: false }).limit(50);
    const prior = evaluatePriorActions(((acts ?? []) as any[]).filter((a) => a.status === "open" || (a.completed_at && a.completed_at >= `${addDays(p.periodStart, -7)}`)), specialists, today);

    let aiStatus = "deterministic_no_key"; let aiError: string | null = null;
    const periodLabel = `${p.periodStart} to ${p.periodEnd}`;
    if (LOVABLE_API_KEY) {
      const facts = factsFor(specialists, periodLabel);
      const r = await callAiJson(SYNTH_INSTRUCTIONS, `Facts (JSON):\n${facts}`, "finance_director_briefing", SYNTH_SCHEMA);
      if (!r.ok) { aiStatus = "deterministic_ai_failed"; aiError = r.error; }
      else {
        const v = validateAiSynthesis(r.value, specialists, facts);
        if (!v.ok) { aiStatus = "deterministic_ai_rejected"; aiError = v.reason; }
        else { const m = mergeAiSynthesis(v.value, specialists); synthesis = m.synthesis; specialists = m.specialists; aiStatus = "ai"; }
      }
    }
    const context = {
      timezone: tz, as_of: today, venue_scope: opts.venueId ? "single_venue" : "all_venues",
      period_label: periodLabel, comparison: { start: p.comparisonStart, end: p.comparisonEnd },
      calculation_rules: ["Revenue = subtotal + service charge", "Payment check: sum of payment methods + card tips vs total sales (±HK$0.50)",
        "Purchases = supplier invoice totals by invoice date, excluding voided; not COGS", "Overdue = unpaid with due date before as-of date",
        "Bank balance = last imported statement running balance, not verified cash",
        "Price rises = latest invoice unit price vs previous from the same supplier (60 days); monthly impact = increase × qty bought in last 30 days",
        "Staff cost per HK$100 = payroll ÷ revenue for the latest full month with both"],
      row_counts: { sales: input.sales.length, comparison_sales: input.comparisonSales.length, invoices: input.invoices.length, open_invoices: input.openPayableInvoices.length, unpaid_bills: input.bills.length, bank_accounts: input.bankAccounts.length,
        price_lines: input.priceLines.length, payroll_rows: input.payroll.length, settlement_batches: input.settlementBatches.length },
      ai: { status: aiStatus, model: aiStatus === "ai" ? MODEL : null, error: aiError },
      deterministic,
    };
    const { error: upErr } = await admin.from("finance_team_reviews").update({
      status: "completed", ai_status: aiStatus, ai_model: aiStatus === "ai" ? MODEL : null, context, specialists, synthesis, prior_actions: prior,
      generated_at: new Date().toISOString(),
    }).eq("id", id);
    if (upErr) throw new Error(upErr.message);
    return { status: 200, body: { review_id: id, ai_status: aiStatus, ai_error: aiError } };
  } catch (e) {
    const msg = (e as Error).message || "Review generation failed";
    await admin.from("finance_team_reviews").update({ status: "failed", error: msg, generated_at: new Date().toISOString() }).eq("id", id);
    return { status: 500, body: { error: `Review generation failed: ${msg}`, review_id: id } };
  }
}

// ---------- grounded questions ----------
const ASK_SCHEMA = { type: "object", additionalProperties: false, required: ["can_answer", "answer", "cited_finding_keys"],
  properties: { can_answer: { type: "boolean" }, answer: { type: "string" }, cited_finding_keys: { type: "array", items: { type: "string" } } } };

const ROLE_NAMES: Record<string, string> = { revenue: "Revenue Manager", procurement: "Procurement Manager", accountant: "Accountant", people: "People Manager", controller: "Financial Controller" };

async function answerQuestion(review: any, question: string, role?: string | null) {
  let specialists = review.specialists as SpecialistReport[];
  if (role && ROLE_NAMES[role]) {
    specialists = [...specialists].sort((a, b) => (a.role === role ? -1 : 0) - (b.role === role ? -1 : 0));
  }
  const findings = specialists.flatMap((s) => s.findings);
  const byKey = new Map(findings.map((f) => [f.key, f]));
  const evidenceFor = (keys: string[]) => keys.flatMap((k) => byKey.get(k)?.evidence ?? []).filter((e, i, a) => a.findIndex((x) => x.route === e.route) === i);
  const facts = JSON.stringify({ venue: review.venue_label, period: `${review.period_start} to ${review.period_end}`, review_type: review.review_type,
    synthesis: review.synthesis, prior_actions: review.prior_actions, specialists: JSON.parse(factsFor(specialists, "")).specialists });
  if (!LOVABLE_API_KEY) {
    const words = question.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const hits = findings.filter((f) => words.some((w) => (f.title + " " + f.statement).toLowerCase().includes(w))).slice(0, 3);
    return { mode: "deterministic", can_answer: hits.length > 0,
      answer: hits.length ? hits.map((f) => `${f.title}: ${f.statement}`).join("\n") : "This saved review does not contain data that answers that question.",
      cited_finding_keys: hits.map((f) => f.key), evidence: evidenceFor(hits.map((f) => f.key)) };
  }
  const persona = role && ROLE_NAMES[role]
    ? `Answer as the ${ROLE_NAMES[role]} on the user's finance team: use that role's findings first, speak in first person ("I checked…"), and stay in your lane — if the question belongs to another team member, say who to ask.`
    : "Answer as the Finance Director of the user's finance team.";
  const r = await callAiJson(
    `You answer questions about ONE saved restaurant finance review. ${persona}
The reader is a restaurant owner with little finance knowledge: plain English, no accounting jargon (never say COGS, accrual or reconciled — say "matched to the bank").
Use only the facts given; repeat figures exactly as displayed and never calculate new numbers.
If the facts do not contain what is needed, set can_answer=false and say exactly what data is missing. Never infer causes. Purchases are not cost of goods sold; bank balances are not verified cash.
Never claim you paid, sent or chased anything. If the user asks whether you can mark or record a venue as closed: yes — they can tap the venue's "was closed" button under the missing-sales message, or type a plain statement like "Arca was closed"; that saves the closed day so it stops showing as missing. Cite the finding keys you relied on. Keep answers under 120 words.`,
    `Facts (JSON):\n${facts}\n\nQuestion: ${question}`, "finance_team_answer", ASK_SCHEMA);
  if (!r.ok) return { error: r.status === 402 ? "AI credits are exhausted for this workspace." : r.status === 429 ? "AI is rate limited — try again shortly." : `AI could not answer: ${r.error}`, status: r.status === 402 || r.status === 429 ? r.status : 502 };
  const a = r.value as { can_answer: boolean; answer: string; cited_finding_keys: string[] };
  const keys = (a.cited_finding_keys ?? []).filter((k) => byKey.has(k));
  const bad = ungroundedNumbers(a.answer ?? "", facts);
  if (bad.length) return { mode: "ai", can_answer: false, answer: "I couldn't produce an answer that uses only this review's calculated figures. Open the team reports for the underlying numbers.", cited_finding_keys: [], evidence: [], rejected: true };
  return { mode: "ai", can_answer: !!a.can_answer, answer: a.answer, cited_finding_keys: keys, evidence: evidenceFor(keys) };
}

// ---------- scheduler ----------
async function runScheduled(admin: Admin) {
  const { data: schedules } = await admin.from("finance_team_schedules").select("*").or("daily_enabled.eq.true,weekly_enabled.eq.true");
  const results: any[] = []; let budget = 5;
  for (const s of (schedules ?? []) as any[]) {
    if (budget <= 0) break;
    const lp = localParts(new Date(), s.timezone || "Asia/Hong_Kong");
    const yesterday = addDays(lp.date, -1);
    const jobs: { type: ReviewType; due: boolean; col: string }[] = [
      { type: "daily", due: s.daily_enabled && lp.hour >= s.daily_hour, col: "last_daily_run_at" },
      { type: "weekly", due: s.weekly_enabled && lp.weekday === s.weekly_day && lp.hour >= s.weekly_hour, col: "last_weekly_run_at" },
    ];
    for (const j of jobs) {
      if (!j.due || budget <= 0) continue;
      const ps = reviewPeriod(j.type, yesterday).periodStart;
      let q = admin.from("finance_team_reviews").select("id").eq("tenant_id", s.tenant_id).eq("review_type", j.type).eq("period_start", ps).eq("trigger_source", "scheduled").eq("status", "completed");
      q = s.venue_id ? q.eq("venue_id", s.venue_id) : q.is("venue_id", null);
      const { data: existing } = await q.limit(1);
      if (existing?.length) continue; // idempotent: already prepared for this period
      if (s.updated_by) {
        const { data: allowed } = await admin.rpc("ft_can_access_scope", { _user_id: s.updated_by, _tenant_id: s.tenant_id, _venue_id: s.venue_id });
        if (!allowed) { await admin.from("finance_team_schedules").update({ last_error: "Schedule owner no longer has access to this scope" }).eq("id", s.id); continue; }
      }
      budget--;
      const r = await generateReview(admin, { tenantId: s.tenant_id, venueId: s.venue_id, type: j.type, endDate: yesterday, trigger: "scheduled", userId: null });
      await admin.from("finance_team_schedules").update({ [j.col]: new Date().toISOString(), last_error: r.status === 200 || r.status === 409 ? null : (r.body as any).error }).eq("id", s.id);
      results.push({ schedule: s.id, type: j.type, status: r.status });
    }
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  if (body?.mode === "scheduled") {
    const token = req.headers.get("x-scheduler-token") ?? "";
    const { data: tok } = await admin.from("finance_team_scheduler_tokens").select("token").eq("id", 1).maybeSingle();
    if (!tok || token.length < 32 || (tok as any).token !== token) return json({ error: "Unauthorized" }, 401);
    return json({ ok: true, results: await runScheduled(admin) });
  }

  const auth = await requireAuth(req, corsHeaders);
  if (auth.response) return auth.response;
  const userId = auth.user.id as string;
  if (!isUuid(body?.tenant_id)) return json({ error: "tenant_id is required" }, 400);
  const tenant = await resolveTenant(admin, userId, body.tenant_id);
  if (!tenant) return json({ error: "You do not have access to this organization." }, 403);
  const { data: tenantRow } = await admin.from("tenants").select("id").eq("id", tenant.tenant_id).maybeSingle();
  if (!tenantRow) return json({ error: "Organization not found." }, 404);

  if (body.mode === "run") {
    const venueId = body.venue_id ?? null;
    if (venueId !== null && !isUuid(venueId)) return json({ error: "Invalid venue_id" }, 400);
    if (body.review_type !== "daily" && body.review_type !== "weekly") return json({ error: "review_type must be daily or weekly" }, 400);
    if (body.end_date != null && !isDate(body.end_date)) return json({ error: "end_date must be YYYY-MM-DD" }, 400);
    const { data: allowed } = await admin.rpc("ft_can_access_scope", { _user_id: userId, _tenant_id: tenant.tenant_id, _venue_id: venueId });
    if (!allowed && !tenant.isSuper) return json({ error: venueId ? "You do not have access to this venue." : "All-venue reviews require access to every venue." }, 403);
    const r = await generateReview(admin, { tenantId: tenant.tenant_id, venueId, type: body.review_type, endDate: body.end_date ?? null, trigger: "manual", userId });
    return json(r.body, r.status);
  }

  if (body.mode === "ask") {
    if (!isUuid(body.review_id)) return json({ error: "review_id is required" }, 400);
    const q = typeof body.question === "string" ? body.question.trim() : "";
    if (!q || q.length > 500) return json({ error: "Question must be 1–500 characters." }, 400);
    const role = typeof body.role === "string" && ROLE_ENUM.includes(body.role) ? body.role : null;
    const { data: review } = await admin.from("finance_team_reviews").select("*").eq("id", body.review_id).eq("tenant_id", tenant.tenant_id).eq("status", "completed").maybeSingle();
    if (!review) return json({ error: "Review not found." }, 404);
    const { data: allowed } = await admin.rpc("ft_can_access_scope", { _user_id: userId, _tenant_id: tenant.tenant_id, _venue_id: (review as any).venue_id });
    if (!allowed && !tenant.isSuper) return json({ error: "You do not have access to this review." }, 403);
    const a: any = await answerQuestion(review, q, role);
    if (a.error) return json({ error: a.error }, a.status ?? 502);
    return json(a);
  }
  return json({ error: "Unknown mode" }, 400);
});
