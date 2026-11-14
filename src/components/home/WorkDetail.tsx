import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { WorkLink } from "@/utils/workLogLinks";

/** The record a "What we did" row is about. Read-only. */
export type WorkRecord = { type: "invoice" | "bill" | "sales" | "bank" | "journal"; id: string };
export type WorkFinding = { key: string; title: string; statement: string; action: boolean };

type Line = { label: string; value: string; sub?: string };
type Detail = { said: string; facts: Line[]; lines?: Line[]; linesTitle?: string; note?: string };

const hk = (n: unknown) => `HK$${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-HK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const day = (d?: string | null) => (d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "—");
const words = (s?: string | null) => (s ? String(s).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "—");
const PAY: [string, string][] = [["cash", "Cash"], ["visa", "Visa"], ["mastercard", "Mastercard"], ["amex", "Amex"], ["union_pay", "UnionPay"], ["jcb", "JCB"], ["alipay", "Alipay"], ["wechat", "WeChat Pay"], ["payme", "PayMe"], ["foodpanda", "foodpanda"], ["deliveroo", "Deliveroo"], ["keeta", "Keeta"]];

async function load(rec: WorkRecord, tenantId: string): Promise<Detail | null> {
  const db = supabase as any;
  if (rec.type === "invoice") {
    const [{ data: i }, { data: lines }] = await Promise.all([
      db.from("invoices").select("invoice_number,invoice_date,due_date,total_amount,review_status,payment_status,venue,supplier_id,file_name").eq("tenant_id", tenantId).eq("id", rec.id).maybeSingle(),
      db.from("invoice_line_items").select("description,quantity,unit,total").eq("tenant_id", tenantId).eq("invoice_id", rec.id).order("source_line_no", { ascending: true }).limit(40),
    ]);
    if (!i) return null;
    const { data: sup } = i.supplier_id ? await db.from("suppliers").select("name").eq("tenant_id", tenantId).eq("id", i.supplier_id).maybeSingle() : { data: null };
    const n = (lines ?? []).length;
    return {
      said: `Read ${sup?.name ?? "the supplier"}'s invoice${i.invoice_number ? ` ${i.invoice_number}` : ""} and recorded ${hk(i.total_amount)} across ${n} ${n === 1 ? "line" : "lines"}.`,
      facts: [
        { label: "Invoice date", value: day(i.invoice_date) }, { label: "Due", value: day(i.due_date) },
        { label: "Venue", value: i.venue || "—" }, { label: "Status", value: words(i.review_status) },
        { label: "Payment", value: words(i.payment_status) }, ...(i.file_name ? [{ label: "Original", value: i.file_name }] : []),
      ],
      linesTitle: "Lines read", lines: (lines ?? []).map((l: any) => ({ label: l.description || "Item", sub: l.quantity != null ? `${Number(l.quantity)}${l.unit ? ` ${l.unit}` : ""}` : undefined, value: hk(l.total) })),
    };
  }
  if (rec.type === "bill") {
    const { data: b } = await db.from("expense_bills").select("vendor_name,bill_number,bill_date,due_date,total_amount,approval_status,payment_status,venue,service_period_start,service_period_end,notes").eq("tenant_id", tenantId).eq("id", rec.id).maybeSingle();
    if (!b) return null;
    const booked = b.approval_status === "approved" || b.approval_status === "posted";
    return {
      said: `${booked ? "Booked" : "Prepared"} a bill from ${b.vendor_name || "the supplier"} for ${hk(b.total_amount)}${booked ? "" : ". It is waiting for approval"}.`,
      facts: [
        { label: "Bill date", value: day(b.bill_date) }, { label: "Due", value: day(b.due_date) },
        ...(b.service_period_start ? [{ label: "Covers", value: `${day(b.service_period_start)} – ${day(b.service_period_end)}` }] : []),
        { label: "Venue", value: b.venue || "—" }, { label: "Status", value: words(b.approval_status) }, { label: "Payment", value: words(b.payment_status) },
        ...(b.bill_number ? [{ label: "Bill number", value: b.bill_number }] : []),
      ],
      note: b.notes || undefined,
    };
  }
  if (rec.type === "sales") {
    const { data: s } = await db.from("sales_records").select("*").eq("tenant_id", tenantId).eq("id", rec.id).maybeSingle();
    if (!s) return null;
    const total = (Number(s.subtotal) || 0) + (Number(s.service_charge) || 0);
    return {
      said: `Booked ${s.venue || "the venue"}'s sales for ${day(s.date)}: ${hk(total)}${Number(s.guests) ? ` from ${Number(s.guests).toLocaleString("en-HK")} guests` : ""}.`,
      facts: [
        { label: "Sales before service", value: hk(s.subtotal) }, { label: "Service charge", value: hk(s.service_charge) },
        ...(Number(s.guests) ? [{ label: "Guests", value: Number(s.guests).toLocaleString("en-HK") }] : []),
        ...(Number(s.orders) ? [{ label: "Orders", value: Number(s.orders).toLocaleString("en-HK") }] : []),
        ...(s.report_number ? [{ label: "Report", value: String(s.report_number) }] : []),
        ...(s.receipt_file_name ? [{ label: "Original", value: s.receipt_file_name }] : []),
      ],
      linesTitle: "How it was paid", lines: PAY.filter(([k]) => Number(s[k])).map(([k, label]) => ({ label, value: hk(s[k]) })),
    };
  }
  if (rec.type === "bank") {
    const { data: t } = await db.from("bank_transactions").select("txn_date,description,counterparty,reference,money_in,money_out,status,match_confidence,matched_record_type").eq("tenant_id", tenantId).eq("id", rec.id).maybeSingle();
    if (!t) return null;
    const amt = Number(t.money_in) || Number(t.money_out);
    return {
      said: `Matched a bank line of ${hk(amt)} ${Number(t.money_in) ? "in" : "out"}${t.matched_record_type ? ` to a ${words(t.matched_record_type).toLowerCase()}` : ""}${t.match_confidence ? ` (${String(t.match_confidence).toLowerCase()} confidence)` : ""}.`,
      facts: [
        { label: "Date", value: day(t.txn_date) }, { label: "Bank line", value: t.description || "—" },
        ...(t.counterparty ? [{ label: "Paid by / to", value: t.counterparty }] : []), ...(t.reference ? [{ label: "Reference", value: t.reference }] : []),
        { label: "Status", value: words(t.status) },
      ],
    };
  }
  const [{ data: e }, { data: lines }] = await Promise.all([
    db.from("journal_entries").select("entry_date,memo,source_type,status").eq("tenant_id", tenantId).eq("id", rec.id).maybeSingle(),
    db.from("journal_lines").select("account_id,debit,credit,memo").eq("tenant_id", tenantId).eq("entry_id", rec.id).order("line_no", { ascending: true }).limit(40),
  ]);
  if (!e) return null;
  const ids = [...new Set((lines ?? []).map((l: any) => l.account_id).filter(Boolean))];
  const { data: accts } = ids.length ? await db.from("chart_of_accounts").select("id,code,name").eq("tenant_id", tenantId).in("id", ids) : { data: [] };
  const name = new Map<string, string>((accts ?? []).map((a: any) => [a.id, `${a.code ? `${a.code} ` : ""}${a.name}`]));
  const what = e.source_type === "payroll_accrual" ? "payroll" : e.source_type === "depreciation" ? "depreciation" : words(e.source_type).toLowerCase();
  return {
    said: `Booked ${what} for ${new Date(`${String(e.entry_date).slice(0, 7)}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}, so the month's costs are in the books before it closes.`,
    facts: [{ label: "Entry date", value: day(e.entry_date) }, { label: "Status", value: words(e.status) }, ...(e.memo ? [{ label: "Memo", value: e.memo }] : [])],
    linesTitle: "Entry", lines: (lines ?? []).map((l: any) => ({ label: name.get(l.account_id) ?? "Account", sub: l.memo || undefined, value: Number(l.debit) ? `Dr ${hk(l.debit)}` : `Cr ${hk(l.credit)}` })),
  };
}

