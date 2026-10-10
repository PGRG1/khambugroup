// Deterministic "Your Finance Team" review engine.
// Pure functions only (no Deno / npm imports) so the same logic is unit-tested in vitest.
// AI never calculates numbers: every figure in a review is produced here from stored data.

export type ReviewType = "daily" | "weekly";
export type SpecialistRole = "revenue" | "procurement" | "accounting";
export type Severity = "info" | "watch" | "action";
export type Unit = "HKD" | "count" | "guests" | "HKD/guest" | "%" | "days";

export interface Figure {
  label: string;
  value: number | null;
  unit: Unit;
  display: string;
  comparison?: { label: string; value: number | null; display: string; change_pct: number | null; change_display: string } | null;
}
export interface EvidenceLink { label: string; route: string }
export interface Finding {
  key: string;
  title: string;
  severity: Severity;
  assessable: boolean;
  statement: string;
  figures: Figure[];
  evidence: EvidenceLink[];
  recommendation: string | null;
}
export interface SpecialistReport {
  role: SpecialistRole;
  name: string;
  summary: string;
  findings: Finding[];
  data_quality: { freshness: string; completeness: "complete" | "partial" | "missing"; sources: string[]; limitations: string[] };
}
export interface Synthesis {
  source: "ai" | "deterministic";
  headline: string;
  what_changed: string[];
  profit_cash_implication: string;
  priorities: { finding_key: string; title: string; why: string; recommendation: string | null }[];
}

export interface SaleRow { date: string; subtotal: number | null; service_charge: number | null; discount: number | null; total_sales: number | null; guests: number | null;
  visa: number | null; mastercard: number | null; amex: number | null; union_pay: number | null; jcb: number | null; alipay: number | null; wechat: number | null; payme: number | null; cash: number | null; card_tips: number | null }
export interface InvoiceRow { id: string; invoice_date: string | null; due_date: string | null; status: string | null; payment_status: string | null; total_amount: number | null;
  remaining_balance: number | null; amount_paid: number | null; has_disputes: boolean | null; disputed_amount: number | null; voided_at: string | null; supplier_name: string | null }
export interface BillRow { id: string; bill_date: string | null; due_date: string | null; approval_status: string | null; payment_status: string | null; total_amount: number | null; paid_amount: number | null; reversed_at: string | null }
export interface BankAccountRow { id: string; account_name: string; last_reconciled_date: string | null; latest_txn_date: string | null; latest_running_balance: number | null; unmatched_in_period: number }

export interface ReviewInput {
  reviewType: ReviewType;
  periodStart: string; periodEnd: string;
  comparisonStart: string; comparisonEnd: string;
  asOf: string; // venue-local "today"
  sales: SaleRow[]; comparisonSales: SaleRow[];
  invoices: InvoiceRow[]; comparisonInvoices: InvoiceRow[];
  openPayableInvoices: InvoiceRow[];
  bills: BillRow[];
  bankAccounts: BankAccountRow[];
}

// ---------------- formatting ----------------
const n0 = (v: number | null | undefined) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const round2 = (v: number) => Math.round(v * 100) / 100;
export function fmtHKD(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? "-" : ""}HK$ ${s}`;
}
export function fmtCount(v: number | null): string { return v == null ? "—" : Math.round(v).toLocaleString("en-US"); }
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}
export function fmtRange(a: string, b: string) { return a === b ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`; }
export function pctChange(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}
function fmtPct(p: number | null) { return p == null ? "no comparable base" : `${p > 0 ? "+" : ""}${p.toFixed(1)}%`; }

function fig(label: string, value: number | null, unit: Unit, cmp?: { label: string; value: number | null }): Figure {
  const f = (v: number | null) => unit === "HKD" || unit === "HKD/guest" ? fmtHKD(v) : unit === "%" ? (v == null ? "—" : `${v.toFixed(1)}%`) : fmtCount(v);
  const out: Figure = { label, value: value == null ? null : round2(value), unit, display: f(value) };
  if (cmp) {
    const ch = pctChange(value, cmp.value);
    out.comparison = { label: cmp.label, value: cmp.value == null ? null : round2(cmp.value), display: f(cmp.value), change_pct: ch, change_display: fmtPct(ch) };
  }
  return out;
}

