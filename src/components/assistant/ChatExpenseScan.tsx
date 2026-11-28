import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { ScannedBill } from "@/components/finance/bills/BillScanner";
import { ChatBillCard, ChatCashSlipCard, type ChatBillPhase, type ChatBookedRow, type ChatExpensePhase } from "@/components/expenses/ChatExpenseCards";
import type { ExpenseHandoff } from "@/components/assistant/FloatingBaniContext";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useAuth } from "@/hooks/useAuth";
import { useExpenseBills, type ExpenseBill, type ExpenseBillAllocation } from "@/hooks/useExpenseBills";
import { usePettyCash } from "@/hooks/usePettyCash";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { billDraftFromScan, loadBillLookups, readBillFiles } from "@/utils/billFromScan";
import { ChatBillSetup, type BillSetupStep } from "@/components/expenses/ChatExpenseCards";
import { NewSupplierStep } from "@/components/assistant/ChatInvoiceSetup";
import { loadAssetPolicy, assetClassOf, type AssetClassKey } from "@/hooks/useAssetPolicy";
import { billMayBeShared, canUndoBill, isYes, looksLikeEquipment, recordMonth, splitAmounts, usefulLifeMonths, type SplitPart, type VenueShare } from "@/utils/billChatRules";
import { supabase } from "@/integrations/supabase/client";
import { insertPendingCashSlip, readCashSlip } from "@/utils/cashSlip";
import { formatMoney, getBaseCurrency } from "@/utils/money";
import { nextSupplierCode } from "@/utils/codes";
import { plGroup } from "@/utils/financeClose";

type Props = { handoff: ExpenseHandoff; onDone: (text: string) => void };

/** Same rule as Expenses › Bills and Petty Cash: admins only, never in preview. */
function useCanFile() {
  const { isAdmin, roleLoading } = useAuth();
  const { isPreviewActive } = usePreviewMode();
  return { ready: !roleLoading, allowed: isAdmin && !isPreviewActive };
}

export function ChatExpenseScan(p: Props) {
  return p.handoff.kind === "cash" ? <CashSlipHost {...p} /> : <BillHost {...p} />;
}

/* ───────────── Bills: booked in chat, asking in plain messages when something is unclear ───────────── */

type Ask = { kind: "account"; line: number } | { kind: "venue" } | { kind: "split"; shares: VenueShare[]; parts: SplitPart[] } | { kind: "asset" } | { kind: "asset_ok"; months: number };
type BillState = {
  phase: ChatBillPhase; reason?: string; said: string[];
  header: Partial<ExpenseBill> | null; allocs: ExpenseBillAllocation[];
  accounts: { id: string; code: string; name: string; account_type?: string | null }[];
  /** Still to settle, in order. */
  todo: ("account" | "venue" | "asset")[];
  ask: Ask | null;
  split: { shares: VenueShare[]; parts: SplitPart[] } | null;
  months: number | null;
  /** Equipment over the client's asset threshold: its class from the asset policy. */
  asset?: { key: AssetClassKey; name: string; years: number; accountId: string | null };
  level: number; billId?: string; canUndo: boolean; undoing: boolean;
  /** A vendor not in Bani yet: added only when the bill is booked or held. */
  newVendor?: string; venues: { id: string; name: string }[]; saving?: boolean;
  /** Set up first, one step at a time (like a supplier invoice): a new vendor, the expense type, the venue. */
  setup?: { steps: BillSetupStep[]; at: number; done: string[]; error?: string; busy?: boolean; vendor: { terms: string; phone: string; email: string; address: string }; suggested: number[]; shared: boolean };
};
const blank: BillState = { phase: "reading", said: [], header: null, allocs: [], accounts: [], todo: [], ask: null, split: null, months: null, level: 0, canUndo: false, undoing: false, venues: [] };
// Kept by handoff id so the card can move to the bottom of the chat with each answer.
const billStates = new Map<string, BillState>();
const billListeners = new Map<string, Set<(s: BillState) => void>>();
type BillReplyTarget = { id: string; handoff: ExpenseHandoff; said: string; answer: (text: string) => void };
let replyTarget: BillReplyTarget | null = null;
/** The bill waiting for a free-text answer, if any. FloatingBani sends the next typed message here. */
export const activeBillReply = () => replyTarget;

