// Deterministic "Your Finance Team" review engine.
// Pure functions only (no Deno / npm imports) so the same logic is unit-tested in vitest.
// AI never calculates numbers: every figure in a review is produced here from stored data.

export type ReviewType = "daily" | "weekly";
export type SpecialistRole = "revenue" | "procurement" | "accountant" | "people" | "controller";
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
export interface WorkDoneItem { label: string; count: number }
export interface SpecialistReport {
  role: SpecialistRole;
  name: string;
  summary: string;
  /** The one number shown on this role's box. Null when it cannot be calculated. */
  headline: { value: Figure; note: string } | null;
  /** Real counts of records created or matched in the last 24h for this role's tables. */
  work_done: WorkDoneItem[];
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

export interface SaleRow { date: string; venue_id?: string | null; subtotal: number | null; service_charge: number | null; discount: number | null; total_sales: number | null; guests: number | null;
  visa: number | null; mastercard: number | null; amex: number | null; union_pay: number | null; jcb: number | null; alipay: number | null; wechat: number | null; payme: number | null; cash: number | null; card_tips: number | null;
  deliveroo?: number | null; foodpanda?: number | null; keeta?: number | null }
/** Manager note on a sales record (venue-day). */
export interface SalesNoteRow { date: string; venue_id: string | null; tag: string | null; body: string }
/** Note tags that explain an unusual trading day. */
export const EXPLAINING_NOTE_TAGS = ["Closed early", "Weather", "Private event", "POS problem"];
export interface InvoiceRow { id: string; invoice_date: string | null; due_date: string | null; status: string | null; payment_status: string | null; total_amount: number | null;
  remaining_balance: number | null; amount_paid: number | null; has_disputes: boolean | null; disputed_amount: number | null; voided_at: string | null; supplier_name: string | null }
export interface BillRow { id: string; bill_date: string | null; due_date: string | null; approval_status: string | null; payment_status: string | null; total_amount: number | null; paid_amount: number | null; reversed_at: string | null }
export interface BankAccountRow { id: string; account_name: string; last_reconciled_date: string | null; latest_txn_date: string | null; latest_running_balance: number | null; unmatched_in_period: number }
export interface VenueRow { id: string; name: string; is_active: boolean }
/** One invoice line with a matched product, for price-rise detection. */
export interface PriceLineRow { product_key: string; item_label: string; supplier_name: string; invoice_date: string; unit_price: number; quantity: number }
export interface PayrollRow { year: number; month: number; employee_id: string; actual_total: number | null; forecast_total: number | null }
export interface LeaveRequestRow { id: string; status: string | null; start_date: string; end_date: string; days: number | null }
export interface EmployeeRow { id: string; venue_id: string | null; status: string | null }
export interface ShiftRow { shift_date: string; employee_id: string; actual_hours_worked: number | null; variance_minutes: number | null; no_show: boolean | null }
export interface AttendanceRow { date: string; hours_worked: number | null; overtime_hours: number | null }
export interface ExpenseBillMonthRow { bill_date: string; total_amount: number | null; category: string; reversed_at: string | null }
export interface SettlementBatchRow { id: string; settlement_date: string | null; net_settlement: number | null; bank_transaction_id: string | null; status: string | null }

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
  venues: VenueRow[];
  priceLines: PriceLineRow[];
  payroll: PayrollRow[];
  leaveRequests: LeaveRequestRow[];
  employees: EmployeeRow[];
  nextWeekShifts: ShiftRow[];
  recentShifts: ShiftRow[];
  attendance: AttendanceRow[];
  expenseBillsMtd: ExpenseBillMonthRow[];
  expenseBillsPrevMtd: ExpenseBillMonthRow[];
  settlementBatches: SettlementBatchRow[];
  /** Revenue per calendar month (subtotal + service charge), for staff-cost ratio. */
  salesByMonth: { year: number; month: number; revenue: number }[];
  workDone: Record<SpecialistRole, WorkDoneItem[]>;
  /** Manager notes on sales records in the period (optional). */
  salesNotes?: SalesNoteRow[];
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
  n0(r.visa) + n0(r.mastercard) + n0(r.amex) + n0(r.union_pay) + n0(r.jcb) + n0(r.alipay) + n0(r.wechat) + n0(r.payme) + n0(r.cash)
  + n0(r.deliveroo) + n0(r.foodpanda) + n0(r.keeta) + n0(r.card_tips);
const liveInvoice = (i: InvoiceRow) => !i.voided_at;
const liveBill = (b: BillRow) => !b.reversed_at;
const emptyWork = (): Record<SpecialistRole, WorkDoneItem[]> => ({ revenue: [], procurement: [], accountant: [], people: [], controller: [] });
const workFor = (inp: ReviewInput, role: SpecialistRole) => (inp.workDone ?? emptyWork())[role] ?? [];

function explainingNotes(inp: ReviewInput): SalesNoteRow[] {
  return (inp.salesNotes ?? []).filter((n) => n.tag && EXPLAINING_NOTE_TAGS.includes(n.tag) && n.date >= inp.periodStart && n.date <= inp.periodEnd);
}
const venueName = (inp: ReviewInput, id: string | null) => inp.venues.find((v) => v.id === id)?.name ?? "A venue";

// ---------------- specialists ----------------
function revenueReport(inp: ReviewInput): SpecialistReport {
  const periodLbl = fmtRange(inp.periodStart, inp.periodEnd);
  const cmpLbl = inp.reviewType === "daily" ? `same weekday last week (${fmtDate(inp.comparisonStart)})` : `prior 7 days (${fmtRange(inp.comparisonStart, inp.comparisonEnd)})`;
  const days = daysBetweenInclusive(inp.periodStart, inp.periodEnd);
  const tradingDays = new Set(inp.sales.map((s) => s.date)).size;
  const findings: Finding[] = [];
  const ev: EvidenceLink[] = [{ label: "Sales records", route: "/sales-data" }, { label: "Revenue overview", route: "/revenue" }];
  let headline: SpecialistReport["headline"] = null;

  if (inp.sales.length === 0) {
    findings.push({ key: "revenue.sales", title: "Sales performance", severity: "watch", assessable: false,
      statement: `I can't check this yet because no sales records are saved for ${periodLbl}.`, figures: [], evidence: ev,
      recommendation: "Upload or enter the missing sales records so revenue can be reviewed." });
  } else {
    const rev = inp.sales.reduce((s, r) => s + saleRevenue(r), 0);
    const cmpRev = inp.comparisonSales.length ? inp.comparisonSales.reduce((s, r) => s + saleRevenue(r), 0) : null;
    const ch = pctChange(rev, cmpRev);
    const dropped = ch != null && ch <= -10;
    const explained = explainingNotes(inp);
    const sev: Severity = dropped && explained.length === 0 ? "watch" : "info";
    const noteText = dropped && explained.length
      ? ` A manager note explains it: ${explained.slice(0, 2).map((n) => `${venueName(inp, n.venue_id)} on ${fmtDate(n.date)}, ${n.tag}${n.body ? ` ("${n.body}")` : ""}`).join("; ")}.`
      : "";
    findings.push({ key: "revenue.sales", title: "Revenue vs comparison", severity: sev, assessable: true,
      statement: (cmpRev == null
        ? `Revenue was ${fmtHKD(rev)} for ${periodLbl}. No sales records exist for the ${cmpLbl}, so no comparison is possible.`
        : `Revenue was ${fmtHKD(rev)} for ${periodLbl}, ${fmtPct(ch)} vs ${fmtHKD(cmpRev)} on the ${cmpLbl}.`) + noteText,
      figures: [fig("Revenue (subtotal + service charge)", rev, "HKD", { label: cmpLbl, value: cmpRev })],
      evidence: ev,
      recommendation: sev === "watch" ? "Review the sales records for this period with the venue manager to confirm the drop is genuine and understood." : null });
    if (inp.reviewType === "daily") headline = { value: fig("Yesterday's revenue", rev, "HKD"), note: `for ${fmtDate(inp.periodEnd)}` };

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
        statement: "I can't check this yet because no guest counts are recorded for this period.", figures: [], evidence: ev, recommendation: null });
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

