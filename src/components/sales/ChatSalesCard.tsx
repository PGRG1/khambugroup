import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";
import type { SalesRecord } from "@/types/sales";
import { formatMoney } from "@/utils/money";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { shortDay } from "@/utils/salesRecordChecks";
import { getPaymentTotal } from "@/utils/salesUtils";
import { diagnoseSalesScan } from "@/utils/salesScanLearning";

export type ChatSalesPhase = "reading" | "failed" | "denied" | "review" | "ready" | "flagged";

/** Editable figures, in the order a sales report reads. */
export type SalesFigure = "guests" | "subtotal" | "serviceCharge" | "discount" | "visa" | "mastercard" | "amex" | "unionPay" | "jcb" | "alipay" | "wechat" | "payme" | "cash" | "deliveroo" | "foodpanda" | "keeta" | "cardTips";

const SALES: [SalesFigure, string][] = [["subtotal", "Subtotal"], ["serviceCharge", "Service charge"], ["discount", "Discount"]];
const PAID: [SalesFigure, string][] = [
  ["visa", "Visa"], ["mastercard", "Mastercard"], ["amex", "Amex"], ["unionPay", "UnionPay"], ["jcb", "JCB"],
  ["alipay", "Alipay"], ["wechat", "WeChat Pay"], ["payme", "PayMe"], ["cash", "Cash"],
  ["deliveroo", "Deliveroo"], ["foodpanda", "Foodpanda"], ["keeta", "Keeta"], ["cardTips", "Card tips"],
];
const LABEL = new Map<SalesFigure, string>([["guests", "Guests"], ...SALES, ...PAID]);
export const salesFigureLabel = (f: SalesFigure) => LABEL.get(f) ?? f;

const num = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const same = (a: number, b: number) => Math.abs(a - b) <= 0.01;
const AMBER = "#B45309";

/** Same rules as Scan Receipt: deductions are stored negative and Total sales follows its parts. */
export function applySalesFigure(r: SalesRecord, field: SalesFigure, raw: string): SalesRecord {
  let v = Number(raw.replace(/,/g, "")) || 0;
  if (!Number.isFinite(v)) v = 0;
  if (field === "guests") return { ...r, guests: Math.max(0, Math.round(v)) };
  if (field === "discount" || field === "cardTips") v = -Math.abs(v);
  const next = { ...r, [field]: v } as SalesRecord;
  if (field === "subtotal" || field === "serviceCharge" || field === "discount") next.totalSales = next.subtotal + next.serviceCharge - Math.abs(next.discount || 0);
  return next;
}

/** Short, plain status under the card; empty when everything adds up. */
export function salesCheck(r: SalesRecord): { ok: boolean; note: string; fields: SalesFigure[] } {
  const d = diagnoseSalesScan(r);
  if (d.balanced) return { ok: true, note: "", fields: [] };
  const fields = (d.fields as string[]).filter((f): f is SalesFigure => LABEL.has(f as SalesFigure));
  const sales = r.subtotal + r.serviceCharge - Math.abs(r.discount);
  if (!same(sales, r.totalSales)) return { ok: false, note: `Sales lines come to ${num(sales)}, not ${num(r.totalSales)}.`, fields };
  const gap = r.totalSales - getPaymentTotal(r);
  const first = fields[0] ? ` Check ${salesFigureLabel(fields[0]).toLowerCase()}.` : "";
  return { ok: false, note: `Paid is ${num(Math.abs(gap))} ${gap > 0 ? "short of" : "over"} sales.${first}`, fields };
}

type Props = {
  phase: ChatSalesPhase;
  record: SalesRecord | null;
  /** Active venues, offered only when the receipt's venue did not match one. */
  venues: string[];
  saving: boolean;
  /** Short reason when the receipt was kept for review instead of recorded. */
  reason?: string;
  /** Nothing left to review (e.g. the day already has sales). */
  settled?: boolean;
  /** Figures the person changed, with what was read: listed in the confirm. */
  changes?: { field: SalesFigure; from: number; to: number }[];
  onVenue: (venue: string) => void;
  onDate?: (date: string) => void;
  onFigure?: (field: SalesFigure, value: string) => void;
  onRecord: () => void;
  onOpenFull: () => void;
};

const chip = "floating-bani-reply";