// ---------------- dates ----------------
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function daysBetweenInclusive(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;
}
/** Review window ending on `endDate`. Daily compares with the same weekday a week earlier; weekly with the prior 7 days. */
export function reviewPeriod(type: ReviewType, endDate: string) {
  if (type === "daily") return { periodStart: endDate, periodEnd: endDate, comparisonStart: addDays(endDate, -7), comparisonEnd: addDays(endDate, -7) };
  const periodStart = addDays(endDate, -6);
  return { periodStart, periodEnd: endDate, comparisonStart: addDays(periodStart, -7), comparisonEnd: addDays(endDate, -7) };
}
/** Local date / hour / weekday (0=Sun) in an IANA timezone. */
export function localParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(get("weekday"));
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24, weekday: wd };
}

// ---------------- calculations (existing portal rules) ----------------
/** Total Revenue = Subtotal + Service Charge (portal sales rule). */
export const saleRevenue = (r: SaleRow) => n0(r.subtotal) + n0(r.service_charge);
/** Sum of payment methods + card tips (negative) must equal Total Sales (getPaymentTotal rule). */
export const salePaymentTotal = (r: SaleRow) =>
  n0(r.visa) + n0(r.mastercard) + n0(r.amex) + n0(r.union_pay) + n0(r.jcb) + n0(r.alipay) + n0(r.wechat) + n0(r.payme) + n0(r.cash) + n0(r.card_tips);
const liveInvoice = (i: InvoiceRow) => !i.voided_at;
const liveBill = (b: BillRow) => !b.reversed_at;

// ---------------- specialists ----------------
function revenueReport(inp: ReviewInput): SpecialistReport {
  const periodLbl = fmtRange(inp.periodStart, inp.periodEnd);
  const cmpLbl = inp.reviewType === "daily" ? `same weekday last week (${fmtDate(inp.comparisonStart)})` : `prior 7 days (${fmtRange(inp.comparisonStart, inp.comparisonEnd)})`;
  const days = daysBetweenInclusive(inp.periodStart, inp.periodEnd);
  const tradingDays = new Set(inp.sales.map((s) => s.date)).size;
  const findings: Finding[] = [];
  const ev: EvidenceLink[] = [{ label: "Sales records", route: "/sales-data" }, { label: "Revenue overview", route: "/revenue" }];

  if (inp.sales.length === 0) {
    findings.push({ key: "revenue.sales", title: "Sales performance", severity: "watch", assessable: false,
      statement: `Cannot assess: no sales records are saved for ${periodLbl}.`, figures: [], evidence: ev,
      recommendation: "Upload or enter the missing sales records so revenue can be reviewed." });
  } else {
    const rev = inp.sales.reduce((s, r) => s + saleRevenue(r), 0);
    const cmpRev = inp.comparisonSales.length ? inp.comparisonSales.reduce((s, r) => s + saleRevenue(r), 0) : null;
    const ch = pctChange(rev, cmpRev);
    const sev: Severity = ch != null && ch <= -10 ? "watch" : "info";
    findings.push({ key: "revenue.sales", title: "Revenue vs comparison", severity: sev, assessable: true,
      statement: cmpRev == null
        ? `Revenue was ${fmtHKD(rev)} for ${periodLbl}. No sales records exist for the ${cmpLbl}, so no comparison is possible.`
        : `Revenue was ${fmtHKD(rev)} for ${periodLbl}, ${fmtPct(ch)} vs ${fmtHKD(cmpRev)} on the ${cmpLbl}.`,
      figures: [fig("Revenue (subtotal + service charge)", rev, "HKD", { label: cmpLbl, value: cmpRev })],
      evidence: ev,
      recommendation: sev === "watch" ? "Review the sales records for this period with the venue manager to confirm the drop is genuine and understood." : null });

    const guests = inp.sales.reduce((s, r) => s + n0(r.guests), 0);
    const cmpGuests = inp.comparisonSales.length ? inp.comparisonSales.reduce((s, r) => s + n0(r.guests), 0) : null;
    if (guests > 0) {
      const spg = rev / guests;
      const cmpSpg = cmpGuests && cmpRev != null ? cmpRev / cmpGuests : null;
      findings.push({ key: "revenue.guests", title: "Guests and spend per guest", severity: "info", assessable: true,
        statement: `${fmtCount(guests)} guests at ${fmtHKD(spg)} per guest.`,
        figures: [fig("Guests", guests, "guests", { label: cmpLbl, value: cmpGuests }), fig("Spend per guest", spg, "HKD/guest", { label: cmpLbl, value: cmpSpg })],
        evidence: ev, recommendation: null });
    } else {
      findings.push({ key: "revenue.guests", title: "Guests and spend per guest", severity: "info", assessable: false,
        statement: "Cannot assess: no guest counts are recorded for this period.", figures: [], evidence: ev, recommendation: null });
    }

    const mismatched = inp.sales.filter((r) => Math.abs(salePaymentTotal(r) - n0(r.total_sales)) > 0.5);
    const gap = mismatched.reduce((s, r) => s + (salePaymentTotal(r) - n0(r.total_sales)), 0);
    findings.push({ key: "revenue.payment_mismatch", title: "Payments vs total sales", severity: mismatched.length ? "action" : "info", assessable: true,
      statement: mismatched.length
        ? `${fmtCount(mismatched.length)} of ${fmtCount(inp.sales.length)} sales records have payment methods that do not add up to total sales (net difference ${fmtHKD(gap)}).`
        : `All ${fmtCount(inp.sales.length)} sales records balance to total sales.`,
      figures: [fig("Records not balancing", mismatched.length, "count"), fig("Net payment difference", gap, "HKD")],
      evidence: [{ label: "Sales records", route: "/sales-data" }, { label: "Revenue reconciliation", route: "/revenue/reconciliation" }],
      recommendation: mismatched.length ? "Correct the payment breakdown on the unbalanced sales records." : null });
  }

  const missingDays = days - tradingDays;
  const completeness = inp.sales.length === 0 ? "missing" : missingDays > 0 ? "partial" : "complete";
  const latest = inp.sales.map((s) => s.date).sort().at(-1);
  const limitations = ["Labour/roster and inventory are not part of this v1 review."];
  if (missingDays > 0 && inp.sales.length) limitations.unshift(`${fmtCount(missingDays)} of ${fmtCount(days)} days have no sales record (closed days are not distinguished from missing uploads).`);
  const first = findings[0];
  return { role: "revenue", name: "Revenue Manager", summary: first.statement, findings,
    data_quality: { freshness: latest ? `Latest sales record in period: ${fmtDate(latest)}` : "No sales records in period", completeness, sources: ["Sales records"], limitations } };
}