  // Active venues with no sales record for the period end (daily: yesterday).
  const activeVenues = inp.venues.filter((v) => v.is_active);
  if (activeVenues.length === 0) {
    findings.push({ key: "revenue.missing_venues", title: "Venues with no sales yesterday", severity: "info", assessable: false,
      statement: "I can't check this yet because no venues are set up.", figures: [], evidence: ev, recommendation: null });
  } else {
    const endSales = inp.sales.filter((s) => s.date === inp.periodEnd);
    const withSales = new Set(endSales.map((s) => s.venue_id).filter(Boolean));
    const missing = activeVenues.filter((v) => !withSales.has(v.id));
    findings.push({ key: "revenue.missing_venues", title: "Venues with no sales yesterday", severity: missing.length ? "action" : "info", assessable: true,
      statement: missing.length
        ? `${missing.map((v) => v.name).join(", ")} ${missing.length === 1 ? "has" : "have"} no sales record for ${fmtDate(inp.periodEnd)}. If they traded, the Z-report is missing; if they were closed, tell me and I'll treat it as closed.`
        : `Every active venue has a sales record for ${fmtDate(inp.periodEnd)}.`,
      figures: [fig("Venues missing sales", missing.length, "count")],
      evidence: ev,
      recommendation: missing.length ? "Confirm whether these venues traded or were closed." : null });
  }

