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
import { billMayBeShared, canUndoBill, isYes, looksLikeEquipment, recordMonth, splitAmounts, usefulLifeMonths, type SplitPart, type VenueShare } from "@/utils/billChatRules";
import { supabase } from "@/integrations/supabase/client";
import { insertPendingCashSlip, readCashSlip } from "@/utils/cashSlip";
import { formatMoney, getBaseCurrency } from "@/utils/money";

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
  accounts: { id: string; code: string; name: string }[];
  /** Still to settle, in order. */
  todo: ("account" | "venue" | "asset")[];
  ask: Ask | null;
  split: { shares: VenueShare[]; parts: SplitPart[] } | null;
  months: number | null;
  level: number; billId?: string; canUndo: boolean; undoing: boolean;
};
const blank: BillState = { phase: "reading", said: [], header: null, allocs: [], accounts: [], todo: [], ask: null, split: null, months: null, level: 0, canUndo: false, undoing: false };
// Kept by handoff id so the card can move to the bottom of the chat with each answer.
const billStates = new Map<string, BillState>();
const billListeners = new Map<string, Set<(s: BillState) => void>>();
type BillReplyTarget = { id: string; handoff: ExpenseHandoff; said: string; answer: (text: string) => void };
let replyTarget: BillReplyTarget | null = null;
/** The bill waiting for a free-text answer, if any. FloatingBani sends the next typed message here. */
export const activeBillReply = () => replyTarget;

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
    if (first === "venue") { patch({ ...s, phase: "asking", ask: { kind: "venue" }, said: [...said, "Who pays for this, and how much each? Say it however you like."] }); return; }
    if (first === "asset") { patch({ ...s, phase: "asking", ask: { kind: "asset" }, said: [...said, "Something you'll keep for years? Over how many years?"] }); return; }
    void book({ ...s, ask: null }, said);
  };

  const book = async (s: BillState, said: string[]) => {
    if (!s.header || !tenantId) return;
    patch({ ...s, phase: "booking", said, reason: undefined });
    const h = s.header; const total = Number(h.total_amount || 0);
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
    if (s.months) allocs = allocs.map(a => ({ ...a, capitalize: true, useful_life_months: s.months, in_service_date: h.bill_date ?? null, asset_name: a.notes || a.expense_category || h.vendor_name || "Equipment", asset_category: a.expense_category ?? null }));
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
      patch({ phase: "booking", said: [], reason: "Reading that…" });
      const { data, error } = await supabase.functions.invoke("chat-assistant", { body: { tenant_id: tenantId, floating: true, messages: [{ role: "user", content: text }], bill_reply: { ask: kind, answer: text, context } } });
      if (error) return { unclear: "I didn't catch that. Could you say it again?" } as Record<string, unknown>;
      return (data ?? {}) as Record<string, unknown>;
    };
    if (ask.kind === "account") {
      const line = s.allocs.find(a => a.line_no === ask.line);
      const r = await read("account", `${s.header.vendor_name} · line "${line?.expense_category || line?.notes || ""}" ${money(Number(line?.amount || 0))}`);
      const acct = s.accounts.find(a => a.id === r.account_id);
      if (!acct) { patch({ phase: "asking", said: [String(r.unclear || "What kind of cost is it?")] }); return; }
      const allocs = s.allocs.map(a => a.line_no === ask.line ? { ...a, account_id: acct.id } : a);
      return next({ ...s, allocs }, [`I'll put it under ${acct.code} ${acct.name}.`]);
    }
    if (ask.kind === "split" && isYes(text)) return next({ ...s, split: { shares: ask.shares, parts: ask.parts }, todo: s.todo.slice(1) }, []);
    if (ask.kind === "venue" || ask.kind === "split") {
      const r = await read("split", `${s.header.vendor_name} bill, total ${money(total)}`);
      const parts = Array.isArray(r.parts) ? (r.parts as SplitPart[]) : [];
      const res = parts.length ? splitAmounts(total, parts) : null;
      if (!res || "problem" in res) { patch({ phase: "asking", ask: { kind: "venue" }, said: [res && "problem" in res ? `${res.problem}. Who pays, and how much each?` : String(r.unclear || "Who pays for this, and how much each?")] }); return; }
      const lines = res.shares.map((v, i) => `${v.venue} · ${howOf(parts[i])}: ${money(v.amount)}`);
      patch({ phase: "asking", ask: { kind: "split", shares: res.shares, parts }, said: [`${lines.join("\n")}\nTotal: ${money(total)}`, "Right? Or tell me what to change."] });
      return;
    }
    if (ask.kind === "asset_ok") {
      if (isYes(text)) return next({ ...s, months: ask.months, todo: s.todo.slice(1) }, []);
      // Otherwise it's a new answer to the same question.
    }
    const months = usefulLifeMonths(text);
    if (months === 0) return next({ ...s, months: null, todo: s.todo.slice(1) }, ["Booking it as a normal cost."]);
    if (!months) { patch({ phase: "asking", ask: { kind: "asset" }, said: ["Over how many years will you use it?"] }); return; }
    const monthly = Math.round(total / months * 100) / 100;
    const start = new Date(`${String(s.header.bill_date).slice(0, 7)}-01T00:00:00Z`).toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
    patch({ phase: "asking", ask: { kind: "asset_ok", months }, said: [`${money(monthly)} a month for ${months % 12 ? `${months} months` : `${months / 12} years`}, starting ${start}.`, "Right? Or tell me what to change."] });
    void said;
  };

  // Free-text answers from the chat box come here while Bani is waiting.
  useEffect(() => {
    if (st.phase !== "asking") { if (replyTarget?.id === handoff.id) replyTarget = null; return; }
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
        const accounts = l.accounts.map(a => ({ id: a.id, code: a.code, name: a.name ?? "" }));
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
        if (!d.matched) {
          const name = (scan.vendor_name || "").trim();
          if (!name) { patch({ ...base, phase: "full", reason: "I couldn't tell who it's from" }); return; }
          // Same new-supplier insert as Expenses › Bills.
          const { data: sup, error } = await supabase.from("suppliers").insert({ name, vendor_type: "expense", is_active: true, tenant_id: tenantId, invoice_rounding_mode: "sum_then_round", categories: [], delivery_days: [], moq: 0 } as never).select("id,name").single();
          if (error || !sup) { patch({ ...base, phase: "full", reason: "I couldn't add the new supplier" }); return; }
          header = { ...header, supplier_id: (sup as { id: string }).id, meta: { ...(header.meta ?? {}), bani_question: undefined } };
          said.push(`${name} is new, I've added it.`);
        }
        const meter = l.meters.find(m => m.id === header.supplier_account_id);
        const todo: BillState["todo"] = [];
        if (d.allocations.some(a => !a.account_id)) todo.push("account");
        if (billMayBeShared({ vendor: header.vendor_name || "", categories: d.allocations.map(a => a.expense_category || ""), address: scan.service_address ?? null, venueKnown: !!header.venue_id, meterCovers: meter?.covers?.length ?? 0 })) todo.push("venue");
        if (looksLikeEquipment(d.allocations.map(a => ({ category: a.expense_category || "", notes: a.notes, accountName: accounts.find(x => x.id === a.account_id)?.name })))) todo.push("asset");
        next({ ...base, header, todo }, said);
      } catch {
        patch({ phase: "failed" });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleLoading, tenantId, billsLoading]);

  const h = st.header;
  return <ChatBillCard phase={st.phase} reason={st.reason} said={st.said}
    vendor={h?.vendor_name || ""} number={h?.bill_number || ""} due={h?.due_date || null} currency={h?.currency || getBaseCurrency()}
    recordsTo={h?.bill_date ? recordMonth(h.bill_date) : ""} rows={venueRows(st)}
    canUndo={st.canUndo} undoing={st.undoing} onUndo={() => void undo()}
    onSee={() => navigate(st.billId ? `/expenses?bill=${st.billId}` : "/expenses/bills")}
    onOpenFull={() => navigate("/expenses/bills")} />;
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