/** "Kitchen equipment · 5 years · HK$180/month" */
const assetLine = (name: string, months: number, total: number) =>
  `${name} · ${months % 12 ? `${months} months` : `${months / 12} year${months === 12 ? "" : "s"}`} · HK$${(Math.round(total / months * 100) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}/month`;
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const howOf = (p: SplitPart) => p.kind === "percent" ? `${p.value}%` : p.kind === "rest" ? "the rest" : p.kind === "equal" ? "equal share" : "fixed";
const acctLabel = (a?: { code: string; name: string }) => a ? `${a.code} ${a.name}` : "No account";

function BillHost({ handoff, onDone: _onDone }: Props) {
  const { tenantId } = useActiveTenant();
  const { roleLoading, isAdmin } = useAuth();
  const { isPreviewActive } = usePreviewMode();
  const { bills, loading: billsLoading, saveBill, setStatus } = useExpenseBills();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [st, setSt] = useState<BillState>(() => billStates.get(handoff.id) ?? blank);
  const stRef = { get current() { return billStates.get(handoff.id) ?? blank; } };
  // The store is the source of truth, so an answer started before the card moved still lands on the moved card.
  const patch = (u: Partial<BillState>) => { const next = { ...stRef.current, ...u }; billStates.set(handoff.id, next); billListeners.get(handoff.id)?.forEach(f => f(next)); };
  useEffect(() => {
    const set = billListeners.get(handoff.id) ?? new Set<(s: BillState) => void>();
    set.add(setSt); billListeners.set(handoff.id, set);
    const cur = billStates.get(handoff.id); if (cur) setSt(cur);
    return () => { set.delete(setSt); };
  }, [handoff.id]);
  const started = useRef(billStates.has(handoff.id));

  const venueRows = (s: BillState): ChatBookedRow[] => {
    const h = s.header; const total = Number(h?.total_amount || 0);
    if (s.months) return [{ left: `${s.allocs[0]?.expense_category || "Equipment"} · each month for ${s.months % 12 ? `${s.months} months` : `${s.months / 12} years`}`, amount: Math.round(total / s.months * 100) / 100 }];
    if (s.split) return s.split.shares.map((v, i) => ({ left: `${v.venue} · ${howOf(s.split!.parts[i])}`, amount: v.amount }));
    return s.allocs.map(a => ({ left: `${a.expense_category || "Uncategorised"} · ${acctLabel(s.accounts.find(x => x.id === a.account_id))}`, amount: Number(a.amount || 0) }));
  };

  /** Ask the next unclear thing, or book. */
  const next = (s: BillState, said: string[]) => {
    const [first, ...rest] = s.todo;
    if (first === "account") {
      const line = s.allocs.find(a => !a.account_id);
      if (!line) return next({ ...s, todo: rest }, said);
      const what = line.expense_category || line.notes || `line ${line.line_no}`;
      patch({ ...s, phase: "asking", ask: { kind: "account", line: line.line_no }, said: [...said, `What kind of cost is "${what}" (${money(Number(line.amount || 0))})?`] });
      return;
    }
    // The bill is always shown first; these questions sit under it and Book stays usable.
    if (first === "venue") { patch({ ...s, phase: "review", ask: { kind: "venue" }, said: [...said, "This could be shared between venues. Pick one venue above, or tell me who pays how much, e.g. \"half Assembly, half Caliente\"."] }); return; }
    if (first === "asset") {
      if (!s.asset) { patch({ ...s, phase: "review", ask: { kind: "asset" }, said: [...said, "Over how many years?"] }); return; }
      const months = s.asset.years * 12;
      patch({ ...s, phase: "review", ask: { kind: "asset_ok", months }, said: [...said, assetLine(s.asset.name, months, Number(s.header?.total_amount || 0))] });
      return;
    }
    // Everything settled: lay the bill out to check, and book only when the person presses Book.
    patch({ ...s, ask: null, phase: "review", said });
  };

  const addVendor = async (name: string): Promise<string | null> => {
    // Same new-supplier insert as Expenses › Bills, with a code like every new supplier.
    const code = await nextSupplierCode(tenantId!, name);
    const { data: sup, error } = await supabase.from("suppliers").insert({ name, code, vendor_type: "expense", is_active: true, tenant_id: tenantId, invoice_rounding_mode: "sum_then_round", categories: [], delivery_days: [], moq: 0 } as never).select("id").single();
    return error || !sup ? null : (sup as { id: string }).id;
  };

  /** The bill's expense lines with Bani's pick for each: the account it already has, else one read from the line. */
  const suggestAccounts = async (st0: BillState): Promise<{ allocs: ExpenseBillAllocation[]; suggested: number[] }> => {
    const suggested: number[] = [];
    const allocs = await Promise.all(st0.allocs.map(async a => {
      if (a.account_id) { suggested.push(a.line_no); return a; }
      const text = [a.expense_category, a.notes].filter(Boolean).join(" · ") || st0.header?.vendor_name || "";
      const { data } = await supabase.functions.invoke("chat-assistant", { body: { tenant_id: tenantId, floating: true, messages: [{ role: "user", content: text }], bill_reply: { ask: "account", answer: text, context: `${st0.header?.vendor_name ?? ""} bill line "${text}" ${money(Number(a.amount || 0))}` } } });
      const id = (data as { account_id?: string } | null)?.account_id;
      if (id && st0.accounts.some(x => x.id === id)) { suggested.push(a.line_no); return { ...a, account_id: id }; }
      return a;
    }));
    return { allocs, suggested };
  };

  /** Everything the bill needs before it can be booked, one step at a time; then the bill card. */
  const startSetup = async (st0: BillState, shared: boolean, scan: { payment_terms?: string | null; vendor_address?: string | null; vendor_phone?: string | null; vendor_email?: string | null }) => {
    const steps: BillSetupStep[] = [];
    if (st0.newVendor) steps.push("vendor");
    // A new vendor has no past bills to follow, so Bani's pick is shown to confirm; a known vendor only when a line has none.
    // An asset takes its class's account from the asset policy, so there's no expense type to pick.
    const assetAcct = st0.asset?.accountId;
    const { allocs, suggested } = assetAcct ? { allocs: st0.allocs.map(a => ({ ...a, account_id: assetAcct })), suggested: [] }
      : st0.newVendor || st0.allocs.some(a => !a.account_id) ? await suggestAccounts(st0) : { allocs: st0.allocs, suggested: [] };
    if (!assetAcct && (st0.newVendor || allocs.some(a => !a.account_id))) steps.push("type");
    if (!st0.header?.venue_id || shared) steps.push("venue");
    if (!steps.length) return next({ ...st0, allocs }, []);
    const terms = String(scan.payment_terms ?? (st0.header as { payment_terms?: string } | null)?.payment_terms ?? "");
    const vendor = { terms: /cash|cod|receipt|immediate/i.test(terms) || !terms ? "COD" : (terms.match(/\b(7|14|30|60)\b/) ? `Net ${terms.match(/\b(7|14|30|60)\b/)![1]}` : "COD"), phone: String(scan.vendor_phone ?? ""), email: String(scan.vendor_email ?? ""), address: String(scan.vendor_address ?? "") };
    patch({ ...st0, allocs, phase: "setup", said: [], ask: shared && steps[0] === "venue" ? { kind: "venue" } : null, setup: { steps, at: 0, done: [], vendor, suggested, shared } });
  };

  /** Move to the next setup step, or show the bill card when all are done. */
  const advance = (s: BillState, done: string) => {
    const su = s.setup!; const at = su.at + 1;
    if (at >= su.steps.length) return next({ ...s, setup: undefined, ask: null }, [`✓ ${[...su.done, done].join(" · ")}`]);
    patch({ ...s, ask: su.shared && su.steps[at] === "venue" ? { kind: "venue" } : null, setup: { ...su, at, done: [...su.done, done], error: undefined, busy: false } });
  };

  const hold = async () => {
    const s = stRef.current;
    if (!s.header || !tenantId) return;
    patch({ saving: true });
    let h = s.header;
    if (s.newVendor && !h.supplier_id) { const id = await addVendor(s.newVendor); if (!id) { patch({ saving: false, said: ["I couldn't add the new vendor. Try again."] }); return; } h = { ...h, supplier_id: id }; }
    const id = await saveBill({ ...h, approval_status: "pending_review", cost_allocation_mode: "single" } as Partial<ExpenseBill>, s.allocs);
    qc.invalidateQueries({ queryKey: ["expense-bills"] });
    patch(id ? { phase: "held", billId: id, saving: false, newVendor: undefined } : { saving: false, said: ["It didn't save. Try again."] });
  };

  const book = async (s: BillState, said: string[]) => {
    if (!s.header || !tenantId) return;
    // Booked while the asset line is showing: it's booked as shown.
    if (!s.months && s.ask?.kind === "asset_ok") s = { ...s, months: s.ask.months };
    patch({ ...s, phase: "booking", said, reason: undefined });
    let h = s.header; const total = Number(h.total_amount || 0);
    if (s.newVendor && !h.supplier_id) {
      const id = await addVendor(s.newVendor);
      if (!id) { patch({ phase: "review", reason: undefined, said: ["I couldn't add the new vendor. Try again."] }); return; }
      h = { ...h, supplier_id: id }; s = { ...s, header: h, newVendor: undefined };
    }
    let header: Partial<ExpenseBill> = { ...h, approval_status: "pending_review" };
    let allocs = s.allocs;
    if (s.split) {
      // One line per venue (per cost line when there are several); the meter's own split is not used.
      const T = Math.round(total * 100);
      const lines = s.allocs;
      allocs = s.split.shares.flatMap((v, vi) => {
        let left = Math.round(v.amount * 100);
        return lines.map((l, li) => {
          const c = li === lines.length - 1 ? left : Math.round(Number(l.amount || 0) * 100 * Math.round(v.amount * 100) / T);
          left -= c;
          return { ...l, venue: v.venue, amount: c / 100, supplier_account_id: null, line_no: vi * lines.length + li + 1 };
        });
      });
      header = { ...header, venue: null, venue_id: null, supplier_account_id: null } as Partial<ExpenseBill>;
      (header as Record<string, unknown>).cost_allocation_mode = "split";
    } else (header as Record<string, unknown>).cost_allocation_mode = "single";
    if (s.months) allocs = allocs.map(a => ({ ...a, capitalize: true, useful_life_months: s.months, in_service_date: h.bill_date ?? null, asset_name: [a.expense_category, a.notes].filter(Boolean).join(" · ") || h.vendor_name || "Equipment", asset_category: s.asset?.key ?? assetClassOf(`${a.expense_category ?? ""} ${a.notes ?? ""}`), ...(s.asset?.accountId ? { account_id: s.asset.accountId } : {}) }));
    const id = await saveBill(header, allocs);
    if (!id) { patch({ phase: "full", reason: "It didn't save", said: [] }); return; }
    const approved = await setStatus(id, "approved");
    qc.invalidateQueries({ queryKey: ["expense-bills"] });
    if (!approved) { patch({ phase: s.level >= 3 ? "full" : "sent", reason: "I couldn't book it. It's waiting for approval in Expenses", billId: id, said }); return; }
    const month = `${String(h.bill_date).slice(0, 7)}-01`;
    const { data: closed } = await supabase.from("finance_closed_periods").select("id").eq("tenant_id", tenantId).eq("month_start", month).is("reopened_at", null).maybeSingle();
    patch({ phase: "booked", billId: id, said: said.filter(t => !/Right\?/.test(t)), canUndo: canUndoBill({ paid_amount: 0, payment_status: "unpaid", approval_status: "approved" }, !!closed) });
  };

  const undo = async () => {
    const s = stRef.current;
    if (!s.billId || !tenantId || s.undoing) return;
    patch({ undoing: true });
    const { data: b } = await supabase.from("expense_bills").select("paid_amount,payment_status,approval_status,bill_date").eq("id", s.billId).eq("tenant_id", tenantId).maybeSingle();
    const month = b ? `${String(b.bill_date).slice(0, 7)}-01` : "";
    const { data: closed } = b ? await supabase.from("finance_closed_periods").select("id").eq("tenant_id", tenantId).eq("month_start", month).is("reopened_at", null).maybeSingle() : { data: null };
    if (!b || !canUndoBill(b, !!closed)) { patch({ undoing: false, canUndo: false }); return; }
    const ok = await setStatus(s.billId, "void");
    qc.invalidateQueries({ queryKey: ["expense-bills"] });
    patch(ok ? { phase: "undone", undoing: false, canUndo: false } : { undoing: false, canUndo: false });
  };

  const answer = async (text: string) => {
    const s = stRef.current; const ask = s.ask;
    if (!ask || !tenantId || !s.header) return;
    const total = Number(s.header.total_amount || 0);
    const said: string[] = [];
    const read = async (kind: "split" | "account", context: string) => {
      patch({ phase: "review", said: ["Reading that…"] });
      const { data, error } = await supabase.functions.invoke("chat-assistant", { body: { tenant_id: tenantId, floating: true, messages: [{ role: "user", content: text }], bill_reply: { ask: kind, answer: text, context } } });
      if (error) return { unclear: "I didn't catch that. Could you say it again?" } as Record<string, unknown>;
      return (data ?? {}) as Record<string, unknown>;
    };
    if (ask.kind === "account") {
      const line = s.allocs.find(a => a.line_no === ask.line);
      const r = await read("account", `${s.header.vendor_name} · line "${line?.expense_category || line?.notes || ""}" ${money(Number(line?.amount || 0))}`);
      const acct = s.accounts.find(a => a.id === r.account_id);
      if (!acct) { patch({ phase: "review", said: [String(r.unclear || "What kind of cost is it?")] }); return; }
      const allocs = s.allocs.map(a => a.line_no === ask.line ? { ...a, account_id: acct.id } : a);
      return next({ ...s, allocs }, [`I'll put it under ${acct.code} ${acct.name}.`]);
    }
    if (ask.kind === "split" && isYes(text)) return next({ ...s, split: { shares: ask.shares, parts: ask.parts }, setup: undefined, todo: s.todo.filter(t => t !== "venue") }, []);
    if (ask.kind === "venue" || ask.kind === "split") {
      const r = await read("split", `${s.header.vendor_name} bill, total ${money(total)}`);
      const parts = Array.isArray(r.parts) ? (r.parts as SplitPart[]) : [];
      const res = parts.length ? splitAmounts(total, parts) : null;
      if (!res || "problem" in res) { patch({ phase: "review", ask: { kind: "venue" }, said: [res && "problem" in res ? `${res.problem}. Who pays, and how much each?` : String(r.unclear || "Who pays, and how much each?")] }); return; }
      const lines = res.shares.map((v, i) => `${v.venue} · ${howOf(parts[i])}: ${money(v.amount)}`);
      patch({ phase: "review", ask: { kind: "split", shares: res.shares, parts }, said: [`${lines.join("\n")}\nTotal: ${money(total)}`, "Right? Or tell me what to change."] });
      return;
    }
    if (ask.kind === "asset_ok") {
      if (isYes(text)) return next({ ...s, months: ask.months, todo: s.todo.filter(t => t !== "asset") }, []);
      // Otherwise it's a new answer to the same question.
    }
    const months = usefulLifeMonths(text);
    if (months === 0) return next({ ...s, months: null, asset: undefined, allocs: s.asset?.accountId ? s.allocs.map(a => a.account_id === s.asset!.accountId ? { ...a, account_id: null } : a) : s.allocs, todo: s.todo.filter(t => t !== "asset") }, ["Normal cost. Pick the expense type."]);
    if (!months) { patch({ phase: "review", ask: { kind: "asset" }, said: ["How many years?"] }); return; }
    patch({ phase: "review", ask: { kind: "asset_ok", months }, said: [assetLine(s.asset?.name ?? "Asset", months, total)] });
    void said;
  };

  // Free-text answers from the chat box come here while Bani is waiting.
  useEffect(() => {
    if (!st.ask || (st.phase !== "asking" && st.phase !== "review" && st.phase !== "setup")) { if (replyTarget?.id === handoff.id) replyTarget = null; return; }
    replyTarget = { id: handoff.id, handoff, said: st.said.join("\n\n"), answer: t => void answer(t) };
    return () => { if (replyTarget?.id === handoff.id) replyTarget = null; };
  });

  useEffect(() => {
    if (started.current || roleLoading || !tenantId || billsLoading) return;
    started.current = true;
    void (async () => {
      // Anyone with Do on Expenses, never in preview; the server's approval rules still decide booking.
      const { data: lv, error: lvErr } = await supabase.rpc("access_level" as never, { t: tenantId, area: "expenses" } as never);
      const level = lvErr ? (isAdmin ? 3 : 0) : Number(lv ?? 0);
      if (isPreviewActive || level < 2) { patch({ phase: "denied" }); return; }
      try {
        const [scan, l] = await Promise.all([readBillFiles([handoff.file]), loadBillLookups(tenantId)]);
        const d = billDraftFromScan(scan, l);
        const accounts = l.accounts.map(a => ({ id: a.id, code: a.code, name: a.name ?? "", account_type: (a as { account_type?: string | null }).account_type ?? null }));
        const base: BillState = { ...blank, level, header: d.header, allocs: d.allocations, accounts };
        if (scan.suggested_document_type === "procurement_invoice") { patch({ ...base, phase: "full", reason: "This looks like a stock invoice" }); return; }
        if ((scan as { contract_terms?: unknown }).contract_terms) { patch({ ...base, phase: "full", reason: "This is a contract bill" }); return; }
        if (Number(scan.brought_forward || 0) !== 0 || scan.statement_check) { patch({ ...base, phase: "full", reason: "This statement carries a balance" }); return; }
        const lineSum = d.allocations.reduce((n, a) => n + Number(a.amount || 0), 0);
        const expected = Number(d.header.subtotal || 0) || Number(d.header.total_amount || 0) - Number(d.header.tax_amount || 0);
        if (!(Number(d.header.total_amount) > 0) || !d.header.bill_date) { patch({ ...base, phase: "full", reason: "I couldn't read the amount or date" }); return; }
        if (Math.abs(lineSum - expected) >= 0.01) { patch({ ...base, phase: "full", reason: "The lines don't add up to the bill" }); return; }
        const dup = d.header.supplier_id && d.header.bill_number && bills.some(b => b.supplier_id === d.header.supplier_id && (b.bill_number || "").trim().toLowerCase() === String(d.header.bill_number).trim().toLowerCase());
        if (dup) { patch({ ...base, phase: "duplicate", reason: `${d.header.vendor_name} bill ${d.header.bill_number} is already filed` }); return; }
        const said: string[] = [];
        let header = d.header;
        let newVendor: string | undefined;
        if (!d.matched) {
          const name = (scan.vendor_name || "").trim();
          if (!name) { patch({ ...base, phase: "full", reason: "I couldn't tell who it's from" }); return; }
          newVendor = name;
          header = { ...header, vendor_name: name, meta: { ...(header.meta ?? {}), bani_question: undefined } };
        } else if (header.supplier_id && d.allocations.some(a => !a.account_id)) {
          // A known vendor: use the account its last bill went to.
          const { data: last } = await supabase.from("expense_bill_allocations").select("account_id, expense_bills!inner(supplier_id, bill_date)").eq("tenant_id", tenantId).eq("expense_bills.supplier_id", header.supplier_id).not("account_id", "is", null).order("created_at", { ascending: false }).limit(1);
          const acct = (last as { account_id: string }[] | null)?.[0]?.account_id;
          if (acct) d.allocations.forEach(a => { if (!a.account_id) a.account_id = acct; });
        }
        // A business with one venue: the bill is that venue's, so there's no venue to pick or share.
        if (!header.venue_id && l.venues.length === 1) header = { ...header, venue: l.venues[0].name, venue_id: l.venues[0].id };
        const meter = l.meters.find(m => m.id === header.supplier_account_id);
        const todo: BillState["todo"] = [];
        // An unknown venue is just picked in the card; only a bill that looks shared (head office address,
        // shared service) also asks in chat who pays how much.
        const shared = billMayBeShared({ vendor: header.vendor_name || "", categories: d.allocations.map(a => a.expense_category || ""), address: scan.service_address ?? null, venueKnown: true, meterCovers: meter?.covers?.length ?? 0, venueCount: l.venues.length });
        let asset: BillState["asset"];
        if (looksLikeEquipment(d.allocations.map(a => ({ category: a.expense_category || "", notes: a.notes, accountName: accounts.find(x => x.id === a.account_id)?.name })))) {
          // The client's asset policy: over its threshold it's an asset of the matching class; under it, a normal cost.
          const policy = await loadAssetPolicy(tenantId).catch(() => null);
          const line = d.allocations[0];
          const key = assetClassOf(`${line?.expense_category ?? ""} ${line?.notes ?? ""}`);
          const cls = policy?.classes.find(c => c.class_key === key);
          if (!policy?.settings || Number(d.header.total_amount || 0) >= policy.settings.threshold) {
            todo.push("asset");
            if (cls) asset = { key, name: cls.name, years: cls.useful_years, accountId: cls.asset_account_id };
          }
        }
        await startSetup({ ...base, header, todo, newVendor, venues: l.venues, asset }, shared, scan);
      } catch {
        patch({ phase: "failed" });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleLoading, tenantId, billsLoading]);

  const h = st.header;
  const plAccounts = st.accounts.filter(a => ["opex", "other_expense", "cogs"].includes(String(a.account_type))).map(a => ({ id: a.id, code: a.code, name: a.name, group: plGroup(String(a.account_type)) }));
  if (st.phase === "setup" && st.setup && h) {
    const su = st.setup;
    return <ChatBillSetup steps={su.steps} at={su.at} done={su.done} busy={!!su.busy} error={su.error}
      vendorName={st.newVendor || h.vendor_name || ""} number={h.bill_number || ""} total={Number(h.total_amount || 0)} currency={h.currency || getBaseCurrency()}
      vendorStep={tenantId && <NewSupplierStep key={handoff.id} tenantId={tenantId} supplierName={st.newVendor || h.vendor_name || ""} type="expense" initial={su.vendor}
        onCreated={row => { const cur = stRef.current; advance({ ...cur, newVendor: undefined, header: { ...cur.header, supplier_id: row.id, vendor_name: row.name } }, `${row.name}${row.code ? ` (${row.code})` : ""} added`); }} />}
      lines={st.allocs.map(a => ({ line_no: a.line_no, description: [a.expense_category, a.notes].filter(Boolean).join(" · ") || h.vendor_name || "", amount: Number(a.amount || 0), account_id: a.account_id ?? null, suggested: su.suggested.includes(a.line_no) }))}
      accounts={plAccounts}
      onAccount={(line, account) => patch({ allocs: stRef.current.allocs.map(a => a.line_no === line ? { ...a, account_id: account || null } : a), setup: { ...stRef.current.setup!, suggested: stRef.current.setup!.suggested.filter(n => n !== line) } })}
      onTypeDone={() => { const cur = stRef.current; const names = [...new Set(cur.allocs.map(a => cur.accounts.find(x => x.id === a.account_id)?.name).filter(Boolean))]; advance(cur, `Expense type: ${names.join(", ")}`); }}
      venues={st.venues.map(v => v.name)} shared={su.shared}
      onVenue={v => { const cur = stRef.current; const venue = cur.venues.find(x => x.name === v); advance({ ...cur, header: { ...cur.header, venue: v, venue_id: venue?.id ?? null }, split: null, todo: cur.todo.filter(t => t !== "venue") }, `Venue: ${v}`); }} />;
  }
  return <ChatBillCard phase={st.phase} reason={st.reason} said={st.said}
    vendor={h?.vendor_name || ""} number={h?.bill_number || ""} due={h?.due_date || null} currency={h?.currency || getBaseCurrency()}
    recordsTo={h?.bill_date ? recordMonth(h.bill_date) : ""} rows={venueRows(st)}
    canUndo={st.canUndo} undoing={st.undoing} onUndo={() => void undo()}
    onSee={() => navigate(st.billId ? `/expenses?bill=${st.billId}` : "/expenses/bills")}
    onOpenFull={() => navigate("/expenses/bills")}
    review={st.phase === "review" && h ? {
      number: h.bill_number || "", date: h.bill_date || "", due: h.due_date || "", terms: String((h as { payment_terms?: string }).payment_terms ?? ""),
      venue: st.split ? "Split" : h.venue || "", venues: st.split ? ["Split", ...st.venues.map(v => v.name)] : st.venues.map(v => v.name), total: Number(h.total_amount || 0),
      intro: `${h.vendor_name || "Bill"} for ${money(Number(h.total_amount || 0))}${(h as { payment_terms?: string }).payment_terms ? `, ${String((h as { payment_terms?: string }).payment_terms).toLowerCase()}` : ""}. ${st.allocs.some(a => !a.account_id) || !(st.split || h.venue) ? "Fill in the amber parts, then book." : "Check it and book."}`,
      newVendor: !!st.newVendor, saving: !!st.saving,
      lines: st.allocs.map(a => ({ line_no: a.line_no, description: [a.expense_category, a.notes].filter(Boolean).join(" · ") || h.vendor_name || "", amount: Number(a.amount || 0), account_id: a.account_id ?? null })),
      accounts: [...(st.asset?.accountId ? st.accounts.filter(a => a.id === st.asset!.accountId).map(a => ({ id: a.id, code: a.code, name: a.name, group: "Assets" })) : []), ...st.accounts.filter(a => ["opex", "other_expense", "cogs"].includes(String(a.account_type))).map(a => ({ id: a.id, code: a.code, name: a.name, group: plGroup(String(a.account_type)) }))],
      onField: (k, v) => {
        const cur = stRef.current.header; if (!cur) return;
        const venue = k === "venue" ? st.venues.find(x => x.name === v) : null;
        if (k === "venue") {
          if (v === "Split") return;
          const ask = stRef.current.ask;
          const settled = ask && (ask.kind === "venue" || ask.kind === "split");
          patch({ header: { ...cur, venue: v, venue_id: venue?.id ?? null }, split: null, ...(settled ? { ask: null, said: [], todo: stRef.current.todo.filter(t => t !== "venue") } : {}) });
          return;
        }
        patch({ header: k === "number" ? { ...cur, bill_number: v } : k === "date" ? { ...cur, bill_date: v } : { ...cur, due_date: v || null } });
      },
      onAccount: (line, account) => patch({ allocs: stRef.current.allocs.map(a => a.line_no === line ? { ...a, account_id: account || null } : a) }),
      onBook: () => void book(stRef.current, []),
      onHold: () => void hold(),
      choices: st.ask?.kind === "asset_ok" ? [
        { label: "Yes", onPick: () => void answer("yes") },
        { label: "Change years", onPick: () => patch({ ask: { kind: "asset" }, said: ["How many years?"] }) },
        { label: "Not an asset", onPick: () => void answer("not an asset") },
      ] : undefined,
    } : undefined} />;
}

/** Cash-box slips: shared read and pending insert with Petty Cash › Import. A manager approves it later. */
function CashSlipHost({ handoff, onDone }: Props) {
  const pc = usePettyCash();
  const access = useCanFile();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<ChatExpensePhase>("reading");
  const [reason, setReason] = useState<string>();
  const [row, setRow] = useState<{ description: string; date: string; amount: number; classificationId: string; floatId: string } | null>(null);
  const [upload, setUpload] = useState<{ url: string | null; path: string | null }>({ url: null, path: null });
  const [saving, setSaving] = useState(false);
  const started = useRef(false);
  const floats = useMemo(() => pc.floats.filter(f => f.is_active), [pc.floats]);
  const classifications = useMemo(() => pc.classifications.filter((c: { is_active?: boolean }) => c.is_active !== false), [pc.classifications]);

  useEffect(() => {
    if (started.current || !access.ready || pc.loading || !pc.tenantId) return;
    started.current = true;
    if (!access.allowed) { setPhase("denied"); return; }
    if (!floats.length) { setReason("There's no active cash box yet"); setPhase("full"); return; }
    void (async () => {
      try {
        const res = await readCashSlip(handoff.file, classifications.map(c => ({ id: c.id, name: c.name })));
        setUpload(res.upload);
        if (res.rows.length !== 1) { setReason(res.rows.length ? `This has ${res.rows.length} receipts` : "I couldn't find a receipt in it"); setPhase("full"); return; }
        const r = res.rows[0];
        setRow({
          description: r.description || "Cash purchase",
          date: r.receipt_date && /^\d{4}-\d{2}-\d{2}$/.test(r.receipt_date) ? r.receipt_date : new Date().toISOString().slice(0, 10),
          amount: Number(r.amount) || 0,
          classificationId: classifications.some(c => c.id === r.suggested_classification_id) ? String(r.suggested_classification_id) : "",
          floatId: floats.length === 1 ? floats[0].id : "",
        });
        setPhase(Number(r.amount) > 0 ? "ready" : "full");
        if (!(Number(r.amount) > 0)) setReason("I couldn't read the amount");
      } catch {
        setPhase("failed");
      }
    })();
  }, [access.ready, access.allowed, pc.loading, pc.tenantId, floats, classifications, handoff.file]);

  const add = async () => {
    if (!row || !pc.tenantId || !access.allowed || saving) return;
    if (!floats.some(f => f.id === row.floatId) || !classifications.some(c => c.id === row.classificationId)) return;
    setSaving(true);
    try {
      await insertPendingCashSlip(pc.tenantId, { float_id: row.floatId, receipt_date: row.date, amount: row.amount, description: row.description, classification_id: row.classificationId }, upload);
      setPhase("saved");
      onDone(`Added to ${floats.find(f => f.id === row.floatId)?.name} · ${formatMoney(row.amount)} · waiting for a manager`);
    } catch {
      setReason("It didn't save. Try the full screen"); setPhase("full");
    } finally { setSaving(false); }
  };

  return <ChatCashSlipCard phase={phase} reason={reason} saving={saving}
    description={row?.description ?? ""} date={row?.date ?? ""} amount={row?.amount ?? 0} currency={getBaseCurrency()}
    classificationId={row?.classificationId ?? ""} classifications={classifications}
    floatId={row?.floatId ?? ""} floats={floats.map(f => ({ id: f.id, name: f.name, venue: f.venue }))}
    onClassification={id => setRow(r => r && classifications.some(c => c.id === id) ? { ...r, classificationId: id } : r)}
    onFloat={id => setRow(r => r && floats.some(f => f.id === id) ? { ...r, floatId: id } : r)}
    onAdd={() => void add()} onOpenFull={() => navigate("/finance/cash?view=petty")} />;
}
