import { useState } from "react";
import { Loader2, Minus, Pencil, Plus } from "lucide-react";
import { formatMoney } from "@/utils/money";
import { shortDay } from "@/utils/salesRecordChecks";

export type ChatScanLine = { key: string; index: number; name: string; billed: number; accepted: number; unit: string; total: number };
export type ChatScanPhase = "reading" | "failed" | "denied" | "many" | "duplicate" | "review" | "ready" | "saved";
export type ChatScanAnswers = { dueDate: string | null; paid: boolean; receivedDate: string };

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
  onBook: (answers: ChatScanAnswers) => void;
  onOpenFull: () => void;
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (date: string, days: number) => { const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate() + days); return iso(d); };
const qty = (n: number) => String(Math.round(n * 1000) / 1000);
const step = (n: number) => (Number.isInteger(n) ? 1 : 0.5);

const Chips = ({ options, picked, onPick }: { options: string[]; picked: string | null; onPick: (o: string) => void }) => (
  <div className="floating-bani-replies !mt-0">
    {(picked ? [picked] : options).map(o => <button key={o} type="button" disabled={!!picked} aria-pressed={picked === o} className={`floating-bani-reply ${picked === o ? "!bg-[var(--fb-ink)] !text-[var(--fb-on-primary)] !border-[var(--fb-ink)]" : ""}`} onClick={() => onPick(o)}>{o}</button>)}
  </div>
);

