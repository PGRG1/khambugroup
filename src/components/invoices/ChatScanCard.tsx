import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Minus, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/money";
import { RECEIVING_REASONS } from "@/utils/receivingReasons";
import { shortDay } from "@/utils/salesRecordChecks";

export type ChatScanLine = {
  key: string; index: number; name: string; billed: number; accepted: number; unit: string; total: number;
  /** Price on the invoice, and the supplier's saved price when Bani's check found a change. */
  price: number; was?: number | null;
  /** The item has past purchases or another supplier: the price opens its history. */
  history?: boolean;
  reason?: string; note?: string;
  /** Why this line could not go into the books yet (no group or account for the venue): Book stays off. */
  blocked?: string;
};
export type ChatScanPhase = "reading" | "failed" | "denied" | "many" | "duplicate" | "review" | "ready" | "saved";
export type ChatScanAnswers = { dueDate: string | null; paid: boolean; receivedDate: string; hold: boolean };

type Props = {
  phase: ChatScanPhase;
  supplier: string;
  number: string;
  date: string;
  total: number;
  currency: string;
  lines: ChatScanLine[];
  /** Days from the supplier's saved terms, e.g. "30 days" → 30. */
  termsDays: number | null;
  /** Due date printed on the invoice. */
  printedDue: string | null;
  saving: boolean;
  onField: (field: "invoice_number" | "invoice_date", value: string) => void;
  onQty: (index: number, value: number) => void;
  onReason: (index: number, reason: string, note?: string) => void;
  onBook: (answers: ChatScanAnswers) => void;
  onOpenFull: () => void;
  onHistory?: (index: number) => void;
};

const AMBER = "#B45309";
const HAIR = "#ECEFED";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (date: string, days: number) => { const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate() + days); return iso(d); };
const qty = (n: number) => String(Math.round(n * 1000) / 1000);
const step = (n: number) => (Number.isInteger(n) ? 1 : 0.5);
const num = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const label = (v: string) => RECEIVING_REASONS.find(r => r.value === v)?.label ?? v;

/** The common reasons as text tabs; "Other" opens the full scanner list. */
const SHORT_TABS: [string, string][] = [["short_delivery", "Short"], ["damaged", "Damaged"], ["wrong_item_received", "Wrong item"]];
const EXTRA_TABS: [string, string][] = [["extra_quantity_received", "Extra"], ["free_promotional_quantity", "Free"], ["supplier_over_delivery", "Over-delivered"]];

/** A changed count needs a reason; "Other" also needs a note (same rule as Scan Invoice). */
export function lineSettled(l: ChatScanLine): boolean {
  if (l.accepted === l.billed) return true;
  if (!l.reason || l.reason === "matched") return false;
  return l.reason !== "other" || !!l.note?.trim();
}

/** What the person is holding back for differences in what arrived (price checks stay with Scan Invoice's rules). */
export const heldForCounts = (lines: ChatScanLine[]) => Math.round(lines.reduce((s, l) => s + Math.max(0, l.billed - l.accepted) * l.price, 0) * 100) / 100;

const Tabs = ({ items, value, onPick }: { items: [string, string][]; value?: string; onPick: (v: string) => void }) => (
  <div className="flex h-7 items-center gap-4 overflow-x-auto text-[12px]" role="radiogroup">
    {items.map(([v, t]) => (
      <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onPick(v)}
        className={cn("shrink-0 whitespace-nowrap", value === v ? "font-semibold text-foreground underline decoration-2 underline-offset-[6px]" : "text-muted-foreground hover:text-foreground")}>{t}</button>
    ))}
  </div>
);