/** The detail panel that slides over the list: what Bani did, the facts it used, and what to do next. */
export function WorkDetail({ tenantId, title, when, kind, rec, findings, link, canOpenLink, onBack, onAsk, onOpen }: {
  tenantId: string | null; title: string; when: string; kind: string; rec?: WorkRecord; findings?: WorkFinding[];
  link: WorkLink | null; canOpenLink: boolean; onBack: () => void; onAsk: (text: string) => void; onOpen: () => void;
}) {
  const q = useQuery({
    queryKey: ["home", "work-detail", tenantId, rec?.type, rec?.id],
    enabled: !!tenantId && !!rec,
    staleTime: 60_000,
    queryFn: () => load(rec!, tenantId!),
  });
  const d = q.data;
  return (
    <div className="wl-detail" role="region" aria-label={title}>
      <div className="wl-dhead">
        <button type="button" className="wl-back" onClick={onBack}><ChevronLeft size={16} />Back</button>
        <span className="wl-kind">{kind}</span>
      </div>
      <div className="wl-dbody">
        <h3 className="wl-dtitle">{title}</h3>
        <p className="wl-dwhen">{when}</p>
        {findings ? <>
          <p className="wl-dsaid">{findings.length ? `Your team checked the books and found ${findings.length} ${findings.length === 1 ? "thing" : "things"} to look at.` : "Your team checked the books and found nothing to look at."}</p>
          <ul className="wl-findings">{findings.map((f) => <li key={f.key}>
            <i className={f.action ? "amb" : ""} />
            <span><b>{f.title}</b>{f.statement && <em>{f.statement}</em>}</span>
            <button type="button" onClick={() => onAsk(`${f.title}: ${f.statement}`)}>Ask Bani</button>
          </li>)}</ul>
        </> : q.isPending ? <div className="wl-dload" role="status" aria-busy="true">{[70, 45, 55, 40].map((w, i) => <span key={i} className="l2-sk" style={{ width: `${w}%` }}>&nbsp;</span>)}</div>
          : !d ? <p className="wl-dsaid">This record is no longer available. It may have been removed or you may not have access to it.</p>
          : <>
            <p className="wl-dsaid">{d.said}</p>
            <dl className="wl-facts">{d.facts.filter((f) => f.value && f.value !== "—").map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>
            {d.note && <p className="wl-dnote">{d.note}</p>}
            {!!d.lines?.length && <><h4 className="wl-dsub">{d.linesTitle}</h4>
              <ul className="wl-dlines">{d.lines.map((l, i) => <li key={i}><span>{l.label}{l.sub && <em>{l.sub}</em>}</span><b>{l.value}</b></li>)}</ul></>}
          </>}
      </div>
      <div className="wl-dfoot">
        {!findings && <button type="button" className="wl-ask" onClick={() => onAsk(`Tell me about this: ${title}${d ? `. ${d.said}` : ""}`)}>Ask Bani about this</button>}
        {link && canOpenLink && <Link to={link.to} className="wl-open" onClick={onOpen}>{link.label} →</Link>}
      </div>
    </div>
  );
}
