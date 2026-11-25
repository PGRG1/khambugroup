import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
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

export type ChatBillPhase = ChatExpensePhase | "asking" | "booking" | "booked" | "sent" | "undone";
export type ChatBookedRow = { left: string; amount: number };
type BillProps = {
  phase: ChatBillPhase; reason?: string;
  /** What Bani is saying now: notes and the current question or read-back. */
  said: string[];
  vendor: string; number: string; due: string | null; currency: string; recordsTo: string;
  rows: ChatBookedRow[];
  canUndo: boolean; undoing: boolean;
  onUndo: () => void; onSee: () => void; onOpenFull: () => void;
};

const Tick = () => <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0"><circle cx="8" cy="8" r="8" fill="#15803D" /><path d="M4.6 8.3l2.2 2.2 4.6-4.8" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;

/** Expense bill in chat: Bani asks in plain messages until it's clear, then shows what was booked. */
export function ChatBillCard(p: BillProps) {
  const said = p.said.length ? <div className="space-y-2">{p.said.map((t, i) => <p key={i} className="whitespace-pre-line tabular-nums">{t}</p>)}</div> : null;
  if (p.phase === "denied") return <p>Filing bills needs Do access on Expenses.</p>;
  if (p.phase === "reading" || p.phase === "failed" || p.phase === "full" || p.phase === "duplicate") return <Status phase={p.phase} reason={p.reason} openLabel="Open in Expenses" onOpenFull={p.onOpenFull} />;
  if (p.phase === "asking") return said;
  if (p.phase === "booking") return <div className="space-y-2">{said}<p className="flex items-center gap-2 text-[13px] text-muted-foreground" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" />{p.reason ?? "Booking…"}</p></div>;
  if (p.phase === "undone") return <p>Undone.</p>;
  if (p.phase === "sent") return <div className="space-y-2">{said}<p>Sent to an approver. You can't book this one yourself.</p><button type="button" className="text-[13px] font-medium text-muted-foreground" onClick={p.onSee}>See bill</button></div>;
  if (p.phase !== "booked") return <p>{p.reason ?? "It didn't book."}</p>;
  const foot = [p.vendor, p.number ? `Bill ${p.number}` : "No bill number", p.due ? `Due ${shortDay(p.due)}` : "No due date"].join(" · ");
  return (
    <div className="space-y-3">
      {said}
      <div className="overflow-hidden rounded-xl border border-border bg-white text-[13px]">
        <div className="flex h-11 items-center justify-between gap-3 px-4">
          <span className="flex items-center gap-2 font-semibold"><Tick />Booked</span>
          <span className="shrink-0 text-[12px] text-muted-foreground">Records to {p.recordsTo}</span>
        </div>
        {p.rows.map((r, i) => (
          <div key={i} className="flex h-11 items-center justify-between gap-3 px-4" style={{ borderTop: `1px solid ${HAIR}` }}>
            <span className="min-w-0 truncate" title={r.left}>{r.left}</span>
            <span className="shrink-0 whitespace-nowrap tabular-nums">{num(r.amount)}</span>
          </div>
        ))}
        <div className="flex h-11 items-center px-4 text-[12px] text-muted-foreground" style={{ borderTop: `1px solid ${HAIR}` }}>
          <span className="truncate" title={foot}>{foot}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {p.canUndo && <button type="button" className="text-[13px] font-medium text-muted-foreground disabled:opacity-50" disabled={p.undoing} onClick={p.onUndo}>{p.undoing ? "Undoing…" : "Undo"}</button>}
        <button type="button" className="text-[13px] font-medium text-muted-foreground" onClick={p.onSee}>See bill</button>
      </div>
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