function procurementReport(inp: ReviewInput): SpecialistReport {
  const periodLbl = fmtRange(inp.periodStart, inp.periodEnd);
  const cmpLbl = inp.reviewType === "daily" ? `same weekday last week (${fmtDate(inp.comparisonStart)})` : `prior 7 days`;
  const inv = inp.invoices.filter(liveInvoice);
  const cmp = inp.comparisonInvoices.filter(liveInvoice);
  const findings: Finding[] = [];
  const ev: EvidenceLink[] = [{ label: "Supplier invoices", route: "/procurement/invoices" }];
  const limitations = ["Purchases are invoice spend by invoice date — not cost of goods sold (no stock movement is applied).", "Inventory is not part of this v1 review."];

  if (inv.length === 0) {
    findings.push({ key: "procurement.spend", title: "Purchases recorded", severity: "info", assessable: false,
      statement: `Cannot assess: no supplier invoices are recorded with an invoice date in ${periodLbl}.`, figures: [], evidence: ev, recommendation: null });
  } else {
    const spend = inv.reduce((s, i) => s + n0(i.total_amount), 0);
    const cmpSpend = cmp.length ? cmp.reduce((s, i) => s + n0(i.total_amount), 0) : null;
    const bySupplier = new Map<string, number>();
    for (const i of inv) bySupplier.set(i.supplier_name || "Unknown supplier", (bySupplier.get(i.supplier_name || "Unknown supplier") ?? 0) + n0(i.total_amount));
    const top = [...bySupplier.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    findings.push({ key: "procurement.spend", title: "Purchases recorded (not COGS)", severity: "info", assessable: true,
      statement: `${fmtCount(inv.length)} supplier invoices totalling ${fmtHKD(spend)} for ${periodLbl}${cmpSpend == null ? "; none recorded in the comparison period" : `, ${fmtPct(pctChange(spend, cmpSpend))} vs ${fmtHKD(cmpSpend)} (${cmpLbl})`}. Largest: ${top.map(([n, v]) => `${n} ${fmtHKD(v)}`).join(", ")}.`,
      figures: [fig("Invoice spend", spend, "HKD", { label: cmpLbl, value: cmpSpend }), fig("Invoices", inv.length, "count"), ...top.map(([n, v]) => fig(n, v, "HKD"))],
      evidence: ev, recommendation: null });
  }
  const disputed = inp.openPayableInvoices.filter((i) => liveInvoice(i) && (i.status === "disputed" || i.has_disputes));
  const dAmt = disputed.reduce((s, i) => s + n0(i.disputed_amount), 0);
  findings.push({ key: "procurement.disputes", title: "Open supplier disputes", severity: disputed.length ? "action" : "info", assessable: true,
    statement: disputed.length ? `${fmtCount(disputed.length)} unpaid invoices are in dispute (disputed amount ${fmtHKD(dAmt)}).` : "No unpaid supplier invoices are in dispute.",
    figures: [fig("Disputed invoices", disputed.length, "count"), fig("Disputed amount", dAmt, "HKD")],
    evidence: ev, recommendation: disputed.length ? "Follow up each disputed invoice with the supplier and record the credit or resolution." : null });

  const latest = inv.map((i) => i.invoice_date!).filter(Boolean).sort().at(-1);
  return { role: "procurement", name: "Procurement Manager", summary: findings[0].statement, findings,
    data_quality: { freshness: latest ? `Latest invoice date in period: ${fmtDate(latest)}` : "No invoices in period", completeness: inv.length ? "partial" : "missing",
      sources: ["Supplier invoices"], limitations: ["Invoice capture may lag delivery; spend can be incomplete until all invoices are scanned.", ...limitations] } };
}

function accountingReport(inp: ReviewInput): SpecialistReport {
  const findings: Finding[] = [];
  const overdueInv = inp.openPayableInvoices.filter((i) => liveInvoice(i) && i.payment_status !== "paid" && i.due_date && i.due_date < inp.asOf);
  const overdueBills = inp.bills.filter((b) => liveBill(b) && b.payment_status !== "paid" && b.due_date && b.due_date < inp.asOf && (b.approval_status === "approved" || b.approval_status === "posted"));
  const invAmt = overdueInv.reduce((s, i) => s + (i.remaining_balance != null ? n0(i.remaining_balance) : n0(i.total_amount) - n0(i.amount_paid)), 0);
  const billAmt = overdueBills.reduce((s, b) => s + n0(b.total_amount) - n0(b.paid_amount), 0);
  const overdueCount = overdueInv.length + overdueBills.length;
  findings.push({ key: "accounting.overdue_payables", title: "Overdue payables", severity: overdueCount ? "action" : "info", assessable: true,
    statement: overdueCount ? `${fmtCount(overdueCount)} payables are past due as of ${fmtDate(inp.asOf)}: supplier invoices ${fmtHKD(invAmt)}, approved bills ${fmtHKD(billAmt)}.` : `No payables are past due as of ${fmtDate(inp.asOf)}.`,
    figures: [fig("Overdue supplier invoices", invAmt, "HKD"), fig("Overdue approved bills", billAmt, "HKD"), fig("Overdue items", overdueCount, "count")],
    evidence: [{ label: "Accounts payable", route: "/finance/payables" }, { label: "Expense bills", route: "/expenses/bills" }],
    recommendation: overdueCount ? "Review the overdue list and schedule payment or confirm any agreed supplier terms. No payment is made by the finance team." : null });

  const pending = inp.bills.filter((b) => liveBill(b) && b.approval_status === "pending_review");
  const pAmt = pending.reduce((s, b) => s + n0(b.total_amount), 0);
  findings.push({ key: "accounting.bills_pending", title: "Bills awaiting approval", severity: pending.length ? "watch" : "info", assessable: true,
    statement: pending.length ? `${fmtCount(pending.length)} expense bills (${fmtHKD(pAmt)}) are waiting for approval.` : "No expense bills are waiting for approval.",
    figures: [fig("Bills pending approval", pending.length, "count"), fig("Pending amount", pAmt, "HKD")],
    evidence: [{ label: "Approvals", route: "/expenses/approvals" }],
    recommendation: pending.length ? "Ask the approver to review the pending bills." : null });

  const accts = inp.bankAccounts;
  if (accts.length === 0) {
    findings.push({ key: "accounting.bank", title: "Bank position", severity: "watch", assessable: false,
      statement: "Cannot assess cash: no bank accounts are set up for this scope.", figures: [], evidence: [{ label: "Bank accounts", route: "/bank/accounts" }],
      recommendation: null });
  } else {
    const stale = accts.filter((a) => !a.latest_txn_date || a.latest_txn_date < addDays(inp.periodEnd, -7));
    const unmatched = accts.reduce((s, a) => s + a.unmatched_in_period, 0);
    const withBal = accts.filter((a) => a.latest_running_balance != null);
    findings.push({ key: "accounting.bank", title: "Bank data and matching", severity: stale.length || unmatched ? "watch" : "info", assessable: stale.length < accts.length,
      statement: `${fmtCount(unmatched)} bank transactions in the period are unmatched. ${stale.length ? `${fmtCount(stale.length)} of ${fmtCount(accts.length)} accounts have no statement lines within 7 days of period end, so cash cannot be confirmed.` : "All accounts have recent statement lines."} Balances shown are the last imported statement line, not verified cash.`,
      figures: [fig("Unmatched transactions", unmatched, "count"), fig("Accounts with stale statements", stale.length, "count"),
        ...withBal.map((a) => fig(`${a.account_name} last statement balance (${a.latest_txn_date ? fmtDate(a.latest_txn_date) : "—"})`, a.latest_running_balance, "HKD"))],
      evidence: [{ label: "Bank transactions", route: "/bank/transactions" }, { label: "Bank reconciliation", route: "/bank/reconciliation" }],
      recommendation: stale.length ? "Import the latest bank statements." : unmatched ? "Match the unmatched bank transactions." : null });
  }
  const bankFresh = accts.map((a) => a.latest_txn_date).filter(Boolean).sort()[0];
  return { role: "accounting", name: "Financial Controller", summary: findings[0].statement, findings,
    data_quality: { freshness: bankFresh ? `Oldest latest bank statement line: ${fmtDate(bankFresh!)}` : "No bank statement lines", completeness: accts.length ? "partial" : "missing",
      sources: ["Supplier invoices", "Expense bills", "Bank transactions"], limitations: ["Cash is never shown as verified: statements may be incomplete or unreconciled.", "Profit is not assessed: purchases are not COGS and payroll is not included in v1."] } };
}

export function buildSpecialists(inp: ReviewInput): SpecialistReport[] {
  return [revenueReport(inp), procurementReport(inp), accountingReport(inp)];
}

const SEV_RANK: Record<Severity, number> = { action: 0, watch: 1, info: 2 };
export function deterministicSynthesis(specialists: SpecialistReport[]): Synthesis {
  const all = specialists.flatMap((s) => s.findings);
  const priorities = all.filter((f) => f.severity !== "info" && f.recommendation)
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]).slice(0, 3)
    .map((f) => ({ finding_key: f.key, title: f.title, why: f.statement, recommendation: f.recommendation }));
  const changed = all.filter((f) => f.assessable && f.figures.some((x) => x.comparison)).map((f) => f.statement);
  const cannot = all.filter((f) => !f.assessable).map((f) => f.title.toLowerCase());
  const rev = all.find((f) => f.key === "revenue.sales");
  const spend = all.find((f) => f.key === "procurement.spend");
  const od = all.find((f) => f.key === "accounting.overdue_payables");
  const parts = [rev?.assessable ? `Revenue: ${rev.figures[0]?.display}.` : "Revenue cannot be assessed.",
    spend?.assessable ? `Purchases recorded: ${spend.figures[0]?.display} (not COGS).` : "",
    od ? `Overdue payables: ${fmtHKD((od.figures[0]?.value ?? 0) + (od.figures[1]?.value ?? 0))}.` : "",
    "Profit impact cannot be assessed from this data (no COGS or payroll in v1); cash is not verified."];
  return { source: "deterministic",
    headline: priorities.length ? `${priorities.length} item${priorities.length > 1 ? "s" : ""} need attention.` : "No items need attention in this review.",
    what_changed: changed.length ? changed : [cannot.length ? `Cannot compare: ${cannot.join(", ")}.` : "No comparable changes available."],
    profit_cash_implication: parts.filter(Boolean).join(" "),
    priorities };
}

