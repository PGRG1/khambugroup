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

export type ChatBillPhase = ChatExpensePhase | "setup" | "asking" | "review" | "booking" | "booked" | "sent" | "held" | "undone";
export type ChatBookedRow = { left: string; amount: number };
type BillProps = {
  phase: ChatBillPhase; reason?: string;
  /** What Bani is saying now: notes and the current question or read-back. */
  said: string[];
  vendor: string; number: string; due: string | null; currency: string; recordsTo: string;
  rows: ChatBookedRow[];
  canUndo: boolean; undoing: boolean;
  onUndo: () => void; onSee: () => void; onOpenFull: () => void;
  /** The bill laid out before booking (phase "review"). */
  review?: BillReview;
};
export type BillReviewLine = { line_no: number; description: string; amount: number; account_id: string | null };
export type BillReview = {
  number: string; date: string; due: string; venue: string; venues: string[]; terms: string; total: number;
  /** One line above the card: what the bill is and what's left to do. Bani's questions go under the card. */
  intro?: string;
  newVendor: boolean; lines: BillReviewLine[];
  accounts: { id: string; code: string; name: string; group: string }[];
  saving: boolean;
  onField: (k: "number" | "date" | "due" | "venue", v: string) => void;
  onAccount: (line: number, account: string) => void;
  onBook: () => void; onHold: () => void;
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
  if (p.phase === "held") return <div className="space-y-2"><p>Held for review in Expenses. Nothing is booked yet.</p><button type="button" className="text-[13px] font-medium text-muted-foreground" onClick={p.onSee}>See bill</button></div>;
  if (p.phase === "review" && p.review) return <BillReviewCard {...p} r={p.review} />;
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

/** The bill as a card before booking: header, checks, fields, one row per line with its account and P&L place, Book. */
function BillReviewCard(p: BillProps & { r: BillReview }) {
  const r = p.r;
  const field = "h-9 w-full min-w-0 rounded-lg border border-[#DCE4E0] bg-white px-2.5 text-[13px]";
  const lbl = (t: string, el: ReactNode) => <label className="flex min-w-0 flex-col gap-1"><span className="text-[11.5px] text-muted-foreground">{t}</span>{el}</label>;
  const missing = r.lines.filter(l => !l.account_id).length;
  const sum = Math.round(r.lines.reduce((n, l) => n + l.amount, 0) * 100) / 100;
  const adds = Math.abs(sum - r.total) < 0.01;
  const ready = !missing && !!r.venue && !!r.date && !r.saving;
  const groups = [...new Set(r.accounts.map(a => a.group))];
  const sub = [r.number ? `Bill ${r.number}` : "No bill number", r.date ? shortDay(r.date) : "", r.terms, r.venue].filter(Boolean).join(" · ");
  return (
    <div className="space-y-2.5">
      {r.intro && <p>{r.intro}</p>}
      <div className="overflow-hidden rounded-2xl border bg-white text-[13px]" style={{ borderColor: HAIR }}>
        <div className="flex items-start justify-between gap-4 px-4 pb-3 pt-4">
          <div className="min-w-0"><p className="truncate text-[18px] font-semibold" title={p.vendor}>{p.vendor}</p><p className="mt-0.5 truncate text-[13px] text-muted-foreground">{sub}</p></div>
          <div className="shrink-0 text-right"><p className="text-[22px] font-semibold tabular-nums">{formatMoney(r.total, p.currency)}</p><p className="text-[12px] text-muted-foreground">{r.lines.length} line{r.lines.length === 1 ? "" : "s"}</p></div>
        </div>
        <div className="flex items-center gap-5 overflow-x-auto whitespace-nowrap px-4 py-2.5" style={{ background: "#F6F9F7", borderTop: `1px solid ${HAIR}`, borderBottom: `1px solid ${HAIR}` }}>
          {r.newVendor && <span style={{ color: AMBER }}>● New vendor, added when you book</span>}
          <span className="text-[#1F6B5E]">✓ Not a duplicate</span>
          {adds ? <span className="text-[#1F6B5E]">✓ Adds up</span> : <span style={{ color: AMBER }}>● Lines come to {num(sum)}</span>}
          {missing > 0 && <span style={{ color: AMBER }}>● Pick the expense type{missing > 1 ? ` for ${missing} lines` : ""}</span>}
          {!r.venue && <span style={{ color: AMBER }}>● Pick the venue</span>}
          <button type="button" className="ml-auto text-[#1F6B5E] underline underline-offset-2" onClick={p.onOpenFull}>Open in Expenses</button>
        </div>
        <div className="grid gap-3 px-4 py-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
          {lbl("Bill no.", <input className={field} defaultValue={r.number} onBlur={e => e.target.value.trim() !== r.number && r.onField("number", e.target.value.trim())} />)}
          {lbl("Bill date", <input type="date" className={field} value={r.date} onChange={e => e.target.value && r.onField("date", e.target.value)} />)}
          {lbl("Due date", <input type="date" className={field} value={r.due} min={r.date || undefined} onChange={e => r.onField("due", e.target.value)} />)}
          {lbl("Venue", <select className={cn(field, !r.venue && "border-[#EF9F27] bg-[#FFF8EC]")} value={r.venue} onChange={e => r.onField("venue", e.target.value)}>{!r.venue && <option value="">Pick a venue</option>}{r.venues.map(v => <option key={v} value={v}>{v}</option>)}</select>)}
          {lbl("Records to", <span className={cn(field, "flex items-center bg-muted/30")}>{p.recordsTo || "—"}</span>)}
        </div>
        <div className="overflow-x-auto" style={{ borderTop: `1px solid ${HAIR}` }}>
          <table className="w-full border-collapse tabular-nums">
            <thead style={{ background: "#F7F9F8" }}><tr>
              <th className="whitespace-nowrap px-3 py-2 pl-4 text-left text-[12px] font-normal text-muted-foreground">Description</th>
              <th className="whitespace-nowrap px-3 py-2 text-left text-[12px] font-normal text-muted-foreground">Expense type</th>
              <th className="whitespace-nowrap px-3 py-2 text-left text-[12px] font-normal text-muted-foreground">In the P&amp;L</th>
              <th className="whitespace-nowrap px-3 py-2 pr-4 text-right text-[12px] font-normal text-muted-foreground">Amount</th>
            </tr></thead>
            <tbody>{r.lines.map(l => {
              const a = r.accounts.find(x => x.id === l.account_id);
              return <tr key={l.line_no} style={{ borderTop: `1px solid ${HAIR}`, background: a ? undefined : "#FFFBF3" }}>
                <td className="max-w-[260px] truncate px-3 py-2.5 pl-4" title={l.description}>{l.description || "—"}</td>
                <td className="px-3 py-2"><select aria-label={`Expense type for ${l.description}`} className={cn(field, "h-8 w-auto min-w-[190px]", !a && "border-[#EF9F27] bg-[#FFF8EC]")} value={l.account_id ?? ""} onChange={e => r.onAccount(l.line_no, e.target.value)}>
                  <option value="">Pick the expense type</option>
                  {groups.map(g => <optgroup key={g} label={g}>{r.accounts.filter(x => x.group === g).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>)}
                </select></td>
                <td className="whitespace-nowrap px-3 py-2.5">{a ? <><span className="text-muted-foreground">{a.group} ›</span> {a.code} {a.name}</> : <span className="text-muted-foreground">—</span>}</td>
                <td className="whitespace-nowrap px-3 py-2.5 pr-4 text-right">{num(l.amount)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <div className="flex items-center gap-5 px-4 py-3.5" style={{ borderTop: `1px solid ${HAIR}` }}>
          <span className="whitespace-nowrap">Total <b className="font-medium tabular-nums">{formatMoney(r.total, p.currency)}</b></span>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="h-9 rounded-full border border-[#CFD8D3] bg-white px-4 text-[13px] font-medium disabled:opacity-40" disabled={r.saving} onClick={r.onHold}>Hold for review</button>
            <button type="button" className="h-9 whitespace-nowrap rounded-full px-5 text-[13px] font-medium text-white disabled:opacity-40" style={{ background: "var(--fb-ink,#17302C)" }} disabled={!ready} onClick={r.onBook}>{r.saving ? "Saving…" : `Book ${formatMoney(r.total, p.currency)}`}</button>
          </div>
        </div>
      </div>
      {p.said.length > 0 && <div className="space-y-2">{p.said.map((t, i) => <p key={i} className="whitespace-pre-line tabular-nums">{t}</p>)}</div>}
    </div>
  );
}

/* ───────────── Bill setup in chat: one step at a time, like a supplier invoice ───────────── */

export type BillSetupStep = "vendor" | "type" | "venue";
export type BillSetupProps = {
  steps: BillSetupStep[]; at: number; done: string[]; busy: boolean; error?: string;
  vendorName: string; total: number; currency: string;
  /** The same "is new. Add it?" supplier step as a supplier invoice in chat. */
  vendorStep: ReactNode;
  /** Expense type step: each line with Bani's suggested account (picked already) and why. */
  lines: { line_no: number; description: string; amount: number; account_id: string | null; suggested: boolean }[];
  accounts: { id: string; code: string; name: string; group: string }[];
  onAccount: (line: number, account: string) => void; onTypeDone: () => void;
  venues: string[]; onVenue: (v: string) => void; shared: boolean;
};

export function ChatBillSetup(p: BillSetupProps) {
  const step = p.steps[p.at];
  const field = "h-8 w-full min-w-0 rounded-[7px] border border-[#E1E7E4] bg-[#FBFCFB] px-2.5 text-[13px]";
  const card = "w-full max-w-[640px] rounded-2xl border bg-white p-4";
  const go = "h-9 rounded-full bg-[#1F6B5E] px-4 text-[13px] font-medium text-white disabled:opacity-50";
  const groups = [...new Set(p.accounts.map(a => a.group))];
  const head = <p className="text-[12px] text-muted-foreground">Step {p.at + 1} of {p.steps.length} · {step === "vendor" ? "Supplier" : step === "type" ? "Expense type" : "Venue"}</p>;
  return (
    <div className="space-y-2.5">
      {p.at === 0 && <p className="text-[14px]">Before I can book it, there {p.steps.length === 1 ? "is 1 thing" : `are ${p.steps.length} things`} to set up. I'll go one at a time.</p>}
      {p.done.length > 0 && <div className="space-y-1">{p.done.map(d => <p key={d} className="text-[13px] text-[#2F7A5E]">✓ {d}</p>)}</div>}
      {head}
      {step === "vendor" && p.vendorStep}
      {step === "type" && <>
        <p className="text-[14px]">What kind of cost is it? I've picked what fits best — change it if it's wrong.</p>
        <div className={card} style={{ borderColor: HAIR }}>
          {p.lines.map(l => {
            const a = p.accounts.find(x => x.id === l.account_id);
            return <div key={l.line_no} className="grid items-center gap-3 border-b py-2.5 first:pt-0 last:border-b-0" style={{ borderColor: HAIR, gridTemplateColumns: "1fr auto" }}>
              <div className="min-w-0">
                <p className="truncate text-[13px]" title={l.description}>{l.description || "—"} <span className="tabular-nums text-muted-foreground">· {num(l.amount)}</span></p>
                <select aria-label={`Expense type for ${l.description}`} className={cn(field, "mt-1.5 h-9", !a && "border-[#EF9F27] bg-[#FFF8EC]")} value={l.account_id ?? ""} onChange={e => p.onAccount(l.line_no, e.target.value)}>
                  <option value="">Pick the expense type</option>
                  {groups.map(g => <optgroup key={g} label={g}>{p.accounts.filter(x => x.group === g).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>)}
                </select>
                <p className="mt-1 text-[12px] text-muted-foreground">{a ? <>{l.suggested && <span className="mr-1.5 rounded-md bg-[#E4F1EC] px-1.5 py-px text-[11px] text-[#1F6B5E]">Bani suggests</span>}In the P&amp;L: {a.group} › {a.code} {a.name}</> : <span style={{ color: AMBER }}>I couldn't tell — pick one</span>}</p>
              </div>
            </div>;
          })}
          <div className="mt-3 flex justify-end"><button type="button" disabled={p.busy || p.lines.some(l => !l.account_id)} className={go} onClick={p.onTypeDone}>Use {p.lines.length > 1 ? "these" : "this"}</button></div>
        </div>
      </>}
      {step === "venue" && <>
        <p className="text-[14px]">Which venue is this for?</p>
        <div className="flex flex-wrap gap-2">{p.venues.map(v => <button key={v} type="button" className="floating-bani-reply" onClick={() => p.onVenue(v)}>{v}</button>)}</div>
        {p.shared && <p className="text-[13px] text-muted-foreground">Shared by several venues? Tell me who pays how much, e.g. "half Assembly, half Caliente".</p>}
      </>}
      {p.error && <p className="text-[13px]" style={{ color: AMBER }}>{p.error}</p>}
    </div>
  );
}
