import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import type { CashUploadHandoff } from "@/components/assistant/FloatingBaniContext";
import type { PaymentProcessor, ProcessorMerchant } from "@/hooks/usePaymentSettlements";
import { supabase } from "@/integrations/supabase/client";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useAuth } from "@/hooks/useAuth";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { loadStatementFile, startBaniMatching, type StatementData, type StatementLoad } from "@/utils/bankStatementImport";
import { stageBaniStatements } from "@/utils/baniStatementHandoff";
import { getBaseCurrency } from "@/utils/money";
import { parsePayoutImport, payoutFeeOver, savePayoutBatches, uploadPayoutFile } from "@/utils/payoutImport";
import { cn } from "@/lib/utils";

type Account = { id: string; account_name: string; bank_name: string; account_number_last4: string | null; currency: string | null };
type Row =
  | { kind: "busy"; name: string }
  | { kind: "done"; text: string; detail?: string; warn?: boolean; muted?: boolean }
  | { kind: "ask"; text: string; file: File; statement: StatementData; pocket: number; picked: Record<number, string> }
  | { kind: "cash"; text: string; to: "statements" | "payouts"; file?: File };

/**
 * Loads are side effects, so each hand-off runs once even if the chat re-renders or moves
 * (e.g. into a scanner host): results are kept per hand-off id for this browser session.
 */
const runs = new Map<string, { rows: Row[]; listeners: Set<(rows: Row[]) => void> }>();
function publish(id: string, rows: Row[]) { const r = runs.get(id); if (!r) return; r.rows = rows; r.listeners.forEach(l => l(rows)); }

const num = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function statementRow(r: StatementLoad, file: File, picked: Record<number, string> = {}): Row {
  if (r.state === "saved") return { kind: "done", text: `✓ ${r.title}`, detail: `${r.lines} ${r.lines === 1 ? "line" : "lines"} added · matching now${r.skipped.length ? ` · already had ${r.skipped.join(", ")}` : ""}` };
  if (r.state === "skipped") return { kind: "done", text: r.title, detail: "Already loaded", muted: true };
  if (r.state === "needs" && r.why === "account") return { kind: "ask", text: `Which account is ${r.title}?`, file, statement: r.statement, pocket: r.pocket, picked };
  if (r.state === "needs") return { kind: "cash", text: `${r.title} doesn't add up. I may have misread it`, to: "statements", file };
  return { kind: "cash", text: r.detail, to: "statements", file };
}

