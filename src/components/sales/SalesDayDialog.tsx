import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { SalesRecord } from "@/types/sales";
import type { SalesNote } from "@/hooks/useSalesNotes";
import { shortDay } from "@/utils/salesRecordChecks";
import { getPaymentTotal } from "@/utils/salesUtils";
import { CLOSURE_REASONS, weekdayName, weekdayOf } from "@/utils/venueClosures";
import { NoteComposer } from "./NoteComposer";
import type { DayItem } from "./DailyRecords";
import "@/components/kit/kit.css";

const money = (v: number) => `${v < 0 ? "-" : ""}HK$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (v: number) => `HK$${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const when = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")} ${MON[d.getMonth()]} ${d.getFullYear()}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`; };
const longDate = (iso: string) => `${shortDay(iso)} ${iso.slice(0, 4)}`;

const PAY: [keyof SalesRecord, string][] = [
  ["visa", "Visa"], ["mastercard", "Mastercard"], ["amex", "AMEX"], ["unionPay", "UnionPay"], ["jcb", "JCB"],
  ["alipay", "Alipay"], ["wechat", "WeChat Pay"], ["payme", "PayMe"], ["cash", "Cash"],
  ["deliveroo", "Deliveroo"], ["foodpanda", "Foodpanda"], ["keeta", "Keeta"], ["cardTips", "Card tips"],
];

function Line({ label, value, total }: { label: string; value: string; total?: boolean }) {
  return <div className={`flex justify-between gap-3 py-1 text-[13px] whitespace-nowrap ${total ? "kit-divider pt-2 mt-1 font-semibold" : ""}`}>
    <span className="truncate" style={total ? undefined : { color: "#3D4842" }}>{label}</span><span className="kit-num">{value}</span>
  </div>;
}

export interface SalesDayDialogProps {
  item: DayItem | null;
  onClose: () => void;
  servicePeriodName?: string;
  notes: SalesNote[];
  onAddNote: (body: string, tag: string | null) => Promise<boolean>;
  canFix: boolean; onFix: () => void; onViewReceipt: () => void;
  canManageClosures: boolean;
  onAddSales?: (date: string, venue: string) => void;
  onMarkClosed: (venueId: string, date: string, reason: string | null, note: string | null, everyWeekday: boolean) => Promise<boolean>;
  onUnmark: (venueId: string, date: string) => Promise<boolean>;
  closerName?: (userId: string) => string | undefined;
}

export function SalesDayDialog(p: SalesDayDialogProps) {
  const x = p.item;
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [weekly, setWeekly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [marking, setMarking] = useState(false);
  useEffect(() => { setReason(null); setNote(""); setWeekly(false); setMarking(false); }, [x]);

  const run = async (fn: () => Promise<boolean>) => { setBusy(true); const ok = await fn(); setBusy(false); if (ok) p.onClose(); };

  const venue = x ? (x.kind === "record" ? x.r.venue : x.venue) : "";
  const date = x ? (x.kind === "record" ? x.r.date : x.date) : "";
  const title = x?.kind === "record" ? "Sales record" : x?.kind === "missing" ? "Missing day" : "Closed day";
  return (
    <Dialog open={!!x} onOpenChange={(o) => { if (!o) p.onClose(); }}>
      <DialogContent className="kit sales-day-dialog max-w-[560px] p-0 gap-0 max-sm:h-[100dvh] max-sm:w-full max-sm:max-w-none max-sm:left-0 max-sm:top-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 overflow-y-auto">
        {x && <div className="p-5 sm:p-6 space-y-5" style={{ color: "var(--kit-ink)" }}>
          <div className="space-y-1 pr-8">
            <div className="kit-group-h">{title}</div>
            <DialogTitle className="text-[15px] font-semibold whitespace-nowrap truncate">
              {longDate(date)} · {venue}{x.kind === "record" && p.servicePeriodName ? ` · ${p.servicePeriodName}` : ""}
            </DialogTitle>
            <DialogDescription className="sr-only">{title} for {venue}</DialogDescription>
          </div>

          {x.kind === "record" && (() => {
            const r = x.r;
            return <>
              <div>
                <div className="kit-headline">{money0(r.totalSales)}</div>
                {x.reason && <p className="text-[13px] mt-1" style={{ color: "#C53030" }}>{x.reason}</p>}
              </div>
              {x.closed && p.canManageClosures && (
                <div className="flex items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-[13px]" style={{ background: "#F7F7F4", color: "#55605A" }}>
                  <span>This day was marked closed. Remove the closed mark?</span>
                  {x.closed.closure
                    ? <button type="button" className="kit-btn kit-btn-secondary h-8 shrink-0" disabled={busy} onClick={() => run(() => p.onUnmark(x.closed!.venueId, date))}>Remove</button>
                    : <span className="shrink-0">Change it in Settings</span>}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <section><h3 className="kit-group-h pb-1">Sales</h3>
                  <Line label="Food & drink" value={money(r.subtotal)} />
                  <Line label="Service charge" value={money(r.serviceCharge)} />
                  <Line label="Discounts" value={money(r.discount)} />
                  <Line label="Total" value={money(r.totalSales)} total />
                </section>
                <section><h3 className="kit-group-h pb-1">Paid by</h3>
                  {PAY.filter(([k]) => Number(r[k] ?? 0) !== 0).map(([k, label]) => <Line key={k} label={label} value={money(Number(r[k]))} />)}
                  <Line label="Payments total" value={money(getPaymentTotal(r))} total />
                </section>
              </div>
              <section className="space-y-2"><h3 className="kit-group-h">Notes</h3>
                {x.notes.length === 0 && <p className="text-[13px] text-muted-foreground">No notes yet.</p>}
                <ol className="space-y-2.5">
                  {x.notes.map((n) => (
                    <li key={n.id} className="text-[13px] space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5 text-[12px]" style={{ color: "var(--kit-muted)" }}>
                        <span className="font-medium" style={{ color: "var(--kit-ink)" }}>{n.author_name || "Team member"}</span>
                        <span>{when(n.created_at)}</span>
                        {n.tag && <span className="kit-chip !min-h-[20px] !px-2 !text-[11px]">{n.tag}</span>}
                      </div>
                      <p className="whitespace-pre-wrap" style={{ color: "#3D4842" }}>{n.body}</p>
                    </li>
                  ))}
                </ol>
                <NoteComposer onSend={p.onAddNote} />
              </section>
              <div className="kit-divider pt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-[12px] whitespace-nowrap" style={{ color: "var(--kit-muted)" }}>
                  {Math.round(r.guests)} guests · {Math.round(r.orders)} orders · Report {r.reportNumber || "—"} · {r.receiptFileUrl ? "Receipt attached" : "No receipt"}
                </div>
                <div className="flex gap-2">
                  {r.receiptFileUrl && <button type="button" className="kit-btn kit-btn-secondary" onClick={p.onViewReceipt}>View receipt</button>}
                  {p.canFix && <button type="button" className="kit-btn kit-btn-primary" onClick={p.onFix}>Fix this day</button>}
                </div>
              </div>
              {r.id && <Link to={`/sales-data/${r.id}`} className="kit-link text-[12px]">Open full record</Link>}
            </>;
          })()}

          {x.kind === "missing" && <>
            <p className="text-[14px]">No sales recorded for {venue} on {longDate(date)}.</p>
            {!marking ? (
              <div className="flex flex-wrap gap-2">
                {p.onAddSales && <button type="button" className="kit-btn kit-btn-primary" onClick={() => { p.onAddSales!(date, venue); p.onClose(); }}>Add sales</button>}
                {p.canManageClosures && <button type="button" className="kit-btn kit-btn-secondary" onClick={() => setMarking(true)}>Mark closed</button>}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="kit-group-h">Why was it closed?</div>
                <div className="flex flex-wrap gap-1.5">
                  {CLOSURE_REASONS.map((r) => <button key={r} type="button" className="kit-chip kit-chip-choice" aria-pressed={reason === r} onClick={() => setReason(reason === r ? null : r)}>{r}</button>)}
                </div>
                <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Add a detail (optional)" aria-label="Closure detail" className="kit-search !w-full !h-9 px-3 text-sm" />
                <label className="flex items-center justify-between gap-3 text-[13px]">
                  <span>Closed every {weekdayName(weekdayOf(date))}</span>
                  <Switch checked={weekly} onCheckedChange={setWeekly} />
                </label>
                <div className="flex gap-2">
                  <button type="button" className="kit-btn kit-btn-primary" disabled={busy} onClick={() => run(() => p.onMarkClosed(x.venueId, date, reason, note.trim() || null, weekly))}>Mark closed</button>
                  <button type="button" className="kit-btn kit-btn-secondary" onClick={() => setMarking(false)}>Back</button>
                </div>
              </div>
            )}
          </>}

          {x.kind === "closed" && <>
            <div className="space-y-1 text-[14px]">
              <p>{venue} was closed{x.info.reason ? `: ${x.info.reason}` : "."}</p>
              {x.info.note && <p className="text-[13px]" style={{ color: "#55605A" }}>{x.info.note}</p>}
              <p className="text-[12px]" style={{ color: "var(--kit-muted)" }}>
                {x.info.closure
                  ? `Marked by ${p.closerName?.(x.info.closure.created_by) ?? "a team member"}${x.info.closure.source === "your_team" ? " from Your team" : ""} on ${when(x.info.closure.created_at)}`
                  : `Regular closure${x.info.rule?.weekday != null ? `: every ${weekdayName(x.info.rule.weekday)}` : ""} (change it in Settings → Business & venues)`}
              </p>
            </div>
            {x.info.closure && p.canManageClosures && (
              <button type="button" className="kit-btn kit-btn-secondary" disabled={busy} onClick={() => run(() => p.onUnmark(x.venueId, date))}>Remove closed mark</button>
            )}
          </>}
        </div>}
      </DialogContent>
    </Dialog>
  );
}