  const missingDays = days - tradingDays;
  const completeness = inp.sales.length === 0 ? "missing" : missingDays > 0 ? "partial" : "complete";
  const latest = inp.sales.map((s) => s.date).sort().at(-1);
  const limitations = ["Inventory is not part of this review."];
  if (missingDays > 0 && inp.sales.length) limitations.unshift(`${fmtCount(missingDays)} of ${fmtCount(days)} days have no sales record (closed days are not distinguished from missing uploads).`);
  const first = findings[0];
  return { role: "revenue", name: "Revenue Manager", summary: first.statement, headline, work_done: workFor(inp, "revenue"), findings,
    data_quality: { freshness: latest ? `Latest sales record in period: ${fmtDate(latest)}` : "No sales records in period", completeness, sources: ["Sales records"], limitations } };
}

function procurementReport(inp: ReviewInput): SpecialistReport {
  const periodLbl = fmtRange(inp.periodStart, inp.periodEnd);
  const cmpLbl = inp.reviewType === "daily" ? `same weekday last week (${fmtDate(inp.comparisonStart)})` : `prior 7 days`;
  const inv = inp.invoices.filter(liveInvoice);
  const cmp = inp.comparisonInvoices.filter(liveInvoice);
  const findings: Finding[] = [];
  const ev: EvidenceLink[] = [{ label: "Supplier invoices", route: "/procurement/invoices" }];
  const limitations = ["Purchases are invoice spend by invoice date — not cost of goods sold (no stock movement is applied).", "Inventory is not part of this review."];

  if (inv.length === 0) {
    findings.push({ key: "procurement.spend", title: "Purchases recorded", severity: "info", assessable: false,
      statement: `I can't check this yet because no supplier invoices are recorded with an invoice date in ${periodLbl}.`, figures: [], evidence: ev, recommendation: null });
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

  // Price rises: latest invoice unit price above the previous one from the same supplier (last 60 days).
  const rises = priceRises(inp.priceLines, inp.asOf);
  if (rises === null) {
    findings.push({ key: "procurement.price_rises", title: "Supplier price rises", severity: "info", assessable: false,
      statement: "I can't check this yet because I need at least two invoices from the same supplier for the same item.", figures: [], evidence: ev, recommendation: null });
  } else {
    const totalImpact = rises.reduce((s, r) => s + r.monthlyImpact, 0);
    const sev: Severity = totalImpact > 1000 ? "watch" : "info";
    const top = rises.slice(0, 3);
    findings.push({ key: "procurement.price_rises", title: "Supplier price rises", severity: sev, assessable: true,
      statement: rises.length
        ? `${fmtCount(rises.length)} item${rises.length === 1 ? "" : "s"} cost more on the latest invoice than the one before. Biggest: ${top.map((r) => `${r.itemLabel} (${r.supplier}) ${fmtHKD(r.oldPrice)} → ${fmtHKD(r.newPrice)}`).join(", ")}. Altogether about ${fmtHKD(totalImpact)} more a month at recent buying levels.`
        : "No item costs more on its latest invoice than the one before.",
      figures: [fig("Extra cost per month", totalImpact, "HKD"), fig("Items up in price", rises.length, "count"),
        ...top.map((r) => fig(`${r.itemLabel} (${r.supplier})`, r.newPrice, "HKD", { label: "previous price", value: r.oldPrice }))],
      evidence: [{ label: "Supplier pricing", route: "/procurement/supplier-pricing" }],
      recommendation: rises.length && sev === "watch" ? "Query the biggest rises with the supplier, or accept the new prices so future invoices are checked against them." : null });
  }

  const risesForHeadline = priceRises(inp.priceLines, inp.asOf);
  const impact = risesForHeadline ? risesForHeadline.reduce((s, r) => s + r.monthlyImpact, 0) : null;
  const headline: SpecialistReport["headline"] = impact != null && impact > 0
    ? { value: fig("Extra cost per month from price rises", impact, "HKD"), note: "a month from supplier price rises" }
    : null;

  const latest = inv.map((i) => i.invoice_date!).filter(Boolean).sort().at(-1);
  return { role: "procurement", name: "Procurement Manager", summary: findings[0].statement, headline, work_done: workFor(inp, "procurement"), findings,
    data_quality: { freshness: latest ? `Latest invoice date in period: ${fmtDate(latest)}` : "No invoices in period", completeness: inv.length ? "partial" : "missing",
      sources: ["Supplier invoices"], limitations: ["Invoice capture may lag delivery; spend can be incomplete until all invoices are scanned.", ...limitations] } };
}

interface PriceRise { itemLabel: string; supplier: string; oldPrice: number; newPrice: number; changePct: number; monthlyImpact: number }
/** Latest vs previous unit price per (product, supplier); monthly impact = increase × qty bought in last 30 days. Null when nothing is comparable. */
export function priceRises(lines: PriceLineRow[], asOf: string): PriceRise[] | null {
  const byKey = new Map<string, PriceLineRow[]>();
  for (const l of lines) {
    const k = `${l.product_key}|${l.supplier_name}`;
    byKey.set(k, [...(byKey.get(k) ?? []), l]);
  }
  let comparable = 0;
  const out: PriceRise[] = [];
  const since30 = addDays(asOf, -30);
  for (const group of byKey.values()) {
    const sorted = [...group].sort((a, b) => a.invoice_date.localeCompare(b.invoice_date));
    const byDate = [...new Set(sorted.map((l) => l.invoice_date))];
    if (byDate.length < 2) continue;
    comparable++;
    const latestDate = byDate[byDate.length - 1];
    const prevDate = byDate[byDate.length - 2];
    const avg = (d: string) => {
      const ls = sorted.filter((l) => l.invoice_date === d);
      return ls.reduce((s, l) => s + l.unit_price, 0) / ls.length;
    };
    const newPrice = avg(latestDate);
    const oldPrice = avg(prevDate);
    if (!(newPrice > oldPrice) || oldPrice <= 0) continue;
    const qty30 = sorted.filter((l) => l.invoice_date >= since30).reduce((s, l) => s + l.quantity, 0);
    out.push({ itemLabel: group[0].item_label, supplier: group[0].supplier_name, oldPrice: round2(oldPrice), newPrice: round2(newPrice),
      changePct: round2(((newPrice - oldPrice) / oldPrice) * 100), monthlyImpact: round2((newPrice - oldPrice) * qty30) });
  }
  if (comparable === 0) return null;
  return out.sort((a, b) => b.monthlyImpact - a.monthlyImpact);
}

function accountantReport(inp: ReviewInput): SpecialistReport {
  const findings: Finding[] = [];
  const overdueInv = inp.openPayableInvoices.filter((i) => liveInvoice(i) && i.payment_status !== "paid" && i.due_date && i.due_date < inp.asOf);
  const overdueBills = inp.bills.filter((b) => liveBill(b) && b.payment_status !== "paid" && b.due_date && b.due_date < inp.asOf && (b.approval_status === "approved" || b.approval_status === "posted"));
  const invAmt = overdueInv.reduce((s, i) => s + (i.remaining_balance != null ? n0(i.remaining_balance) : n0(i.total_amount) - n0(i.amount_paid)), 0);
  const billAmt = overdueBills.reduce((s, b) => s + n0(b.total_amount) - n0(b.paid_amount), 0);
  const overdueCount = overdueInv.length + overdueBills.length;
  findings.push({ key: "accountant.overdue_payables", title: "Overdue payables", severity: overdueCount ? "action" : "info", assessable: true,
    statement: overdueCount ? `${fmtCount(overdueCount)} payables are past due as of ${fmtDate(inp.asOf)}: supplier invoices ${fmtHKD(invAmt)}, approved bills ${fmtHKD(billAmt)}.` : `No payables are past due as of ${fmtDate(inp.asOf)}.`,
    figures: [fig("Overdue supplier invoices", invAmt, "HKD"), fig("Overdue approved bills", billAmt, "HKD"), fig("Overdue items", overdueCount, "count")],
    evidence: [{ label: "Accounts payable", route: "/finance/payables" }, { label: "Expense bills", route: "/expenses/bills" }],
    recommendation: overdueCount ? "Review the overdue list and get them ready for you to pay through the bank. No payment is made by the finance team." : null });

  const pending = inp.bills.filter((b) => liveBill(b) && b.approval_status === "pending_review");
  const pAmt = pending.reduce((s, b) => s + n0(b.total_amount), 0);
  findings.push({ key: "accountant.bills_pending", title: "Bills awaiting approval", severity: pending.length ? "watch" : "info", assessable: true,
    statement: pending.length ? `${fmtCount(pending.length)} expense bills (${fmtHKD(pAmt)}) are waiting for approval.` : "No expense bills are waiting for approval.",
    figures: [fig("Bills pending approval", pending.length, "count"), fig("Pending amount", pAmt, "HKD")],
    evidence: [{ label: "Approvals", route: "/expenses/approvals" }],
    recommendation: pending.length ? "Ask the approver to review the pending bills." : null });

  // Due in the next 7 days (disputed invoices are listed separately as on hold).
  const weekEnd = addDays(inp.asOf, 7);
  const disputed = (i: InvoiceRow) => i.status === "disputed" || !!i.has_disputes;
  const dueInv = inp.openPayableInvoices.filter((i) => liveInvoice(i) && i.payment_status !== "paid" && !disputed(i) && i.due_date && i.due_date >= inp.asOf && i.due_date <= weekEnd);
  const dueBills = inp.bills.filter((b) => liveBill(b) && b.payment_status !== "paid" && (b.approval_status === "approved" || b.approval_status === "posted") && b.due_date && b.due_date >= inp.asOf && b.due_date <= weekEnd);
  const onHold = inp.openPayableInvoices.filter((i) => liveInvoice(i) && i.payment_status !== "paid" && disputed(i) && i.due_date && i.due_date <= weekEnd);
  const dueAmt = dueInv.reduce((s, i) => s + (i.remaining_balance != null ? n0(i.remaining_balance) : n0(i.total_amount) - n0(i.amount_paid)), 0)
    + dueBills.reduce((s, b) => s + n0(b.total_amount) - n0(b.paid_amount), 0);
  const holdAmt = onHold.reduce((s, i) => s + (i.remaining_balance != null ? n0(i.remaining_balance) : n0(i.total_amount) - n0(i.amount_paid)), 0);
  const dueNames = dueInv.map((i) => `${i.supplier_name || "Unknown supplier"} ${fmtHKD(i.remaining_balance != null ? n0(i.remaining_balance) : n0(i.total_amount) - n0(i.amount_paid))} due ${fmtDate(i.due_date!)}`);
  findings.push({ key: "accountant.due_this_week", title: "Due in the next 7 days", severity: dueAmt > 0 ? "watch" : "info", assessable: true,
    statement: (dueInv.length + dueBills.length)
      ? `${fmtHKD(dueAmt)} falls due in the next 7 days (${fmtCount(dueInv.length + dueBills.length)} items): ${dueNames.slice(0, 3).join("; ")}${dueNames.length > 3 ? "…" : ""}.${onHold.length ? ` On hold (disputed): ${fmtCount(onHold.length)} invoices, ${fmtHKD(holdAmt)}.` : ""}`
      : `Nothing falls due in the next 7 days.${onHold.length ? ` On hold (disputed): ${fmtCount(onHold.length)} invoices, ${fmtHKD(holdAmt)}.` : ""}`,
    figures: [fig("Due in next 7 days", dueAmt, "HKD"), fig("Items due", dueInv.length + dueBills.length, "count"), fig("On hold (disputed)", holdAmt, "HKD")],
    evidence: [{ label: "Accounts payable", route: "/finance/payables" }],
    recommendation: dueAmt > 0 ? "Get these ready for you to pay through the bank before their due dates." : null });

  const headline: SpecialistReport["headline"] = { value: fig("Due in the next 7 days", dueAmt, "HKD"), note: "due this week" };
  return { role: "accountant", name: "Accountant", summary: findings[0].statement, headline, work_done: workFor(inp, "accountant"), findings,
    data_quality: { freshness: `As of ${fmtDate(inp.asOf)}`, completeness: "partial",
      sources: ["Supplier invoices", "Expense bills"], limitations: ["Only saved invoices and approved bills are counted; anything not yet entered is invisible."] } };
}

function peopleReport(inp: ReviewInput): SpecialistReport {
  const findings: Finding[] = [];
  const ev: EvidenceLink[] = [{ label: "People", route: "/hr" }];

  // Latest payroll run vs the one before.
  const runs = new Map<string, { year: number; month: number; total: number; staff: Set<string> }>();
  for (const p of inp.payroll) {
    const k = `${p.year}-${String(p.month).padStart(2, "0")}`;
    const r = runs.get(k) ?? { year: p.year, month: p.month, total: 0, staff: new Set<string>() };
    r.total += n0(p.actual_total ?? p.forecast_total);
    r.staff.add(p.employee_id);
    runs.set(k, r);
  }
  const ordered = [...runs.values()].sort((a, b) => b.year - a.year || b.month - a.month);
  const latestRun = ordered[0] ?? null;
  const prevRun = ordered[1] ?? null;
  if (!latestRun) {
    findings.push({ key: "people.payroll", title: "Latest payroll run", severity: "info", assessable: false,
      statement: "I can't check this yet because no payroll runs are saved.", figures: [], evidence: [{ label: "Payroll", route: "/hr/payroll" }], recommendation: null });
  } else {
    const lbl = `${MONTHS[latestRun.month - 1]} ${latestRun.year}`;
    const ch = prevRun ? pctChange(latestRun.total, prevRun.total) : null;
    findings.push({ key: "people.payroll", title: "Latest payroll run", severity: "info", assessable: true,
      statement: `${lbl} payroll: ${fmtHKD(latestRun.total)} across ${fmtCount(latestRun.staff.size)} staff${prevRun ? `, ${fmtPct(ch)} vs ${fmtHKD(prevRun.total)} in ${MONTHS[prevRun.month - 1]} ${prevRun.year}` : "; no earlier run to compare with"}.`,
      figures: [fig(`Payroll ${lbl}`, latestRun.total, "HKD", prevRun ? { label: `${MONTHS[prevRun.month - 1]} ${prevRun.year}`, value: prevRun.total } : undefined), fig("Staff paid", latestRun.staff.size, "count")],
      evidence: [{ label: "Payroll", route: "/hr/payroll" }], recommendation: null });
  }

  // Leave waiting for approval.
  const pendingLeave = inp.leaveRequests.filter((l) => l.status === "pending");
  findings.push({ key: "people.leave_pending", title: "Leave waiting for approval", severity: pendingLeave.length ? "watch" : "info", assessable: true,
    statement: pendingLeave.length
      ? `${fmtCount(pendingLeave.length)} leave request${pendingLeave.length === 1 ? "" : "s"} (${fmtCount(pendingLeave.reduce((s, l) => s + n0(l.days), 0))} days) are waiting for approval.`
      : "No leave requests are waiting for approval.",
    figures: [fig("Requests waiting", pendingLeave.length, "count")],
    evidence: [{ label: "Leave", route: "/hr/leave" }],
    recommendation: pendingLeave.length ? "Approve or decline the waiting leave requests so rosters can be finalised." : null });

  // Next week's roster per venue (venues with active staff but no shifts).
  const activeStaff = inp.employees.filter((e) => e.status === "active" || e.status == null);
  if (activeStaff.length === 0) {
    findings.push({ key: "people.roster_missing", title: "Next week's roster", severity: "info", assessable: false,
      statement: "I can't check this yet because no staff are set up.", figures: [], evidence: [{ label: "Roster", route: "/hr/schedule" }], recommendation: null });
  } else {
    const venueOf = new Map(activeStaff.map((e) => [e.id, e.venue_id]));
    const staffedVenueIds = new Set(activeStaff.map((e) => e.venue_id).filter(Boolean) as string[]);
    const rostered = new Set(inp.nextWeekShifts.map((s) => venueOf.get(s.employee_id)).filter(Boolean) as string[]);
    const venueName = (id: string) => inp.venues.find((v) => v.id === id)?.name ?? "Unknown venue";
    const missing = [...staffedVenueIds].filter((id) => !rostered.has(id));
    findings.push({ key: "people.roster_missing", title: "Next week's roster", severity: missing.length ? "watch" : "info", assessable: true,
      statement: missing.length
        ? `No shifts are rostered next week for ${missing.map(venueName).join(", ")}.`
        : "Every venue with staff has shifts rostered for next week.",
      figures: [fig("Venues without a roster", missing.length, "count")],
      evidence: [{ label: "Roster", route: "/hr/schedule" }],
      recommendation: missing.length ? "Build next week's roster for the missing venues." : null });
  }

  // Hours worked beyond the roster (only when attendance/timesheets exist).
  if (inp.attendance.length === 0 && inp.recentShifts.every((s) => s.actual_hours_worked == null)) {
    findings.push({ key: "people.overtime", title: "Hours beyond the roster", severity: "info", assessable: false,
      statement: "I can't check this yet because no timesheets or clock-in records exist.", figures: [], evidence: ev, recommendation: null });
  } else {
    const ot = inp.attendance.reduce((s, a) => s + n0(a.overtime_hours), 0);
    const overMin = inp.recentShifts.reduce((s, sh) => s + Math.max(0, n0(sh.variance_minutes)), 0);
    const totalOt = round2(ot + overMin / 60);
    findings.push({ key: "people.overtime", title: "Hours beyond the roster", severity: totalOt > 20 ? "watch" : "info", assessable: true,
      statement: totalOt > 0
        ? `Staff worked about ${fmtCount(totalOt)} hours beyond the roster in the last 14 days.`
        : "No hours beyond the roster were recorded in the last 14 days.",
      figures: [fig("Extra hours (14 days)", totalOt, "count")],
      evidence: ev,
      recommendation: totalOt > 20 ? "Check whether the extra hours are one-off or a staffing gap." : null });
  }

  // Staff cost per HK$100 sales for the latest full month (only when both are complete).
  const asOfMonth = inp.asOf.slice(0, 7);
  const fullMonths = new Map(inp.salesByMonth.filter((m) => `${m.year}-${String(m.month).padStart(2, "0")}` < asOfMonth).map((m) => [`${m.year}-${m.month}`, m.revenue]));
  const ratioRun = ordered.find((r) => fullMonths.has(`${r.year}-${r.month}`));
  let headline: SpecialistReport["headline"] = null;
  if (!ratioRun) {
    findings.push({ key: "people.staff_cost_ratio", title: "Staff cost per HK$100 sales", severity: "info", assessable: false,
      statement: "I can't check this yet because I need a full month with both payroll and sales saved.", figures: [], evidence: ev, recommendation: null });
  } else {
    const rev = fullMonths.get(`${ratioRun.year}-${ratioRun.month}`)!;
    const per100 = rev > 0 ? round2((ratioRun.total / rev) * 100) : null;
    const lbl = `${MONTHS[ratioRun.month - 1]} ${ratioRun.year}`;
    const display = per100 == null ? "—" : `HK$${per100.toFixed(0)} of every HK$100`;
    findings.push({ key: "people.staff_cost_ratio", title: "Staff cost per HK$100 sales", severity: per100 != null && per100 > 35 ? "watch" : "info", assessable: true,
      statement: per100 == null
        ? `No sales were recorded in ${lbl}, so staff cost per HK$100 cannot be calculated.`
        : `In ${lbl}, staff cost was ${display} in sales (${fmtHKD(ratioRun.total)} payroll ÷ ${fmtHKD(rev)} revenue).`,
      figures: [{ label: `Staff cost per HK$100 sales (${lbl})`, value: per100, unit: "%", display }],
      evidence: ev,
      recommendation: per100 != null && per100 > 35 ? "Staff cost is running high against sales — review rosters against expected trade." : null });
    if (per100 != null) headline = { value: { label: "Staff cost", value: per100, unit: "%", display }, note: `in ${lbl}` };
  }

  return { role: "people", name: "People Manager", summary: findings[0].statement, headline, work_done: workFor(inp, "people"), findings,
    data_quality: { freshness: latestRun ? `Latest payroll: ${MONTHS[latestRun.month - 1]} ${latestRun.year}` : "No payroll runs", completeness: latestRun ? "partial" : "missing",
      sources: ["Payroll", "Leave requests", "Rosters", "Timesheets"], limitations: ["Staff cost uses saved payroll and sales only; unpaid hours are not included."] } };
}

function controllerReport(inp: ReviewInput): SpecialistReport {
  const findings: Finding[] = [];
  const accts = inp.bankAccounts;
  let headline: SpecialistReport["headline"] = null;
  if (accts.length === 0) {
    findings.push({ key: "controller.bank", title: "Bank position", severity: "watch", assessable: false,
      statement: "I can't check cash yet because no bank accounts are set up for this scope.", figures: [], evidence: [{ label: "Bank accounts", route: "/bank/accounts" }],
      recommendation: null });
  } else {
    const stale = accts.filter((a) => !a.latest_txn_date || a.latest_txn_date < addDays(inp.periodEnd, -7));
    const unmatched = accts.reduce((s, a) => s + a.unmatched_in_period, 0);
    const withBal = accts.filter((a) => a.latest_running_balance != null);
    findings.push({ key: "controller.bank", title: "Bank data and matching", severity: stale.length || unmatched ? "watch" : "info", assessable: stale.length < accts.length,
      statement: `${fmtCount(unmatched)} bank transactions in the period are not matched to the bank. ${stale.length ? `${fmtCount(stale.length)} of ${fmtCount(accts.length)} accounts have no statement lines within 7 days of period end, so cash cannot be confirmed.` : "All accounts have recent statement lines."} Balances shown are the last imported statement line, not verified cash.`,
      figures: [fig("Unmatched transactions", unmatched, "count"), fig("Accounts with stale statements", stale.length, "count"),
        ...withBal.map((a) => fig(`${a.account_name} last statement balance (${a.latest_txn_date ? fmtDate(a.latest_txn_date) : "—"})`, a.latest_running_balance, "HKD"))],
      evidence: [{ label: "Bank transactions", route: "/bank/transactions" }, { label: "Bank reconciliation", route: "/bank/reconciliation" }],
      recommendation: stale.length ? "Import the latest bank statements." : unmatched ? "Match the unmatched bank transactions." : null });
    const newest = withBal.slice().sort((a, b) => (b.latest_txn_date ?? "").localeCompare(a.latest_txn_date ?? ""))[0];
    if (newest) headline = { value: fig("Bank balance", newest.latest_running_balance, "HKD"), note: `Bank balance, last statement ${newest.latest_txn_date ? fmtDate(newest.latest_txn_date) : "—"}` };
  }

  // Running costs: expense bills this month vs same days last month, by category.
  const monthStart = `${inp.asOf.slice(0, 7)}-01`;
  const cur = inp.expenseBillsMtd.filter((b) => !b.reversed_at);
  const prev = inp.expenseBillsPrevMtd.filter((b) => !b.reversed_at);
  if (cur.length === 0 && prev.length === 0) {
    findings.push({ key: "controller.running_costs", title: "Running costs this month", severity: "info", assessable: false,
      statement: "I can't check this yet because no expense bills are saved for this month or the same days last month.", figures: [], evidence: [{ label: "Expense bills", route: "/expenses/bills" }], recommendation: null });
  } else {
    const byCat = new Map<string, { cur: number; prev: number }>();
    for (const b of cur) byCat.set(b.category, { cur: (byCat.get(b.category)?.cur ?? 0) + n0(b.total_amount), prev: byCat.get(b.category)?.prev ?? 0 });
    for (const b of prev) byCat.set(b.category, { cur: byCat.get(b.category)?.cur ?? 0, prev: (byCat.get(b.category)?.prev ?? 0) + n0(b.total_amount) });
    const flagged = [...byCat.entries()].filter(([, v]) => v.prev > 0 && v.cur - v.prev > 1000 && (v.cur - v.prev) / v.prev > 0.2)
      .sort((a, b) => (b[1].cur - b[1].prev) - (a[1].cur - a[1].prev));
    const curTotal = cur.reduce((s, b) => s + n0(b.total_amount), 0);
    const prevTotal = prev.reduce((s, b) => s + n0(b.total_amount), 0);
    findings.push({ key: "controller.running_costs", title: "Running costs this month", severity: flagged.length ? "watch" : "info", assessable: true,
      statement: flagged.length
        ? `Running costs are ${fmtHKD(curTotal)} so far this month vs ${fmtHKD(prevTotal)} in the same days last month. Up sharply: ${flagged.slice(0, 3).map(([c, v]) => `${c} ${fmtHKD(v.prev)} → ${fmtHKD(v.cur)}`).join(", ")}.`
        : `Running costs are ${fmtHKD(curTotal)} so far this month vs ${fmtHKD(prevTotal)} in the same days last month. No category is up sharply.`,
      figures: [fig("Running costs this month", curTotal, "HKD", { label: "same days last month", value: prevTotal }),
        ...flagged.slice(0, 3).map(([c, v]) => fig(c, v.cur, "HKD", { label: "same days last month", value: v.prev }))],
      evidence: [{ label: "Expense bills", route: "/expenses/bills" }, { label: "Expenses analytics", route: "/expenses/analytics" }],
      recommendation: flagged.length ? "Look into the categories that jumped before month-end." : null });
    void monthStart;
  }

  // Card/payment settlements still not received in the bank.
  const unreceived = inp.settlementBatches.filter((b) => b.settlement_date && b.settlement_date <= inp.asOf && !b.bank_transaction_id);
  if (inp.settlementBatches.length === 0) {
    findings.push({ key: "controller.settlements", title: "Card settlements not received", severity: "info", assessable: false,
      statement: "I can't check this yet because no payment settlement data exists.", figures: [], evidence: [{ label: "Settlement batches", route: "/payments/batches" }], recommendation: null });
  } else {
    const amt = unreceived.reduce((s, b) => s + n0(b.net_settlement), 0);
    findings.push({ key: "controller.settlements", title: "Card settlements not received", severity: unreceived.length ? "watch" : "info", assessable: true,
      statement: unreceived.length
        ? `${fmtCount(unreceived.length)} card/payment settlements (${fmtHKD(amt)}) have passed their settlement date but are not yet matched to the bank.`
        : "All due card/payment settlements are matched to the bank.",
      figures: [fig("Settlements waiting", unreceived.length, "count"), fig("Amount waiting", amt, "HKD")],
      evidence: [{ label: "Settlement batches", route: "/payments/batches" }],
      recommendation: unreceived.length ? "Check with the processor or match the incoming bank lines." : null });
  }

  const bankFresh = accts.map((a) => a.latest_txn_date).filter(Boolean).sort()[0];
  return { role: "controller", name: "Financial Controller", summary: findings[0].statement, headline, work_done: workFor(inp, "controller"), findings,
    data_quality: { freshness: bankFresh ? `Oldest latest bank statement line: ${fmtDate(bankFresh!)}` : "No bank statement lines", completeness: accts.length ? "partial" : "missing",
      sources: ["Bank transactions", "Expense bills", "Payment settlements"], limitations: ["Cash is never shown as verified: statements may be incomplete or not yet matched to the bank.", "Profit is not assessed: purchases are not cost of goods sold and payroll is separate."] } };
}

export function buildSpecialists(inp: ReviewInput): SpecialistReport[] {
  return [revenueReport(inp), procurementReport(inp), accountantReport(inp), peopleReport(inp), controllerReport(inp)];
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
  const od = all.find((f) => f.key === "accountant.overdue_payables");
  const parts = [rev?.assessable ? `Revenue: ${rev.figures[0]?.display}.` : "Revenue cannot be assessed.",
    spend?.assessable ? `Purchases recorded: ${spend.figures[0]?.display} (not cost of goods sold).` : "",
    od ? `Overdue payables: ${fmtHKD((od.figures[0]?.value ?? 0) + (od.figures[1]?.value ?? 0))}.` : "",
    "Profit impact cannot be assessed from this data; cash is not verified."];
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
  const roles = new Set<string>(["revenue", "procurement", "accountant", "people", "controller"]);
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