/** Bani chat: bank statements and card payout reports load with Cash's own loaders; one line back per file. */
export function ChatCashUpload({ handoff }: { handoff: CashUploadHandoff }) {
  const { tenantId } = useActiveTenant();
  const { user, isAdmin, roleLoading } = useAuth();
  const { isPreviewActive } = usePreviewMode();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>(() => runs.get(handoff.id)?.rows ?? handoff.files.map(f => ({ kind: "busy" as const, name: f.name })));
  const [accounts, setAccounts] = useState<Account[]>([]);
  const allowed = isAdmin && !isPreviewActive;

  useEffect(() => {
    const existing = runs.get(handoff.id);
    if (existing) { existing.listeners.add(setRows); setRows(existing.rows); return () => { existing.listeners.delete(setRows); }; }
    if (roleLoading || !tenantId) return;
    const run = { rows: handoff.files.map(f => ({ kind: "busy" as const, name: f.name })) as Row[], listeners: new Set([setRows]) };
    runs.set(handoff.id, run);
    if (!allowed) { publish(handoff.id, [{ kind: "done", text: "Loading bank files needs admin access.", muted: true }]); return () => { run.listeners.delete(setRows); }; }
    void (async () => {
      if (handoff.kind === "statement") {
        const { data, error } = await supabase.from("bank_accounts").select("id,account_name,bank_name,account_number_last4,currency").eq("tenant_id", tenantId).eq("is_active", true).order("account_name");
        const list = (error ? [] : data ?? []) as Account[];
        setAccounts(list);
        const out: Row[] = [...run.rows];
        let any = false;
        await Promise.all(handoff.files.map(async (file, i) => {
          try {
            const r = await loadStatementFile(tenantId, file, list, getBaseCurrency());
            if (r.state === "saved") any = true;
            out[i] = statementRow(r, file);
          } catch (e) {
            out[i] = { kind: "cash", text: (e as { message?: string }).message || "Couldn't save this statement", to: "statements", file };
          }
          publish(handoff.id, [...out]);
        }));
        if (any) startBaniMatching(tenantId);
        return;
      }
      // Card payout report: KPay is the only reader so far.
      const file = handoff.files[0];
      try {
        const { data: procs, error: pe } = await supabase.from("payment_processors" as any).select("*").eq("tenant_id", tenantId).eq("is_active", true);
        if (pe) throw pe;
        const kpay = ((procs ?? []) as unknown as PaymentProcessor[]).filter(p => /kpay/i.test(p.type) || /kpay/i.test(p.name));
        if (kpay.length !== 1) { publish(handoff.id, [{ kind: "cash", text: kpay.length ? "You have more than one KPay account set up" : "I can only read KPay payout reports so far", to: "payouts" }]); return; }
        const processor = kpay[0];
        const importId = await uploadPayoutFile(tenantId, processor, file);
        const read = await parsePayoutImport(importId);
        if (read.unknown_merchants.length) { publish(handoff.id, [{ kind: "cash", text: `New merchant number ${read.unknown_merchants.join(", ")}. Add it, then save the report there`, to: "payouts" }]); return; }
        if (!read.batches.length) { publish(handoff.id, [{ kind: "cash", text: "I couldn't find any payouts in it", to: "payouts" }]); return; }
        const { data: ms, error: me } = await supabase.from("payment_processor_merchants" as any).select("*").eq("tenant_id", tenantId).eq("processor_id", processor.id);
        if (me) throw me;
        const res = await savePayoutBatches({ tenantId, processor, importId, batches: read.batches, merchants: (ms ?? []) as unknown as ProcessorMerchant[], currency: read.currency });
        const over = payoutFeeOver(read.batches);
        const parts: string[] = [];
        if (res.skipped) parts.push(`${res.skipped} already saved`);
        if (over > 0.01) parts.push(`Fees ${num(over)} above your rate`);
        publish(handoff.id, [{ kind: "done", text: `✓ ${processor.name} · ${res.saved} ${res.saved === 1 ? "payout" : "payouts"} saved`, detail: parts.join(" · ") || "Fees match your rates", warn: over > 0.01 }]);
        if (res.saved) startBaniMatching(tenantId);
      } catch (e) {
        publish(handoff.id, [{ kind: "cash", text: (e as { message?: string }).message || "Couldn't load this report", to: "payouts" }]);
      }
    })();
    return () => { run.listeners.delete(setRows); };
  }, [handoff, roleLoading, tenantId, allowed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Accounts for a later "which account?" answer after a remount.
  useEffect(() => {
    if (accounts.length || !tenantId || !rows.some(r => r.kind === "ask")) return;
    void supabase.from("bank_accounts").select("id,account_name,bank_name,account_number_last4,currency").eq("tenant_id", tenantId).eq("is_active", true).order("account_name")
      .then(({ data }) => setAccounts((data ?? []) as Account[]));
  }, [rows, accounts.length, tenantId]);

  const answer = async (index: number, row: Extract<Row, { kind: "ask" }>, accountId: string) => {
    if (!tenantId || !allowed || !accounts.some(a => a.id === accountId)) return;
    const picked = { ...row.picked, [row.pocket]: accountId };
    const next = [...rows]; next[index] = { kind: "busy", name: row.file.name }; publish(handoff.id, next);
    try {
      const r = await loadStatementFile(tenantId, row.file, accounts, getBaseCurrency(), picked, row.statement);
      const after = [...(runs.get(handoff.id)?.rows ?? next)]; after[index] = statementRow(r, row.file, picked); publish(handoff.id, after);
      if (r.state === "saved") startBaniMatching(tenantId);
    } catch (e) {
      const after = [...(runs.get(handoff.id)?.rows ?? next)]; after[index] = { kind: "cash", text: (e as { message?: string }).message || "Couldn't save this statement", to: "statements", file: row.file }; publish(handoff.id, after);
    }
  };
  const openCash = (row: Extract<Row, { kind: "cash" }>) => {
    if (row.to === "statements") {
      if (row.file && user?.id && tenantId) stageBaniStatements(`${user.id}:${tenantId}`, [row.file]);
      navigate("/finance/cash?bani_statements=1");
    } else navigate("/finance/cash?view=payouts");
  };

  return <CashUploadRows rows={rows} accounts={accounts} onAnswer={(i, r, id) => void answer(i, r, id)} onOpen={openCash} />;
}

export type CashUploadRow = Row;
/** The one-line results, kept separate so they render the same in every host. */
export function CashUploadRows(p: { rows: Row[]; accounts: { id: string; account_name: string }[]; onAnswer: (index: number, row: Extract<Row, { kind: "ask" }>, accountId: string) => void; onOpen: (row: Extract<Row, { kind: "cash" }>) => void }) {
  return (
    <div className="space-y-2 text-[13px]" aria-live="polite">
      {p.rows.map((r, i) => r.kind === "busy"
        ? <p key={i} className="flex items-center gap-2 text-muted-foreground" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" /><span className="truncate">Loading {r.name}…</span></p>
        : r.kind === "done"
          ? <div key={i}>
              <p className={cn(r.muted ? "text-muted-foreground" : "font-medium text-emerald-700 dark:text-emerald-400")}>{r.text}</p>
              {r.detail && <p className="text-[12px]" style={r.warn ? { color: "#B45309" } : undefined}><span className={r.warn ? "" : "text-muted-foreground"}>{r.detail}</span></p>}
            </div>
          : r.kind === "ask"
            ? <div key={i} className="space-y-1.5">
                <p>{r.text}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]" role="radiogroup">
                  {p.accounts.map(a => <button key={a.id} type="button" role="radio" aria-checked={false} className="whitespace-nowrap text-muted-foreground hover:text-foreground" onClick={() => p.onAnswer(i, r, a.id)}>{a.account_name}</button>)}
                </div>
              </div>
            : <div key={i} className="space-y-1.5"><p className="text-[#B45309]">{r.text}.</p><button type="button" className="floating-bani-reply" onClick={() => p.onOpen(r)}>Open in Cash</button></div>)}
    </div>
  );
}