/** Bani chat: the receipt as a short statement to check, fix and record through the normal receipt checks. */
export function ChatSalesCard(p: Props) {
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState<SalesFigure | "date" | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!confirming) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !p.saving) setConfirming(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [confirming, p.saving]);
  useLayoutEffect(() => { setPanel(anchor.current?.closest<HTMLElement>(".floating-bani-panel") ?? null); });
  const full = (text: string, label = "Open full review") => <div className="space-y-2"><p>{text}</p><button type="button" className={chip} onClick={p.onOpenFull}>{label}</button></div>;

  if (p.phase === "reading") return <p className="flex items-center gap-2 text-[13px] text-muted-foreground" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" />Reading the receipt…</p>;
  if (p.phase === "denied") return <p>Recording sales needs access to Scan Receipt.</p>;
  if (p.phase === "failed") return full("I couldn't read this one.");
  if (p.phase === "review") return full("This one needs the full review.");
  if (p.phase === "flagged") return p.settled ? <p>{p.reason}.</p> : full(`Not recorded. ${p.reason ?? "Kept for your review"}.`, "Open review");
  const r = p.record;
  if (!r) return null;

  if (!r.venue) return (
    <div className="space-y-3">
      <p>Which venue?</p>
      <div className="floating-bani-replies !mt-0">{p.venues.map(v => <button key={v} type="button" className={chip} onClick={() => p.onVenue(v)}>{v}</button>)}</div>
    </div>
  );

  const check = salesCheck(r);
  const unsure = (f: string) => (r.fieldConfidence?.[f] ?? 1) < 0.8;
  const warn = (f: SalesFigure) => check.fields.includes(f) || unsure(f);
  const shown = (f: SalesFigure) => Math.abs(r[f] as number) > 0.004 || warn(f) || editing === f;
  const dateUnsure = unsure("date") || !r.date;
  const paid = getPaymentTotal(r);
  const salesOff = !same(r.subtotal + r.serviceCharge - Math.abs(r.discount), r.totalSales);
  const ready = check.ok && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !p.saving && !editing;

  const value = (f: SalesFigure) => {
    const v = r[f] as number;
    if (editing === f) return (
      <input autoFocus inputMode="decimal" aria-label={salesFigureLabel(f)} defaultValue={f === "guests" ? String(v) : String(Math.abs(v))}
        className="h-7 w-28 rounded-md border border-border bg-white px-2 text-right text-[13px] tabular-nums outline-none focus:border-foreground/60"
        onBlur={e => { p.onFigure?.(f, e.target.value); setEditing(null); }}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(null); }} />
    );
    const text = f === "guests" ? String(v) : (f === "discount" || f === "cardTips") && v ? `−${num(Math.abs(v))}` : num(v);
    return (
      <button type="button" aria-label={`Change ${salesFigureLabel(f)}`} onClick={() => setEditing(f)}
        className={cn("tabular-nums", warn(f) && "border-b")} style={warn(f) ? { color: AMBER, borderColor: AMBER } : undefined}>{text}</button>
    );
  };
  const row = (f: SalesFigure) => (
    <tr key={f}><td className="py-[7px] pr-4 text-muted-foreground">{salesFigureLabel(f)}</td><td className="whitespace-nowrap py-[7px] text-right">{value(f)}</td></tr>
  );
  const total = (label: string, v: number, bad: boolean) => (
    <tr className="font-semibold">
      <td className="border-t border-border py-[7px] pr-4">{label}</td>
      <td className="whitespace-nowrap border-t border-border py-[7px] text-right tabular-nums" style={bad ? { color: AMBER } : undefined}>{num(v)}</td>
    </tr>
  );
  const gap = (h: string) => <tr aria-hidden><td colSpan={2} className={h} /></tr>;

  const confirm = (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 p-4" role="presentation" onClick={() => !p.saving && setConfirming(false)}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="chat-sales-confirm" aria-describedby="chat-sales-confirm-d" className="grid w-full max-w-[500px] gap-3 rounded-[18px] border bg-white p-5 shadow-lg" onClick={e => e.stopPropagation()}>
        <div className="space-y-1">
          <p id="chat-sales-confirm" className="text-[15px] font-semibold text-foreground">Record sales?</p>
          <p id="chat-sales-confirm-d" className="text-sm text-muted-foreground tabular-nums">{r.venue} · {shortDay(r.date)} · {formatMoney(r.totalSales)}</p>
          {(p.changes ?? []).map(c => <p key={c.field} className="text-sm text-muted-foreground tabular-nums">{salesFigureLabel(c.field)} changed {c.field === "guests" ? c.from : num(Math.abs(c.from))} → {c.field === "guests" ? c.to : num(Math.abs(c.to))}</p>)}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={cn(buttonVariants({ variant: "outline" }), "h-9 border-0 bg-muted hover:bg-muted/80")} disabled={p.saving} onClick={() => setConfirming(false)}>Cancel</button>
          <button type="button" className={cn(buttonVariants(), "h-9 bg-[var(--fb-ink,#17302C)] text-white hover:bg-[var(--fb-ink,#17302C)]/90")} disabled={p.saving} onClick={p.onRecord}>{p.saving ? "Recording…" : "Record"}</button>
        </div>
      </div>
    </div>
  );

  return (
    <div ref={anchor} className="space-y-3">
      {confirming && (panel ? createPortal(confirm, panel) : confirm)}
      <p>Is this right?</p>
      <div className="rounded-xl border border-border bg-white px-4 pb-2 pt-4">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr><th colSpan={2} className="border-b border-border p-0 pb-3 text-left font-semibold leading-5">
              {r.venue} · {editing === "date"
                ? <input autoFocus type="date" aria-label="Date" defaultValue={r.date} className="h-7 rounded-md border border-border bg-white px-1.5 text-[13px] font-normal"
                    onBlur={e => { if (e.target.value) p.onDate?.(e.target.value); setEditing(null); }} />
                : <button type="button" aria-label="Change date" onClick={() => setEditing("date")} className={dateUnsure ? "border-b" : ""} style={dateUnsure ? { color: AMBER, borderColor: AMBER } : undefined}>{r.date ? shortDay(r.date) : "Add date"}</button>}
            </th></tr>
          </thead>
          <tbody>
            {gap("h-1.5")}
            {row("guests")}
            {gap("h-3")}
            {SALES.filter(([f]) => shown(f)).map(([f]) => row(f))}
            {total("Total sales", r.totalSales, salesOff)}
            {gap("h-3")}
            {PAID.filter(([f]) => shown(f)).map(([f]) => row(f))}
            {total("Total paid", paid, !same(paid, r.totalSales))}
          </tbody>
        </table>
      </div>
      {check.note ? <p className="text-[13px]" style={{ color: AMBER }}>{check.note}</p>
        : dateUnsure && <p className="text-[13px]" style={{ color: AMBER }}>Check the date.</p>}
      <div className="flex items-center gap-4">
        <button type="button" className="floating-bani-apply" disabled={!ready} onClick={() => setConfirming(true)}>Record</button>
        <button type="button" className="text-[13px] font-medium text-muted-foreground" onClick={p.onOpenFull}>Full review</button>
      </div>
    </div>
  );
}
