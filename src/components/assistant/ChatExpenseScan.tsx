import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { ScannedBill } from "@/components/finance/bills/BillScanner";
import { ChatBillCard, ChatCashSlipCard, type ChatBillRegular, type ChatExpensePhase } from "@/components/expenses/ChatExpenseCards";
import type { ExpenseHandoff } from "@/components/assistant/FloatingBaniContext";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useAuth } from "@/hooks/useAuth";
import { useExpenseBills, type ExpenseBill, type ExpenseBillAllocation } from "@/hooks/useExpenseBills";
import { usePettyCash } from "@/hooks/usePettyCash";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { billDraftFromScan, billNeedsFullScreen, findRegularCost, loadBillLookups, readBillFiles, type BillLookups } from "@/utils/billFromScan";
import { insertPendingCashSlip, readCashSlip } from "@/utils/cashSlip";
import { formatMoney, getBaseCurrency } from "@/utils/money";
import { stageStatementBill } from "@/utils/statementBillHandoff";

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

/** Bills: shared read and mapping with Expenses › Bills, saved through useExpenseBills.saveBill as pending review or draft. */
function BillHost({ handoff, onDone }: Props) {
  const { tenantId } = useActiveTenant();
  const { user } = useAuth();
  const access = useCanFile();
  const { bills, loading: billsLoading, saveBill } = useExpenseBills();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<ChatExpensePhase>("reading");
  const [reason, setReason] = useState<string>();
  const [scan, setScan] = useState<ScannedBill | null>(null);
  const [lookups, setLookups] = useState<BillLookups | null>(null);
  const [header, setHeader] = useState<Partial<ExpenseBill> | null>(null);
  const [allocs, setAllocs] = useState<ExpenseBillAllocation[]>([]);
  const [regular, setRegular] = useState<ChatBillRegular>(null);
  const [saving, setSaving] = useState(false);
  const [savedAs, setSavedAs] = useState<"approval" | "draft">();
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !access.ready || !tenantId || billsLoading) return;
    started.current = true;
    if (!access.allowed) { setPhase("denied"); return; }
    void (async () => {
      try {
        const [s, l] = await Promise.all([readBillFiles([handoff.file]), loadBillLookups(tenantId)]);
        const d = billDraftFromScan(s, l);
        const reg = await findRegularCost(tenantId, d.header).catch(() => null);
        setScan(s); setLookups(l); setHeader(d.header); setAllocs(d.allocations);
        setRegular(reg && !reg.contract ? { name: reg.name, expected: reg.expected, estimate: reg.estimate } : null);
        const dup = d.header.supplier_id && d.header.bill_number && bills.some(b => b.supplier_id === d.header.supplier_id && (b.bill_number || "").trim().toLowerCase() === String(d.header.bill_number).trim().toLowerCase());
        if (dup) { setReason(`${d.header.vendor_name} bill ${d.header.bill_number} is already filed`); setPhase("duplicate"); return; }
        const why = billNeedsFullScreen(s, d, !!reg?.contract);
        if (why) { setReason(why); setPhase("full"); return; }
        setPhase("ready");
      } catch {
        setPhase("failed");
      }
    })();
  }, [access.ready, access.allowed, tenantId, billsLoading, bills, handoff.file]);

  const accounts = useMemo(() => (lookups?.accounts ?? []).map(a => ({ id: a.id, code: a.code, name: a.name ?? "" })), [lookups]);
  const openFull = () => {
    if (scan && user?.id && tenantId) stageStatementBill(`${user.id}:${tenantId}`, scan);
    navigate("/expenses/bills");
  };
  const save = async (status: "pending_review" | "draft") => {
    if (!header || !tenantId || !access.allowed || saving) return;
    if (status === "pending_review" && allocs.some(a => !a.account_id)) return;
    setSaving(true);
    const id = await saveBill({ ...header, approval_status: status, cost_allocation_mode: "single" } as Partial<ExpenseBill>, allocs);
    setSaving(false);
    if (!id) return;
    qc.invalidateQueries({ queryKey: ["expense-bills"] });
    setSavedAs(status === "draft" ? "draft" : "approval");
    setPhase("saved");
    onDone(`${status === "draft" ? "Saved as a draft" : "Sent for approval"} · ${header.vendor_name} · ${formatMoney(Number(header.total_amount || 0), header.currency || getBaseCurrency())}`);
  };

  const h = header;
  return <ChatBillCard phase={phase} reason={reason} saving={saving} savedAs={savedAs}
    vendor={h?.vendor_name || ""} number={h?.bill_number || ""} date={h?.bill_date || ""} due={h?.due_date || null}
    total={Number(h?.total_amount || 0)} currency={h?.currency || getBaseCurrency()}
    venue={h?.venue || ""} meter={(h?.meta as { account_number?: string } | undefined)?.account_number ?? null}
    periodStart={h?.service_period_start || null} periodEnd={h?.service_period_end || null}
    lines={allocs.map(a => ({ line: a.line_no, category: a.expense_category || "", amount: Number(a.amount || 0), accountId: a.account_id }))}
    accounts={accounts} regular={regular}
    onAccount={(line, accountId) => { if (accounts.some(a => a.id === accountId)) setAllocs(prev => prev.map(a => a.line_no === line ? { ...a, account_id: accountId } : a)); }}
    onSave={status => void save(status)} onOpenFull={openFull} />;
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