// ---------------- prior actions ----------------
export interface PriorAction { id: string; title: string; finding_key: string; status: string; due_date: string | null; assignee_id: string | null; accepted_at: string }
export function evaluatePriorActions(actions: PriorAction[], specialists: SpecialistReport[], asOf: string) {
  const byKey = new Map(specialists.flatMap((s) => s.findings).map((f) => [f.key, f]));
  return actions.map((a) => {
    const f = byKey.get(a.finding_key);
    let evaluation: string;
    if (!f || !f.assessable) evaluation = "No new evidence in this review to evaluate the result.";
    else if (f.severity === "info") evaluation = `Not flagged in this review's data: ${f.statement}`;
    else evaluation = `Still flagged in this review: ${f.statement}`;
    return { ...a, overdue: a.status === "open" && !!a.due_date && a.due_date < asOf, evaluation };
  });
}

// ---------------- AI grounding guard ----------------
/** Collect every number appearing in the facts so AI prose can only repeat them. */
export function numbersIn(text: string): number[] {
  return (text.match(/-?\d[\d,]*(?:\.\d+)?/g) ?? []).map((s) => Number(s.replace(/,/g, ""))).filter((v) => Number.isFinite(v));
}
export function ungroundedNumbers(aiText: string, factsText: string): number[] {
  const allowed = new Set(numbersIn(factsText).flatMap((v) => [Math.abs(v), round2(Math.abs(v)), Math.round(Math.abs(v))]));
  return numbersIn(aiText).map(Math.abs).filter((v) => !(v <= 10 && Number.isInteger(v)) && !allowed.has(v) && !allowed.has(round2(v)));
}

