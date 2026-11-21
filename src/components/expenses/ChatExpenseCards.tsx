import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { shortDay } from "@/utils/salesRecordChecks";

const AMBER = "#B45309";
const HAIR = "#ECEFED";
const num = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const th = "h-8 px-2 text-left text-[11px] font-medium uppercase tracking-[.04em] text-muted-foreground first:pl-4 last:pr-4";
const td = "h-11 px-2 align-middle first:pl-4 last:pr-4";

export type ChatExpensePhase = "reading" | "denied" | "failed" | "full" | "duplicate" | "ready" | "saved";

/** Shared states for both expense cards. */
function Status({ phase, reason, openLabel, onOpenFull }: { phase: ChatExpensePhase; reason?: string; openLabel: string; onOpenFull: () => void }) {
  if (phase === "reading") return <p className="flex items-center gap-2 text-[13px] text-muted-foreground" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" />Reading it…</p>;
  if (phase === "denied") return <p>Filing expenses needs admin access.</p>;
  if (phase === "duplicate") return <p>{reason}.</p>;
  const text = phase === "failed" ? "I couldn't read this one." : `${reason ?? "This one needs the full screen"}.`;
  return <div className="space-y-2"><p>{text}</p><button type="button" className="floating-bani-reply" onClick={onOpenFull}>{openLabel}</button></div>;
}

const Tabs = ({ items, value, onPick }: { items: [string, string][]; value?: string; onPick: (v: string) => void }) => (
  <div className="flex min-h-7 flex-wrap items-center gap-x-4 gap-y-1 text-[12px]" role="radiogroup">
    {items.map(([v, t]) => (
      <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onPick(v)}
        className={cn("whitespace-nowrap", value === v ? "font-semibold text-foreground underline decoration-2 underline-offset-[6px]" : "text-muted-foreground hover:text-foreground")}>{t}</button>
    ))}
  </div>
);

/** In-panel confirm, same look as Bani's other confirms. */
function useConfirm() {
  const anchor = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setPanel(anchor.current?.closest<HTMLElement>(".floating-bani-panel") ?? null); });
  const render = (open: boolean, close: () => void, busy: boolean, title: string, lines: string[], go: string, onGo: () => void) => {
    if (!open) return null;
    const sheet = (
      <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 p-4" role="presentation" onClick={() => !busy && close()}>
        <div role="alertdialog" aria-modal="true" aria-label={title} className="grid w-full max-w-[500px] gap-3 rounded-[18px] border bg-white p-5 shadow-lg" onClick={e => e.stopPropagation()}>
          <div className="space-y-1">
            <p className="text-[15px] font-semibold text-foreground">{title}</p>
            {lines.map(l => <p key={l} className="text-sm text-muted-foreground tabular-nums">{l}</p>)}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={cn(buttonVariants({ variant: "outline" }), "h-9 border-0 bg-muted hover:bg-muted/80")} disabled={busy} onClick={close}>Cancel</button>
            <button type="button" className={cn(buttonVariants(), "h-9 bg-[var(--fb-ink,#17302C)] text-white hover:bg-[var(--fb-ink,#17302C)]/90")} disabled={busy} onClick={onGo}>{busy ? "Saving…" : go}</button>
          </div>
        </div>
      </div>
    );
    return panel ? createPortal(sheet, panel) : sheet;
  };
  return { anchor, render };
}

const Head = ({ name, sub, total, right }: { name: string; sub: ReactNode; total: string; right: ReactNode }) => (
  <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-3.5">
    <div className="min-w-0"><p className="truncate font-semibold" title={name}>{name}</p><p className="truncate text-[12px] text-muted-foreground">{sub}</p></div>
    <div className="shrink-0 text-right"><p className="font-semibold tabular-nums">{total}</p><p className="text-[12px] text-muted-foreground">{right}</p></div>
  </div>
);