/** Bani chat: the receiver ticks each line that arrived (or says what didn't), Bani shows its price check, then Book or Hold. */
export function ChatScanCard(p: Props) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState<"due" | "delivered" | "number" | "date" | null>(null);
  const [due, setDue] = useState<{ date: string | null; paid: boolean } | null>(null);
  const [delivered, setDelivered] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "book" | "hold">(null);
  const [held, setHeld] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setPanel(anchor.current?.closest<HTMLElement>(".floating-bani-panel") ?? null); });
  useEffect(() => {
    if (!confirm) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !p.saving) setConfirm(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [confirm, p.saving]);

  if (p.phase === "reading") return <p className="flex items-center gap-2 text-[13px] text-muted-foreground" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" />Reading the invoice…</p>;
  const full = (text: string) => <div className="space-y-2"><p>{text}</p><button type="button" className="floating-bani-reply" onClick={p.onOpenFull}>Open full review</button></div>;
  if (p.phase === "denied") return <p>Booking invoices needs edit access to Purchasing.</p>;
  if (p.phase === "failed") return full("I couldn't read this one.");
  if (p.phase === "many") return full("This file has more than one invoice.");
  if (p.phase === "duplicate") return <p>{p.supplier} {p.number} is already booked.</p>;
  if (p.phase === "review") return full("This one needs the full review.");

  const saved = p.phase === "saved";
  const today = iso(new Date());
  const changed = p.lines.filter(l => l.accepted !== l.billed);
  const priceUp = p.lines.filter(l => l.was != null);
  const defaultDue = p.printedDue ?? (p.termsDays != null && p.date ? addDays(p.date, p.termsDays) : null);
  const dueNow = due ?? { date: defaultDue, paid: false };
  const deliveredOn = delivered ?? today;
  const allTicked = p.lines.every(l => ticked.has(l.key));
  const settled = p.lines.every(lineSettled);
  const blocked = p.lines.filter(l => l.blocked);
  const canHold = allTicked && settled && !p.saving && !saved;
  const ready = canHold && !blocked.length;
  const heldBack = heldForCounts(p.lines);
  const tick = (k: string) => setTicked(t => { const n = new Set(t); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const setCount = (l: ChatScanLine, v: number) => { p.onQty(l.index, v); setTicked(t => new Set(t).add(l.key)); };

  const th = "h-8 px-2 text-left text-[11px] font-medium uppercase tracking-[.04em] text-muted-foreground";
  const td = "h-11 px-2 align-middle";
  const linkBtn = "rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

  const sheet = confirm && (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 p-4" role="presentation" onClick={() => !p.saving && setConfirm(null)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="chat-inv-confirm" className="grid w-full max-w-[500px] gap-3 rounded-[18px] border bg-white p-5 shadow-lg" onClick={e => e.stopPropagation()}>
        <div className="space-y-1">
          <p id="chat-inv-confirm" className="text-[15px] font-semibold text-foreground">{confirm === "hold" ? "Hold for review?" : "Book invoice?"}</p>
          <p className="text-sm text-muted-foreground tabular-nums">{p.supplier} · {p.number} · {formatMoney(p.total, p.currency)}</p>
          {changed.map(l => <p key={l.key} className="text-sm text-muted-foreground tabular-nums">{l.name} {qty(l.accepted)} of {qty(l.billed)}{l.unit ? ` ${l.unit}` : ""} · {label(l.reason ?? "")}</p>)}
          {heldBack > 0 && confirm === "book" && <p className="text-sm text-muted-foreground tabular-nums">{num(heldBack)} held back</p>}
          {confirm === "hold" && <p className="text-sm text-muted-foreground">Saved as a draft. Nothing goes to payables.</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={cn(buttonVariants({ variant: "outline" }), "h-9 border-0 bg-muted hover:bg-muted/80")} disabled={p.saving} onClick={() => setConfirm(null)}>Cancel</button>
          <button type="button" className={cn(buttonVariants(), "h-9 bg-[var(--fb-ink,#17302C)] text-white hover:bg-[var(--fb-ink,#17302C)]/90")} disabled={p.saving}
            onClick={() => { const hold = confirm === "hold"; setHeld(hold); p.onBook({ dueDate: dueNow.paid ? null : dueNow.date, paid: dueNow.paid && !hold, receivedDate: deliveredOn, hold }); setConfirm(null); }}>
            {p.saving ? "Saving…" : confirm === "hold" ? "Hold" : "Book"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={anchor} className="space-y-3">
      {sheet && (panel ? createPortal(sheet, panel) : sheet)}
      <p>{saved ? (held ? "Held for review." : "Booked.") : "Tick what arrived."}</p>
      <div className="overflow-hidden rounded-xl border border-border bg-white text-[13px]">
        <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-3.5">
          <div className="min-w-0">
            <p className="truncate font-semibold">{p.supplier}</p>
            <p className="truncate text-[12px] text-muted-foreground">
              <button type="button" disabled={saved} className={linkBtn} onClick={() => setPanelOpen(panelOpen === "number" ? null : "number")}>{p.number || "No number"}</button>
              {" · "}
              <button type="button" disabled={saved} className={linkBtn} onClick={() => setPanelOpen(panelOpen === "date" ? null : "date")}>{p.date ? shortDay(p.date) : "No date"}</button>
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-semibold tabular-nums">{formatMoney(p.total, p.currency)}</p>
            <button type="button" disabled={saved} className={cn(linkBtn, "text-[12px] text-muted-foreground")} onClick={() => setPanelOpen(panelOpen === "due" ? null : "due")}>
              {dueNow.paid ? "Paid already" : dueNow.date ? `Due ${shortDay(dueNow.date)}` : "No due date"}
            </button>
          </div>
        </div>
        {panelOpen && !saved && <div className="px-4 pb-3">
          {panelOpen === "due" && <Tabs value={dueNow.paid ? "paid" : "due"} onPick={v => {
            if (v === "paid") { setDue({ date: null, paid: true }); setPanelOpen(null); }
            else if (v === "due") { setDue({ date: defaultDue, paid: false }); setPanelOpen(null); }
          }} items={[["due", defaultDue ? `Due ${shortDay(defaultDue)}` : "No due date"], ...(changed.length ? [] : [["paid", "Paid already"]] as [string, string][])]} />}
          {panelOpen === "due" && <input type="date" aria-label="Due date" min={p.date || undefined} className="mt-2 h-8 rounded-md border border-border bg-white px-2 text-[13px]" onChange={e => { if (e.target.value) { setDue({ date: e.target.value, paid: false }); setPanelOpen(null); } }} />}
          {panelOpen === "number" && <input autoFocus type="text" aria-label="Invoice number" defaultValue={p.number} className="h-8 w-full rounded-md border border-border bg-white px-2 text-[13px]" onBlur={e => { if (e.target.value.trim()) p.onField("invoice_number", e.target.value.trim()); setPanelOpen(null); }} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />}
          {panelOpen === "date" && <input autoFocus type="date" aria-label="Invoice date" defaultValue={p.date} className="h-8 rounded-md border border-border bg-white px-2 text-[13px]" onBlur={e => { if (e.target.value) p.onField("invoice_date", e.target.value); setPanelOpen(null); }} />}
          {panelOpen === "delivered" && <>
            <Tabs value={deliveredOn === today ? "today" : deliveredOn === addDays(today, -1) ? "yesterday" : undefined} onPick={v => { setDelivered(v === "today" ? today : addDays(today, -1)); setPanelOpen(null); }} items={[["today", "Today"], ["yesterday", "Yesterday"]]} />
            <input type="date" aria-label="Delivery date" max={today} className="mt-2 h-8 rounded-md border border-border bg-white px-2 text-[13px]" onChange={e => { if (e.target.value) { setDelivered(e.target.value); setPanelOpen(null); } }} />
          </>}
        </div>}
        <table className="w-full table-fixed border-collapse">
          <colgroup><col className="w-10" /><col /><col className="w-[92px]" /><col className="w-[76px]" /></colgroup>
          <thead style={{ background: "#F7F8F7", borderTop: `1px solid ${HAIR}` }}>
            <tr><th className={th + " pl-4 pr-0"}><span className="sr-only">Arrived</span></th><th className={th}>Item</th><th className={th + " text-right"}>Received</th><th className={th + " pr-4 text-right"}>Price</th></tr>
          </thead>
          <tbody>
            {p.lines.map(l => {
              const diff = l.accepted !== l.billed;
              const on = ticked.has(l.key) || saved;
              const editing = open === l.key && !saved;
              const tabs = l.accepted < l.billed ? SHORT_TABS : EXTRA_TABS;
              const inTabs = tabs.some(([v]) => v === l.reason);
              const sub = l.blocked && !saved ? l.blocked : diff ? (l.reason && l.reason !== "matched" ? label(l.reason) : "Why?") : l.was != null ? `Was ${num(l.was)}` : "";
              return [
                <tr key={l.key} style={{ borderTop: `1px solid ${HAIR}` }}>
                  <td className={td + " pl-4 pr-0"}>
                    <button type="button" role="checkbox" aria-checked={on} aria-label={`${l.name} arrived`} disabled={saved} onClick={() => tick(l.key)}
                      className="grid h-4 w-4 place-items-center rounded-[4px] border" style={on ? { background: diff ? AMBER : "var(--fb-ink,#17302C)", borderColor: diff ? AMBER : "var(--fb-ink,#17302C)" } : { borderColor: "#C9D1CC", background: "#fff" }}>
                      {on && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </button>
                  </td>
                  <td className={td + " max-w-0"}>
                    <span className="block truncate" title={l.name}>{l.name}</span>
                    {sub && <span className="block truncate text-[12px]" style={{ color: AMBER }}>{sub}</span>}
                  </td>
                  <td className={td + " whitespace-nowrap text-right tabular-nums"} style={diff ? { color: AMBER } : undefined}>
                    {editing
                      ? <span className="inline-flex items-center gap-1">
                          <button type="button" aria-label={`Less ${l.name}`} disabled={l.accepted <= 0} className="grid h-6 w-6 place-items-center rounded-full border border-border text-muted-foreground disabled:opacity-40" onClick={() => setCount(l, Math.max(0, l.accepted - step(l.billed)))}><Minus className="h-3 w-3" /></button>
                          <button type="button" aria-label={`Done ${l.name}`} className="min-w-6 text-center" onClick={() => setOpen(null)}>{qty(l.accepted)}</button>
                          <button type="button" aria-label={`More ${l.name}`} className="grid h-6 w-6 place-items-center rounded-full border border-border text-muted-foreground" onClick={() => setCount(l, l.accepted + step(l.billed))}><Plus className="h-3 w-3" /></button>
                        </span>
                      : <button type="button" disabled={saved} aria-label={`Change ${l.name} received`} className={linkBtn} onClick={() => setOpen(open === l.key ? null : l.key)}>
                          {diff ? `${qty(l.accepted)}/${qty(l.billed)}` : qty(l.billed)}{l.unit ? ` ${l.unit}` : ""}
                        </button>}
                  </td>
                  <td className={td + " whitespace-nowrap pr-4 text-right tabular-nums"} style={l.was != null ? { color: AMBER } : undefined}>{l.history && p.onHistory
                    ? <button type="button" aria-label={`Price history for ${l.name}`} title="Price history" className={linkBtn + " underline decoration-dotted underline-offset-4"} style={l.was != null ? { color: AMBER } : undefined} onClick={() => p.onHistory?.(l.index)}>{num(l.price)}</button>
                    : num(l.price)}</td>
                </tr>,
                editing && diff && <tr key={`${l.key}-why`}><td /><td colSpan={3} className="pb-3 pr-4">
                  <Tabs value={inTabs ? l.reason : l.reason && l.reason !== "matched" ? "other_list" : undefined} items={[...tabs, ["other_list", "Other"]]}
                    onPick={v => v === "other_list" ? p.onReason(l.index, inTabs || !l.reason || l.reason === "matched" ? "other" : l.reason, l.note) : p.onReason(l.index, v)} />
                  {(!inTabs && l.reason && l.reason !== "matched") && <div className="mt-2 flex gap-2">
                    <select aria-label="Reason" value={l.reason} onChange={e => p.onReason(l.index, e.target.value, l.note)} className="h-8 min-w-0 flex-1 rounded-md border border-border bg-white px-2 text-[12px]">
                      {RECEIVING_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    {l.reason === "other" && <input aria-label="Note" placeholder="Note" defaultValue={l.note} onBlur={e => p.onReason(l.index, "other", e.target.value)} className="h-8 min-w-0 flex-1 rounded-md border border-border bg-white px-2 text-[12px]" />}
                  </div>}
                </td></tr>,
              ];
            })}
          </tbody>
        </table>
        <div className="flex h-11 items-center justify-between gap-3 px-4 text-[12px] text-muted-foreground" style={{ borderTop: `1px solid ${HAIR}` }}>
          <span className="truncate" style={priceUp.length ? { color: AMBER } : undefined}>{priceUp.length ? `${priceUp.length} price${priceUp.length > 1 ? "s" : ""} up` : "Prices checked by Bani"}</span>
          <button type="button" disabled={saved} className={cn(linkBtn, "shrink-0")} onClick={() => setPanelOpen(panelOpen === "delivered" ? null : "delivered")}>
            Delivered {deliveredOn === today ? "today" : deliveredOn === addDays(today, -1) ? "yesterday" : shortDay(deliveredOn)}
          </button>
        </div>
      </div>
      {!saved && blocked.length > 0 && !blocked.every(l => /^Checking/.test(l.blocked || "")) && <p className="text-[13px]" style={{ color: AMBER }}>Can't go into the books yet. An approver sets this in Settings › Purchasing setup, or hold it for review.</p>}
      {!saved && heldBack > 0 && <p className="text-[13px] tabular-nums" style={{ color: AMBER }}>{num(heldBack)} held back for what didn't arrive.</p>}
      {saved
        ? <p className="text-[13px] font-medium text-emerald-700 dark:text-emerald-400">{held ? "✓ Saved as a draft" : "✓ Booked · stock updated"}</p>
        : <div className="flex items-center gap-4">
            <button type="button" className="floating-bani-apply" disabled={!ready} onClick={() => setConfirm("book")}>{p.saving ? "Saving…" : "Book"}</button>
            {!allTicked && <button type="button" className="text-[13px] font-medium text-foreground" onClick={() => setTicked(new Set(p.lines.map(l => l.key)))}>Tick all</button>}
            <button type="button" className="text-[13px] font-medium text-muted-foreground disabled:opacity-40" disabled={!canHold} onClick={() => setConfirm("hold")}>Hold for review</button>
            <button type="button" className="ml-auto text-[13px] text-muted-foreground" onClick={p.onOpenFull}>Full review</button>
          </div>}
    </div>
  );
}
