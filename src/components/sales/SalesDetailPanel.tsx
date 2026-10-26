import { Link } from "react-router-dom";
import type { SalesRecord } from "@/types/sales";
import type { SalesNote } from "@/hooks/useSalesNotes";
import { DetailGroup, DetailPanel, DetailRow, ExplainBox, StatusPill } from "@/components/kit";
import { checkRecord, shortDay } from "@/utils/salesRecordChecks";
import { getPaymentTotal } from "@/utils/salesUtils";
import { NoteComposer } from "./NoteComposer";

const money = (v: number) => `${v < 0 ? "-" : ""}HK$ ${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (v: number) => `HK$ ${Math.abs(Math.round(v)).toLocaleString("en-US")}`;
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const when = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")} ${MON[d.getMonth()]} ${d.getFullYear()}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`; };

const PAY: [keyof SalesRecord, string][] = [
  ["visa", "Visa"], ["mastercard", "Mastercard"], ["amex", "AMEX"], ["unionPay", "UnionPay"], ["jcb", "JCB"],
  ["alipay", "Alipay"], ["wechat", "WeChat Pay"], ["payme", "PayMe"], ["cash", "Cash"],
  ["deliveroo", "Deliveroo"], ["foodpanda", "Foodpanda"], ["keeta", "Keeta"], ["cardTips", "Card tips"],
];

export function SalesDetailPanel({ record, onClose, notes, onAddNote, canFix, onFix, onViewReceipt, servicePeriodName }: {
  record: SalesRecord | null; onClose: () => void;
  notes: SalesNote[]; onAddNote: (body: string, tag: string | null) => Promise<boolean>;
  canFix: boolean; onFix: () => void; onViewReceipt: () => void; servicePeriodName?: string;
}) {
  const r = record;
  const c = r ? checkRecord(r) : null;
  return (
    <DetailPanel open={!!r} onOpenChange={(o) => { if (!o) onClose(); }}
      kind="Sales record"
      title={r ? `${r.venue}${servicePeriodName ? ` · ${servicePeriodName}` : ""} · ${shortDay(r.date)}` : ""}
      headline={r ? money0(r.totalSales) : undefined}
      status={c ? (c.ok ? <StatusPill tone="ok">Adds up</StatusPill> : <StatusPill tone="problem">Doesn't add up</StatusPill>) : undefined}>
      {r && c && (
        <>
          <DetailGroup title="Sales">
            <DetailRow label="Food & drink" value={money(r.subtotal)} />
            <DetailRow label="Service charge" value={money(r.serviceCharge)} />
            <DetailRow label="Discounts" value={money(r.discount)} />
            <DetailRow label="Total sales" value={money(r.totalSales)} total />
          </DetailGroup>
          <DetailGroup title="Paid by">
            {PAY.filter(([k]) => Number(r[k] ?? 0) !== 0).map(([k, label]) => <DetailRow key={k} label={label} value={money(Number(r[k]))} />)}
            <DetailRow label="Payments total" value={money(getPaymentTotal(r))} total />
          </DetailGroup>
          {!c.ok && (
            <ExplainBox>
              {c.paymentsWrong && <p>Payments are {money0(c.paymentGap)} {c.paymentGap < 0 ? "short of" : "more than"} the day's sales.</p>}
              {c.partsWrong && <p>Food & drink, service charge and discounts add up to {money0(c.partsTotal)}, not the {money0(r.totalSales)} total.</p>}
            </ExplainBox>
          )}
          <div className="flex flex-wrap gap-2">
            {canFix && <button type="button" className="kit-btn kit-btn-primary" onClick={onFix}>Fix this day</button>}
            {r.receiptFileUrl && <button type="button" className="kit-btn kit-btn-secondary" onClick={onViewReceipt}>View receipt</button>}
          </div>

          <DetailGroup title="Notes">
            {notes.length === 0 && <p className="text-[13px] text-muted-foreground">No notes yet.</p>}
            <ol className="space-y-2.5">
              {notes.map((n) => (
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
            <div className="pt-2"><NoteComposer onSend={onAddNote} /></div>
          </DetailGroup>

          <DetailGroup title="Details">
            <DetailRow label="Guests" value={Math.round(r.guests).toLocaleString("en-US")} />
            <DetailRow label="Orders" value={Math.round(r.orders).toLocaleString("en-US")} />
            <DetailRow label="Report number" value={r.reportNumber || "None"} />
            <DetailRow label="Service period" value={servicePeriodName ?? "None"} />
            {r.id && <Link to={`/sales-data/${r.id}`} className="kit-link inline-block pt-2">Open full record</Link>}
          </DetailGroup>
        </>
      )}
    </DetailPanel>
  );
}