export interface AiSynthesis { headline: string; what_changed: string[]; profit_cash_implication: string; priorities: { finding_key: string; why: string }[]; specialist_summaries: { role: string; summary: string }[] }
/** Validate AI output against the deterministic facts. Returns null with a reason if rejected. */
export function validateAiSynthesis(ai: unknown, specialists: SpecialistReport[], factsText: string): { ok: true; value: AiSynthesis } | { ok: false; reason: string } {
  const a = ai as AiSynthesis;
  if (!a || typeof a.headline !== "string" || !Array.isArray(a.what_changed) || typeof a.profit_cash_implication !== "string" || !Array.isArray(a.priorities) || !Array.isArray(a.specialist_summaries))
    return { ok: false, reason: "AI output did not match the expected structure." };
  const keys = new Set(specialists.flatMap((s) => s.findings).filter((f) => f.recommendation).map((f) => f.key));
  for (const p of a.priorities) if (!keys.has(p.finding_key)) return { ok: false, reason: `AI referenced an unknown or non-actionable finding (${p.finding_key}).` };
  const roles = new Set(["revenue", "procurement", "accounting"]);
  for (const s of a.specialist_summaries) if (!roles.has(s.role)) return { ok: false, reason: "AI referenced an unknown specialist." };
  const text = [a.headline, ...a.what_changed, a.profit_cash_implication, ...a.priorities.map((p) => p.why), ...a.specialist_summaries.map((s) => s.summary)].join(" ");
  const bad = ungroundedNumbers(text, factsText);
  if (bad.length) return { ok: false, reason: `AI used figures not present in the calculated facts (${bad.slice(0, 3).join(", ")}).` };
  return { ok: true, value: { ...a, priorities: a.priorities.slice(0, 3) } };
}

export function mergeAiSynthesis(ai: AiSynthesis, specialists: SpecialistReport[]): { synthesis: Synthesis; specialists: SpecialistReport[] } {
  const byKey = new Map(specialists.flatMap((s) => s.findings).map((f) => [f.key, f]));
  const synthesis: Synthesis = { source: "ai", headline: ai.headline, what_changed: ai.what_changed, profit_cash_implication: ai.profit_cash_implication,
    priorities: ai.priorities.map((p) => { const f = byKey.get(p.finding_key)!; return { finding_key: p.finding_key, title: f.title, why: p.why, recommendation: f.recommendation }; }) };
  const sums = new Map(ai.specialist_summaries.map((s) => [s.role, s.summary]));
  return { synthesis, specialists: specialists.map((s) => ({ ...s, summary: sums.get(s.role) || s.summary })) };
}
