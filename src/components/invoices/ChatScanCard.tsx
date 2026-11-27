import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { RECEIVING_REASONS } from "@/utils/receivingReasons";

export type ChatScanLine = {
  key: string; index: number; name: string; billed: number; accepted: number; unit: string; total: number;
  /** Supplier code and the supplier's own name for the item, as printed. */
  code?: string;
  /** Price on the invoice, and the supplier's saved price when Bani's check found a change. */
  price: number; was?: number | null;
  /** Accepted unit price: defaults to the invoice price; a different price disputes the line. */
  acceptedPrice?: number;
  /** The item has past purchases or another supplier: the price opens its history. */
  history?: boolean;
  reason?: string; note?: string;
  /** Why this line could not go into the books yet (no group or account for the venue): Book stays off. */
  blocked?: string;
  /** Bani's suggested Items Master entry for a line it couldn't link on its own: the supplier's code (when saved), their name, unit and why. */
  suggestion?: { text: string; why: string };
};
export type ChatScanPhase = "reading" | "failed" | "denied" | "many" | "duplicate" | "review" | "ready" | "saved";
export type ChatScanAnswers = { dueDate: string | null; receivedDate: string; hold: boolean };
export type ChatScanField = "invoice_number" | "invoice_date" | "venue";

type Props = {
  phase: ChatScanPhase;
  supplier: string;
  number: string;
  date: string;
  venue: string;
  venues: string[];
  total: number;
  currency: string;
  lines: ChatScanLine[];
  /** Days from the supplier's saved terms, e.g. "30 days" → 30. */
  termsDays: number | null;
  /** Due date printed on the invoice. */
  printedDue: string | null;
  saving: boolean;
  onField: (field: ChatScanField, value: string) => void;
  onQty: (index: number, value: number) => void;
  onPrice: (index: number, value: string) => void;
  onReason: (index: number, reason: string, note?: string) => void;
  onBook: (answers: ChatScanAnswers) => void;
  onOpenFull: () => void;
  /** Why it can't be booked here yet (review phase). */
  reasons?: string[];
  onHistory?: (index: number) => void;
  /** Confirm Bani's suggestion for a line. */
  onConfirm?: (index: number) => void;
  /** Pick a different item for a line, set up right here in chat. */
  onPick?: (index: number) => void;
  /** While reading: what is known so far (photo read, supplier found, items being matched). */
  progress?: { read: boolean; lines: number; total: number; supplier: string; matching: boolean };
  /** Supplier's saved payment terms, e.g. "Net 30" or "COD". */
  terms?: string;
};

const AMBER = "#B45309";
const HAIR = "#E2E6E3";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (date: string, days: number) => { const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate() + days); return iso(d); };
const qty = (n: number) => String(Math.round(n * 1000) / 1000);
const num = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const label = (v: string) => RECEIVING_REASONS.find(r => r.value === v)?.label ?? v;
const longDate = (d: string) => { const t = Date.parse(`${d}T00:00:00Z`); return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : ""; };
const accPrice = (l: ChatScanLine) => (l.acceptedPrice != null && Number.isFinite(l.acceptedPrice) ? l.acceptedPrice : l.price);
const priceChanged = (l: ChatScanLine) => Math.round(accPrice(l) * 100) !== Math.round(l.price * 100);

/** A changed count needs a reason; "Other" also needs a note (same rule as Scan Invoice). */
export function lineSettled(l: ChatScanLine): boolean {
  if (l.accepted === l.billed) return true;
  if (!l.reason || l.reason === "matched") return false;
  return l.reason !== "other" || !!l.note?.trim();
}

/** Held back: what was billed minus what was accepted (count × accepted price), per line, never negative. */
export const heldForCounts = (lines: ChatScanLine[]) =>
  Math.round(lines.reduce((s, l) => s + Math.max(0, l.billed * l.price - l.accepted * accPrice(l)), 0) * 100) / 100;

const fieldCls = "h-9 w-full min-w-0 rounded-lg border border-[#CFD8D3] bg-white px-2.5 text-[13px] disabled:bg-muted/40";
const boxCls = "h-8 w-full min-w-0 rounded-md border bg-white px-2 text-right text-[13px] tabular-nums";