export type ChatBillLine = { line: number; category: string; amount: number; accountId: string | null };
export type ChatBillRegular = { name: string; expected: number; estimate: boolean } | null;
type BillProps = {
  phase: ChatExpensePhase; reason?: string;
  vendor: string; number: string; date: string; due: string | null; total: number; currency: string;
  venue: string; meter: string | null; periodStart: string | null; periodEnd: string | null;
  lines: ChatBillLine[]; accounts: { id: string; code: string; name: string }[];
  regular: ChatBillRegular; saving: boolean; savedAs?: "approval" | "draft";
  onAccount: (line: number, accountId: string) => void;
  onSave: (status: "pending_review" | "draft") => void;
  onOpenFull: () => void;
};

/** Expense bill in chat: check the category lines and accounts, then send for approval or hold. Never posts. */
export function ChatBillCard(p: BillProps) {
  const [confirm, setConfirm] = useState<null | "pending_review" | "draft">(null);
  const c = useConfirm();
  useEffect(() => { if (p.savedAs) setConfirm(null); }, [p.savedAs]);
  if (p.phase !== "ready" && p.phase !== "saved") return <Status phase={p.phase} reason={p.reason} openLabel="Open in Expenses" onOpenFull={p.onOpenFull} />;
  const saved = p.phase === "saved";
  const missing = p.lines.filter(l => !l.accountId).length;
  const acct = (id: string | null) => p.accounts.find(a => a.id === id);
  const diff = p.regular && p.regular.expected > 0 ? (p.total - p.regular.expected) / p.regular.expected : null;
  const off = diff != null && Math.abs(diff) >= 0.1;
  const period = p.periodStart && p.periodEnd ? `${shortDay(p.periodStart)} – ${shortDay(p.periodEnd)}` : "";
  return (
    <div ref={c.anchor} className="space-y-3">
      {c.render(!!confirm, () => setConfirm(null), p.saving,
        confirm === "draft" ? "Hold as a draft?" : "Send for approval?",
        [`${p.vendor} · ${p.number || "No number"} · ${formatMoney(p.total, p.currency)}`, confirm === "draft" ? "Nothing goes to payables yet." : "Approval and posting stay in Expenses."],
        confirm === "draft" ? "Hold" : "Send", () => confirm && p.onSave(confirm))}
      <p>{saved ? (p.savedAs === "draft" ? "Saved as a draft." : "Sent for approval.") : "Is this right?"}</p>
      <div className="overflow-hidden rounded-xl border border-border bg-white text-[13px]">
        <Head name={p.vendor} sub={`${p.number ? `Bill ${p.number}` : "No bill number"} · ${shortDay(p.date)}`} total={formatMoney(p.total, p.currency)} right={p.due ? `Due ${shortDay(p.due)}` : "No due date"} />
        {p.regular && <div className="flex h-9 items-center justify-between gap-3 px-4 text-[12px]" style={{ borderTop: `1px solid ${HAIR}` }}>
          <span className="truncate text-muted-foreground">Regular · {p.regular.name}</span>
          <span className="shrink-0 tabular-nums" style={off ? { color: AMBER } : undefined}>
            {p.regular.estimate ? "Est." : "Usual"} {num(p.regular.expected)}{diff != null && (off ? ` · ${diff > 0 ? "+" : ""}${Math.round(diff * 100)}%` : " · matches")}
          </span>
        </div>}
        <table className="w-full table-fixed border-collapse">
          <colgroup><col /><col className="w-[96px]" /></colgroup>
          <thead style={{ background: "#F7F8F7", borderTop: `1px solid ${HAIR}` }}><tr><th className={th}>Category</th><th className={th + " text-right"}>Amount</th></tr></thead>
          <tbody>
            {p.lines.map(l => (
              <tr key={l.line} style={{ borderTop: `1px solid ${HAIR}` }}>
                <td className={td + " max-w-0"}>
                  <span className="block truncate">{l.category || "Uncategorised"}</span>
                  {l.accountId
                    ? <span className="block truncate text-[12px] text-muted-foreground">{acct(l.accountId) ? `${acct(l.accountId)!.code} ${acct(l.accountId)!.name}` : "Account set"}</span>
                    : saved ? null : <select aria-label={`Account for ${l.category}`} defaultValue="" onChange={e => e.target.value && p.onAccount(l.line, e.target.value)}
                        className="mt-0.5 h-6 max-w-full rounded border-0 bg-transparent p-0 text-[12px] outline-none" style={{ color: AMBER }}>
                        <option value="" disabled>Pick an account</option>
                        {p.accounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                      </select>}
                </td>
                <td className={td + " whitespace-nowrap text-right tabular-nums"}>{num(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex h-11 items-center justify-between gap-3 px-4 text-[12px] text-muted-foreground" style={{ borderTop: `1px solid ${HAIR}` }}>
          <span className="truncate">{p.venue}{p.meter ? ` · a/c ${p.meter}` : ""}</span><span className="shrink-0">{period}</span>
        </div>
      </div>
      {!saved && missing > 0 && <p className="text-[13px]" style={{ color: AMBER }}>{missing === 1 ? "One line needs an account." : `${missing} lines need an account.`}</p>}
      {!saved && <div className="flex items-center gap-4">
        <button type="button" className="floating-bani-apply" disabled={missing > 0 || p.saving} onClick={() => setConfirm("pending_review")}>Send for approval</button>
        <button type="button" className="text-[13px] font-medium text-muted-foreground" disabled={p.saving} onClick={() => setConfirm("draft")}>Hold</button>
        <button type="button" className="ml-auto text-[13px] text-muted-foreground" onClick={p.onOpenFull}>Full screen</button>
      </div>}
    </div>
  );
}

type SlipProps = {
  phase: ChatExpensePhase; reason?: string;
  description: string; date: string; amount: number; currency: string;
  classificationId: string; classifications: { id: string; name: string }[];
  floatId: string; floats: { id: string; name: string; venue: string }[];
  saving: boolean;
  onClassification: (id: string) => void; onFloat: (id: string) => void;
  onAdd: () => void; onOpenFull: () => void;
};

/** Cash-box slip in chat: pick the cash box, then add it as pending for a manager. Never booked here. */
export function ChatCashSlipCard(p: SlipProps) {
  const [confirm, setConfirm] = useState(false);
  const c = useConfirm();
  if (p.phase !== "ready" && p.phase !== "saved") return <Status phase={p.phase} reason={p.reason} openLabel="Open cash boxes" onOpenFull={p.onOpenFull} />;
  const saved = p.phase === "saved";
  const cls = p.classifications.find(x => x.id === p.classificationId);
  const box = p.floats.find(f => f.id === p.floatId);
  return (
    <div ref={c.anchor} className="space-y-3">
      {c.render(confirm, () => setConfirm(false), p.saving, "Add to cash box?",
        [`${p.description} · ${formatMoney(p.amount, p.currency)}`, `${box?.name ?? ""} · waits for a manager to approve`], "Add", () => { p.onAdd(); setConfirm(false); })}
      <p>{saved ? "Added. Waiting for a manager." : "Is this right?"}</p>
      <div className="overflow-hidden rounded-xl border border-border bg-white text-[13px]">
        <Head name={p.description} sub={`Cash-box receipt · ${shortDay(p.date)}`} total={formatMoney(p.amount, p.currency)}
          right={cls ? cls.name : <span style={{ color: AMBER }}>No category</span>} />
        {!saved && <div className="space-y-2 px-4 pb-3 pt-3" style={{ borderTop: `1px solid ${HAIR}` }}>
          {!cls && <>
            <p className="text-[12px] text-muted-foreground">Category</p>
            <select aria-label="Category" defaultValue="" onChange={e => e.target.value && p.onClassification(e.target.value)} className="h-8 w-full rounded-md border border-border bg-white px-2 text-[12px]">
              <option value="" disabled>Pick a category</option>
              {p.classifications.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </>}
          <p className="text-[12px] text-muted-foreground">Which cash box?</p>
          <Tabs value={p.floatId || undefined} onPick={p.onFloat} items={p.floats.map(f => [f.id, f.name])} />
        </div>}
      </div>
      {!saved && <div className="flex items-center gap-4">
        <button type="button" className="floating-bani-apply" disabled={!cls || !box || !(p.amount > 0) || p.saving} onClick={() => setConfirm(true)}>Add</button>
        <button type="button" className="ml-auto text-[13px] text-muted-foreground" onClick={p.onOpenFull}>Full screen</button>
      </div>}
    </div>
  );
}