/** Bani chat: confirm what arrived and the invoice details, answer terms and delivery, then book. */
export function ChatScanCard(p: Props) {
  const [checked, setChecked] = useState(false);
  const [terms, setTerms] = useState<{ label: string; due: string | null; paid: boolean } | null>(null);
  const [pickDue, setPickDue] = useState(false);
  const [delivery, setDelivery] = useState<{ label: string; date: string } | null>(null);
  const [pickDelivery, setPickDelivery] = useState(false);
  const [editing, setEditing] = useState<"invoice_number" | "invoice_date" | null>(null);

  if (p.phase === "reading") return <p className="flex items-center gap-2 text-[13px] text-muted-foreground" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" />Reading the invoice…</p>;
  const full = (text: string) => <div className="space-y-2"><p>{text}</p><button type="button" className="floating-bani-reply" onClick={p.onOpenFull}>Open full review</button></div>;
  if (p.phase === "denied") return <p>Booking invoices needs edit access to Purchasing.</p>;
  if (p.phase === "failed") return full("I couldn't read this one.");
  if (p.phase === "many") return full("This file has more than one invoice.");
  if (p.phase === "duplicate") return <p>{p.supplier} {p.number} is already booked.</p>;
  if (p.phase === "review") return full("This one needs the full review.");

  const today = iso(new Date());
  const disputed = p.lines.some(l => l.accepted !== l.billed);
  const termOptions = [
    p.printedDue ? `Due ${shortDay(p.printedDue)}` : p.termsDays != null ? `${p.termsDays} days` : null,
    disputed ? null : "Paid already",
    "Pick a date",
  ].filter((o): o is string => !!o);
  const pickTerm = (o: string) => {
    if (o === "Pick a date") { setPickDue(true); return; }
    if (o === "Paid already") setTerms({ label: o, due: null, paid: true });
    else setTerms({ label: o, due: p.printedDue ?? (p.termsDays != null ? addDays(p.date, p.termsDays) : null), paid: false });
  };
  const pickDay = (o: string) => {
    if (o === "Pick a date") { setPickDelivery(true); return; }
    setDelivery({ label: o, date: o === "Today" ? today : addDays(today, -1) });
  };
  const saved = p.phase === "saved";
  const field = (label: string, key: "invoice_number" | "invoice_date" | null, value: string, shown: string) => (
    <div className="flex min-h-10 items-center justify-between gap-3 border-t border-border/50 first:border-t-0 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      {key && editing === key && !checked
        ? <input autoFocus type={key === "invoice_date" ? "date" : "text"} defaultValue={value} className="h-8 w-40 rounded-md border border-border bg-background px-2 text-right text-[13px]" onBlur={e => { if (e.target.value.trim()) p.onField(key, e.target.value.trim()); setEditing(null); }} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        : <span className="flex items-center gap-1.5 truncate">{shown}{key && !checked && <button type="button" aria-label={`Change ${label.toLowerCase()}`} className="text-muted-foreground/70 hover:text-foreground" onClick={() => setEditing(key)}><Pencil className="h-3 w-3" /></button>}</span>}
    </div>
  );

  return (
    <div className="space-y-3">
      <p>Is this right?</p>
      <div className="rounded-xl border border-border/60 bg-background px-4 py-2">
        {field("Supplier", null, p.supplier, p.supplier)}
        {field("Invoice", "invoice_number", p.number, p.number)}
        {field("Date", "invoice_date", p.date, shortDay(p.date))}
        <div className="mt-1 border-t border-border/60">
          {p.lines.map(l => (
            <div key={l.key} className="flex min-h-12 items-center justify-between gap-3 border-t border-border/50 first:border-t-0 py-1.5 text-[13px]">
              <div className="min-w-0"><p className="truncate">{l.name}</p><p className="text-[12px] text-muted-foreground td-num tabular-nums">{formatMoney(l.total, p.currency)}{l.accepted !== l.billed && ` · billed ${qty(l.billed)}`}</p></div>
              <div className="flex shrink-0 items-center gap-2">
                {!checked && <button type="button" aria-label={`Less ${l.name}`} className="grid h-7 w-7 place-items-center rounded-full border border-border text-muted-foreground disabled:opacity-40" disabled={l.accepted <= 0} onClick={() => p.onQty(l.index, Math.max(0, l.accepted - step(l.billed)))}><Minus className="h-3 w-3" /></button>}
                <span className={`min-w-12 text-center td-num tabular-nums font-medium ${l.accepted !== l.billed ? "text-amber-600" : ""}`}>{qty(l.accepted)}{l.unit ? ` ${l.unit}` : ""}</span>
                {!checked && <button type="button" aria-label={`More ${l.name}`} className="grid h-7 w-7 place-items-center rounded-full border border-border text-muted-foreground" onClick={() => p.onQty(l.index, l.accepted + step(l.billed))}><Plus className="h-3 w-3" /></button>}
              </div>
            </div>
          ))}
        </div>
        <div className="flex min-h-10 items-center justify-between border-t border-border/60 text-[13px] font-semibold"><span>Total</span><span className="td-num tabular-nums">{formatMoney(p.total, p.currency)}</span></div>
      </div>
      <Chips options={["All correct", "Something's wrong"]} picked={checked ? "All correct" : null} onPick={o => o === "All correct" ? setChecked(true) : p.onOpenFull()} />

      {checked && <>
        <p>Pay terms?</p>
        {pickDue && !terms
          ? <input type="date" aria-label="Due date" min={p.date} className="h-9 rounded-md border border-border bg-background px-2 text-[13px]" onChange={e => e.target.value && setTerms({ label: `Due ${shortDay(e.target.value)}`, due: e.target.value, paid: false })} />
          : <Chips options={termOptions} picked={terms?.label ?? null} onPick={pickTerm} />}
      </>}

      {terms && <>
        <p>Delivery date?</p>
        {pickDelivery && !delivery
          ? <input type="date" aria-label="Delivery date" max={today} className="h-9 rounded-md border border-border bg-background px-2 text-[13px]" onChange={e => e.target.value && setDelivery({ label: shortDay(e.target.value), date: e.target.value })} />
          : <Chips options={["Today", "Yesterday", "Pick a date"]} picked={delivery?.label ?? null} onPick={pickDay} />}
      </>}

      {delivery && terms && (saved
        ? <p className="text-[13px] font-medium text-emerald-700 dark:text-emerald-400">✓ Booked · stock updated</p>
        : <div className="flex items-center gap-3">
            <button type="button" className="floating-bani-apply" disabled={p.saving} onClick={() => p.onBook({ dueDate: terms.due, paid: terms.paid, receivedDate: delivery.date })}>{p.saving ? "Booking…" : "Book it"}</button>
            <button type="button" className="text-[13px] text-muted-foreground underline underline-offset-4" onClick={p.onOpenFull}>Open full review</button>
          </div>)}
    </div>
  );
}