/** Bani chat: the whole invoice as a table. The receiver ticks each line, types what was accepted, then Book or Hold. */
export function ChatScanCard(p: Props) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [due, setDue] = useState<string | null | undefined>(undefined);
  const [delivered, setDelivered] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "book" | "hold">(null);
  const [held, setHeld] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  // Narrow (phone or the small chat window): one card per line instead of a sideways-scrolling table.
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => { setPanel(anchor.current?.closest<HTMLElement>(".floating-bani-panel") ?? null); });
  useLayoutEffect(() => {
    const el = anchor.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < 640));
    ro.observe(el);
    setNarrow(el.clientWidth > 0 && el.clientWidth < 640);
    return () => ro.disconnect();
  }, [p.phase]);
  useEffect(() => {
    if (!confirm) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !p.saving) setConfirm(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [confirm, p.saving]);

  if (p.phase === "reading") {
    const g = p.progress;
    const step = (state: "done" | "now" | "next", text: string) => <li className="flex items-center gap-2.5 text-[13px]" style={{ color: state === "next" ? "#8A9893" : undefined }}>
      {state === "done" ? <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[#1F6B5E] text-white"><Check className="h-3 w-3" strokeWidth={3} /></span>
        : state === "now" ? <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin text-[#1F6B5E]" />
        : <span className="h-[18px] w-[18px] shrink-0 rounded-full border border-dashed border-[#C3CEC9]" />}
      <span className="whitespace-nowrap">{text}</span></li>;
    return <div className="w-full max-w-[440px] rounded-2xl border bg-white px-[18px] py-4" style={{ borderColor: HAIR }} role="status">
      <p className="text-[14px] font-medium">Reading the invoice</p>
      <ul className="mt-3 space-y-3">
        {step(g?.read ? "done" : "now", g?.read ? `Read the photo · ${g.lines} line${g.lines === 1 ? "" : "s"}, ${formatMoney(g.total, p.currency)}` : "Reading the photo…")}
        {step(g?.read ? (g.supplier ? "done" : "now") : "next", g?.supplier ? `Supplier: ${g.supplier}` : "Finding the supplier")}
        {step(g?.read && g.supplier ? (g.matching ? "now" : "done") : "next", g?.matching ? "Matching items to your Items Master…" : "Matching items to your Items Master")}
        {step("next", "Checking prices")}
      </ul>
    </div>;
  }
  const full = (text: string) => <div className="space-y-2"><p>{text}</p><button type="button" className="floating-bani-reply" onClick={p.onOpenFull}>Open full review</button></div>;
  if (p.phase === "denied") return <p>Booking invoices needs edit access to Purchasing.</p>;
  if (p.phase === "failed") return full("I couldn't read this one. Open it to try again or enter it by hand.");
  if (p.phase === "many") return full("This file has more than one invoice.");
  if (p.phase === "duplicate") return <p>{p.supplier} {p.number} is already booked.</p>;
  if (p.phase === "review") return <div className="space-y-2">
    <p>Can't book this one yet:</p>
    {p.reasons?.length ? <ul className="list-disc pl-5 space-y-0.5">{p.reasons.slice(0, 6).map(r => <li key={r}>{r}</li>)}</ul> : null}
    <p>Add {p.reasons?.length === 1 ? "it" : "them"} in the full review, then save.</p>
    <button type="button" className="floating-bani-reply" onClick={p.onOpenFull}>Open full review</button>
  </div>;

  const saved = p.phase === "saved";
  const today = iso(new Date());
  const changed = p.lines.filter(l => l.accepted !== l.billed || priceChanged(l));
  const defaultDue = p.printedDue ?? (p.termsDays != null && p.date ? addDays(p.date, p.termsDays) : null);
  const dueNow = due === undefined ? defaultDue : due;
  const deliveredOn = delivered ?? today;
  const allTicked = p.lines.every(l => ticked.has(l.key));
  const settled = p.lines.every(lineSettled);
  const blocked = p.lines.filter(l => l.blocked);
  const toConfirm = p.lines.filter(l => l.suggestion);
  const priceDiffs = p.lines.filter(l => l.was != null).length;
  const canHold = allTicked && settled && !p.saving && !saved && !!p.venue && !toConfirm.length;
  const ready = canHold && !blocked.length;
  const invoiced = Math.round(p.lines.reduce((s, l) => s + l.billed * l.price, 0) * 100) / 100;
  const heldBack = heldForCounts(p.lines);
  const accepted = Math.round((invoiced - heldBack) * 100) / 100;
  const tick = (k: string) => setTicked(t => { const n = new Set(t); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const setCount = (l: ChatScanLine, raw: string) => {
    const v = parseFloat(raw);
    if (!Number.isFinite(v) || v < 0) return;
    p.onQty(l.index, v);
    setTicked(t => new Set(t).add(l.key));
  };

  const th = "px-2.5 pb-2 pt-1 text-[11px] font-normal text-muted-foreground whitespace-nowrap";
  const group = "px-2.5 pt-2 text-left text-[11px] font-medium text-foreground";
  const td = "px-2.5 py-2.5 align-middle";
  const gl = { borderLeft: `1px solid ${HAIR}` };
  const sticky = "sticky left-0 z-[1] bg-white";

  const sheet = confirm && (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 p-4" role="presentation" onClick={() => !p.saving && setConfirm(null)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="chat-inv-confirm" className="grid w-full max-w-[500px] gap-3 rounded-[18px] border bg-white p-5 shadow-lg" onClick={e => e.stopPropagation()}>
        <div className="space-y-1">
          <p id="chat-inv-confirm" className="text-[15px] font-semibold text-foreground">{confirm === "hold" ? "Hold for review?" : "Book invoice?"}</p>
          <p className="text-sm text-muted-foreground tabular-nums">{p.supplier} · {p.number} · {p.venue} · {formatMoney(p.total, p.currency)}</p>
          {changed.map(l => <p key={l.key} className="text-sm text-muted-foreground tabular-nums">{l.name}{l.accepted !== l.billed ? ` ${qty(l.accepted)} of ${qty(l.billed)}${l.unit ? ` ${l.unit}` : ""} · ${label(l.reason ?? "")}` : ""}{priceChanged(l) ? ` · price ${num(accPrice(l))} not ${num(l.price)}` : ""}</p>)}
          {heldBack > 0 && confirm === "book" && <p className="text-sm text-muted-foreground tabular-nums">{num(heldBack)} held back</p>}
          {confirm === "hold" && <p className="text-sm text-muted-foreground">Saved as a draft. Nothing goes to payables.</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={cn(buttonVariants({ variant: "outline" }), "h-9 border-0 bg-muted hover:bg-muted/80")} disabled={p.saving} onClick={() => setConfirm(null)}>Cancel</button>
          <button type="button" className={cn(buttonVariants(), "h-9 bg-[var(--fb-ink,#17302C)] text-white hover:bg-[var(--fb-ink,#17302C)]/90")} disabled={p.saving}
            onClick={() => { const hold = confirm === "hold"; setHeld(hold); p.onBook({ dueDate: dueNow, receivedDate: deliveredOn, hold }); setConfirm(null); }}>
            {p.saving ? "Saving…" : confirm === "hold" ? "Hold" : "Book"}
          </button>
        </div>
      </div>
    </div>
  );

  const field = (name: string, control: React.ReactNode) => <label className="flex min-w-0 flex-col gap-1"><span className="text-[11px] text-muted-foreground">{name}</span>{control}</label>;

  return (
    <div ref={anchor} className="space-y-3">
      {sheet && (panel ? createPortal(sheet, panel) : sheet)}
      <div className="overflow-hidden rounded-2xl border bg-white text-[13px]" style={{ borderColor: HAIR }}>
        <div className="space-y-3 px-4 pb-4 pt-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-[18px] font-semibold" title={p.supplier}>{p.supplier}</p>
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{[p.number, longDate(p.date), p.terms, p.venue].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[22px] font-semibold tabular-nums">{formatMoney(p.total, p.currency)}</p>
              <p className="text-[12px] text-muted-foreground">{saved ? (held ? "Held for review" : "Booked") : `${p.lines.length} item${p.lines.length === 1 ? "" : "s"}`}</p>
            </div>
          </div>
        </div>
        {!saved && <div className="flex items-center gap-5 overflow-x-auto whitespace-nowrap px-4 py-2.5 text-[13px]" style={{ background: "#F6F9F7", borderTop: `1px solid ${HAIR}`, borderBottom: `1px solid ${HAIR}` }}>
          <span className="text-[#1F6B5E]">✓ {p.lines.length - toConfirm.length} matched</span>
          {toConfirm.length > 0 && <span style={{ color: AMBER }}>● {toConfirm.length} to confirm</span>}
          {priceDiffs ? <span style={{ color: AMBER }}>● {priceDiffs} price{priceDiffs === 1 ? "" : "s"} differ{priceDiffs === 1 ? "s" : ""} from the Items Master</span> : <span className="text-[#1F6B5E]">✓ Prices match the Items Master</span>}
          <button type="button" className="ml-auto text-[#1F6B5E] underline underline-offset-2" onClick={p.onOpenFull}>Full review</button>
        </div>}
        <div className="px-4 pb-4 pt-4">
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            {field("Invoice no.", <input aria-label="Invoice number" disabled={saved} defaultValue={p.number} className={fieldCls} onBlur={e => { const v = e.target.value.trim(); if (v && v !== p.number) p.onField("invoice_number", v); }} />)}
            {field("Invoice date", <input type="date" aria-label="Invoice date" disabled={saved} defaultValue={p.date} className={fieldCls} onBlur={e => { if (e.target.value && e.target.value !== p.date) p.onField("invoice_date", e.target.value); }} />)}
            {field("Venue", <select aria-label="Venue" disabled={saved} value={p.venue} className={fieldCls} onChange={e => p.onField("venue", e.target.value)}>
              {!p.venue && <option value="">Pick a venue</option>}
              {[...new Set([...(p.venue ? [p.venue] : []), ...p.venues])].map(v => <option key={v} value={v}>{v}</option>)}
            </select>)}
            {field("Due date", <input type="date" aria-label="Due date" disabled={saved} min={p.date || undefined} value={dueNow ?? ""} className={fieldCls} onChange={e => setDue(e.target.value || null)} />)}
            {field("Delivered", <input type="date" aria-label="Delivery date" disabled={saved} max={today} value={deliveredOn} className={fieldCls} onChange={e => { if (e.target.value) setDelivered(e.target.value); }} />)}
          </div>
        </div>
        {narrow ? <div style={{ borderTop: `1px solid ${HAIR}` }}>{p.lines.map(l => {
          const diff = Math.round((l.accepted - l.billed) * 1000) / 1000;
          const on = ticked.has(l.key) || saved;
          const off = diff !== 0;
          const pc = priceChanged(l);
          const amberBox = { borderColor: "#EF9F27", background: "#FFF8EC" };
          return (
            <div key={l.key} className="space-y-2.5 px-4 py-3.5" style={{ borderTop: `1px solid ${HAIR}` }}>
              <div className="flex items-start gap-2.5">
                <button type="button" role="checkbox" aria-checked={on} aria-label={`${l.name} arrived`} disabled={saved} onClick={() => tick(l.key)}
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border" style={on ? { background: off || pc ? AMBER : "var(--fb-ink,#17302C)", borderColor: off || pc ? AMBER : "var(--fb-ink,#17302C)" } : { borderColor: "#C9D1CC", background: "#fff" }}>
                  {on && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                </button>
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-medium" title={l.name}>{l.name}</span>
                  {l.blocked && !saved ? <span className="block text-[12px]" style={{ color: AMBER }}>{l.blocked}</span> : l.code && <span className="block truncate text-[12px] text-muted-foreground">{l.code}</span>}
                  {l.suggestion && !saved && <>
                    <span className="block text-[12px]" style={{ color: AMBER }}>Likely: {l.suggestion.text}{l.suggestion.why ? ` · ${l.suggestion.why}` : ""}</span>
                    <span className="mt-1 block whitespace-nowrap text-[12px]"><button type="button" className="text-[#1F6B5E] underline underline-offset-2" onClick={() => p.onConfirm?.(l.index)}>Yes, that's it</button><span className="mx-1.5 text-muted-foreground">·</span><button type="button" className="text-[#1F6B5E] underline underline-offset-2" onClick={() => (p.onPick ? p.onPick(l.index) : p.onOpenFull())}>Pick another</button></span>
                  </>}
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <span className="block font-medium" style={off || pc ? { color: AMBER } : undefined}>{num(Math.round(l.accepted * accPrice(l) * 100) / 100)}</span>
                  {(off || pc) && <span className="block text-[12px] text-muted-foreground line-through">{num(Math.round(l.billed * l.price * 100) / 100)}</span>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pl-[30px]">
                <label className="min-w-0 space-y-1">
                  <span className="flex justify-between gap-1 whitespace-nowrap text-[11px] text-muted-foreground"><span>Accepted</span><span>of {qty(l.billed)}{l.unit ? ` ${l.unit}` : ""}</span></span>
                  <input key={`q-${l.accepted}`} aria-label={`${l.name} accepted`} inputMode="decimal" disabled={saved} defaultValue={qty(l.accepted)} className={cn(boxCls, "h-10")} style={off ? amberBox : { borderColor: "#CFD8D3" }}
                    onBlur={e => setCount(l, e.target.value)} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                </label>
                <label className="min-w-0 space-y-1">
                  <span className="flex justify-between gap-1 whitespace-nowrap text-[11px] text-muted-foreground"><span>Price</span>{l.history && p.onHistory
                    ? <button type="button" aria-label={`Price history for ${l.name}`} className="underline decoration-dotted underline-offset-2" style={l.was != null ? { color: AMBER } : undefined} onClick={e => { e.preventDefault(); p.onHistory?.(l.index); }}>{l.was != null ? `was ${num(l.was)}` : `billed ${num(l.price)}`}</button>
                    : <span style={l.was != null ? { color: AMBER } : undefined}>{l.was != null ? `was ${num(l.was)}` : `billed ${num(l.price)}`}</span>}</span>
                  <input key={`p-${accPrice(l)}`} aria-label={`${l.name} accepted price`} inputMode="decimal" disabled={saved} defaultValue={num(accPrice(l)).replace(/,/g, "")} className={cn(boxCls, "h-10")} style={pc ? amberBox : { borderColor: "#CFD8D3" }}
                    onBlur={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 0 && Math.round(v * 100) !== Math.round(accPrice(l) * 100)) { p.onPrice(l.index, String(v)); setTicked(t => new Set(t).add(l.key)); } }}
                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                </label>
              </div>
              {off && <div className="space-y-2 pl-[30px]">
                <select aria-label={`${l.name} reason`} disabled={saved} value={l.reason && l.reason !== "matched" ? l.reason : ""} className="h-10 w-full rounded-md border px-2 text-[13px]" style={!l.reason || l.reason === "matched" ? amberBox : { borderColor: "#CFD8D3" }}
                  onChange={e => p.onReason(l.index, e.target.value, l.note)}>
                  <option value="" disabled>{diff < 0 ? `${qty(-diff)} short: why?` : `${qty(diff)} extra: why?`}</option>
                  {RECEIVING_REASONS.filter(r => r.value !== "matched").map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                {l.reason === "other" && <input aria-label={`${l.name} note`} placeholder="Note" disabled={saved} defaultValue={l.note} className="h-10 w-full rounded-md border border-[#CFD8D3] px-2 text-[13px]" onBlur={e => p.onReason(l.index, "other", e.target.value)} />}
              </div>}
            </div>
          );
        })}</div> : <div className="overflow-x-auto" style={{ borderTop: `1px solid ${HAIR}` }}>
          <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: 1000 }}>
            <colgroup><col style={{ width: "22%" }} /><col style={{ width: "9%" }} /><col style={{ width: "10%" }} /><col style={{ width: "6%" }} /><col style={{ width: "12%" }} /><col style={{ width: "10%" }} /><col style={{ width: "11%" }} /><col style={{ width: "10%" }} /><col style={{ width: "10%" }} /></colgroup>
            <thead style={{ background: "#F7F8F7" }}>
              <tr><th className={cn(group, sticky, "bg-[#F7F8F7]")} /><th colSpan={4} className={cn(group, "text-center")}>Quantity</th><th colSpan={2} className={cn(group, "text-center")} style={gl}>Price</th><th colSpan={2} className={cn(group, "text-center")} style={gl}>Total</th></tr>
              <tr>
                <th className={cn(th, sticky, "bg-[#F7F8F7] pl-4 text-left")}>Item</th>
                <th className={cn(th, "text-center")}>Invoiced</th><th className={cn(th, "text-center")}>Accepted</th><th className={cn(th, "text-center")}>Diff</th><th className={cn(th, "text-center")}>Reason</th>
                <th className={cn(th, "text-right")} style={gl}>Unit price</th><th className={cn(th, "text-right")}>Accepted price</th>
                <th className={cn(th, "text-right")} style={gl}>Invoiced</th><th className={cn(th, "pr-4 text-right")}>Accepted</th>
              </tr>
            </thead>
            <tbody>
              {p.lines.map(l => {
                const diff = Math.round((l.accepted - l.billed) * 1000) / 1000;
                const on = ticked.has(l.key) || saved;
                const off = diff !== 0;
                const pc = priceChanged(l);
                const lineAccepted = Math.round(l.accepted * accPrice(l) * 100) / 100;
                const sub = l.blocked && !saved ? <span style={{ color: AMBER }}>{l.blocked}</span> : l.code ? l.code : null;
                const amberBox = { borderColor: "#EF9F27", background: "#FFF8EC" };
                return (
                  <tr key={l.key} style={{ borderTop: `1px solid ${HAIR}` }}>
                    <td className={cn(td, sticky, "pl-4")}>
                      <div className="flex min-w-0 items-start gap-2.5">
                        <button type="button" role="checkbox" aria-checked={on} aria-label={`${l.name} arrived`} disabled={saved} onClick={() => tick(l.key)}
                          className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border" style={on ? { background: off || pc ? AMBER : "var(--fb-ink,#17302C)", borderColor: off || pc ? AMBER : "var(--fb-ink,#17302C)" } : { borderColor: "#C9D1CC", background: "#fff" }}>
                          {on && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                        </button>
                        <div className="min-w-0">
                          <span className="block truncate" title={l.name}>{l.name}</span>
                          {sub && <span className="block truncate text-[12px] text-muted-foreground">{sub}</span>}
                          {l.suggestion && !saved && <>
                            <span className="block truncate text-[12px]" style={{ color: AMBER }} title={`${l.suggestion.text} · ${l.suggestion.why}`}>Likely: {l.suggestion.text}{l.suggestion.why ? ` · ${l.suggestion.why}` : ""}</span>
                            <span className="mt-1 block whitespace-nowrap text-[12px]"><button type="button" className="text-[#1F6B5E] underline underline-offset-2" onClick={() => p.onConfirm?.(l.index)}>Yes, that's it</button><span className="mx-1.5 text-muted-foreground">·</span><button type="button" className="text-[#1F6B5E] underline underline-offset-2" onClick={() => (p.onPick ? p.onPick(l.index) : p.onOpenFull())}>Pick another</button></span>
                          </>}
                        </div>
                      </div>
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-center tabular-nums")}>{qty(l.billed)}{l.unit && <span className="text-muted-foreground"> {l.unit}</span>}</td>
                    <td className={td}>
                      <input key={`q-${l.accepted}`} aria-label={`${l.name} accepted`} inputMode="decimal" disabled={saved} defaultValue={qty(l.accepted)} className={cn(boxCls, "text-center")} style={off ? amberBox : { borderColor: "#CFD8D3" }}
                        onBlur={e => setCount(l, e.target.value)} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-center tabular-nums")} style={{ color: off ? AMBER : "#B4BDB8" }}>{off ? (diff > 0 ? `+${qty(diff)}` : qty(diff)) : "0"}</td>
                    <td className={td}>
                      {off ? <div className="space-y-1">
                        <select aria-label={`${l.name} reason`} disabled={saved} value={l.reason && l.reason !== "matched" ? l.reason : ""} className="h-8 w-full min-w-0 rounded-md border px-1.5 text-[12px]" style={!l.reason || l.reason === "matched" ? amberBox : { borderColor: "#CFD8D3" }}
                          onChange={e => p.onReason(l.index, e.target.value, l.note)}>
                          <option value="" disabled>Why?</option>
                          {RECEIVING_REASONS.filter(r => r.value !== "matched").map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        {l.reason === "other" && <input aria-label={`${l.name} note`} placeholder="Note" disabled={saved} defaultValue={l.note} className="h-8 w-full min-w-0 rounded-md border border-[#CFD8D3] px-1.5 text-[12px]" onBlur={e => p.onReason(l.index, "other", e.target.value)} />}
                      </div> : <span className="block text-center" style={{ color: "#B4BDB8" }}>—</span>}
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-right tabular-nums")} style={gl}>
                      {l.history && p.onHistory
                        ? <button type="button" aria-label={`Price history for ${l.name}`} title="Price history" className="underline decoration-dotted underline-offset-4" onClick={() => p.onHistory?.(l.index)}>{num(l.price)}</button>
                        : num(l.price)}
                      {l.was != null && <span className="block text-[12px]" style={{ color: AMBER }}>Was {num(l.was)}</span>}
                    </td>
                    <td className={td}>
                      <input key={`p-${accPrice(l)}`} aria-label={`${l.name} accepted price`} inputMode="decimal" disabled={saved} defaultValue={num(accPrice(l)).replace(/,/g, "")} className={boxCls} style={pc ? amberBox : { borderColor: "#CFD8D3" }}
                        onBlur={e => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 0 && Math.round(v * 100) !== Math.round(accPrice(l) * 100)) { p.onPrice(l.index, String(v)); setTicked(t => new Set(t).add(l.key)); } }}
                        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-right tabular-nums")} style={gl}>{num(Math.round(l.billed * l.price * 100) / 100)}</td>
                    <td className={cn(td, "whitespace-nowrap pr-4 text-right tabular-nums")} style={off || pc ? { color: AMBER } : undefined}>{num(lineAccepted)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5 px-4 py-3.5" style={{ borderTop: `1px solid ${HAIR}` }}>
          <span className="whitespace-nowrap tabular-nums">Invoiced <b className="font-medium">{formatMoney(invoiced, p.currency)}</b></span>
          <span className="whitespace-nowrap tabular-nums">Accepted <b className="font-medium">{formatMoney(accepted, p.currency)}</b></span>
          {heldBack > 0 && <span className="whitespace-nowrap tabular-nums" style={{ color: AMBER }}>Held back {formatMoney(heldBack, p.currency)}</span>}
          {saved
            ? <span className="ml-auto font-medium text-emerald-700">{held ? "✓ Saved as a draft" : "✓ Booked · stock updated"}</span>
            : <div className="ml-auto flex items-center gap-3">
                {!allTicked && <button type="button" className="text-[13px] font-medium" onClick={() => setTicked(new Set(p.lines.map(l => l.key)))}>Tick all</button>}
                <button type="button" className="h-9 rounded-full border border-[#CFD8D3] bg-white px-4 text-[13px] font-medium disabled:opacity-40" disabled={!canHold} onClick={() => setConfirm("hold")}>Hold for review</button>
                <button type="button" className="h-9 rounded-full px-5 text-[13px] font-medium text-white disabled:opacity-40" style={{ background: "var(--fb-ink,#17302C)" }} disabled={!ready} onClick={() => setConfirm("book")}>{p.saving ? "Saving…" : `Book ${formatMoney(accepted, p.currency)}`}</button>
              </div>}
        </div>
      </div>
      {!saved && blocked.length > 0 && !blocked.every(l => /^Checking/.test(l.blocked || "")) && <p className="text-[13px]" style={{ color: AMBER }}>Can't go into the books yet. An approver sets this in Settings › Purchasing setup, or hold it for review.</p>}
      {!saved && toConfirm.length > 0 && <p className="text-[13px]" style={{ color: AMBER }}>Confirm {toConfirm.length} match{toConfirm.length === 1 ? "" : "es"} to book.</p>}
      {!saved && !p.venue && <p className="text-[13px]" style={{ color: AMBER }}>Pick the venue.</p>}
    </div>
  );
}
