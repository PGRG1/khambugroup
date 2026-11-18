import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { usePagePeriod } from "@/hooks/usePagePeriod";
import { PageTop } from "@/components/kit/PageTop";
import { Toolbar } from "@/components/kit/Toolbar";
import { QuickFilter } from "@/components/kit/QuickFilter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchAllRows } from "@/utils/fetchAllRows";
import { downloadCSV } from "@/utils/csvDownload";
import { formatTableCurrency, formatTableInteger } from "@/utils/format";
import { shortDay } from "@/utils/salesRecordChecks";
import { Section, Status, Flag, PhoneRow, Note, Empty, Pager, keyOpen, type Tone } from "@/components/finance/accounting/AccountingKit";

interface AuditRow {
  id: string; event_type: string; user_display_name: string | null; payroll_id: string | null; journal_entry_id: string | null;
  venue: string | null; employee_name: string | null; period: string | null; amount: number | null; status: string; notes: string | null; created_at: string;
}

const EVENT_LABELS: Record<string, string> = {
  ledger_rebuild_start: "Ledger rebuild started",
  ledger_rebuild_finish: "Ledger rebuild finished",
  payroll_accrual: "Payroll accrual",
  payroll_net_payment: "Salary payment",
  payroll_mpf_payment: "MPF remittance",
  payroll_skipped: "Payroll skipped",
  invoice_payment_posted: "Invoice payment posted",
  payroll_batch_posted: "Payroll batch posted",
  credit_note_applied: "Credit note applied",
  bank_fee_posted: "Bank fee posted",
  journal_entry_edited: "Journal entry edited",
};
const STATUS: Record<string, { text: string; tone: Tone }> = { success: { text: "Done", tone: "ok" }, in_progress: { text: "Still running", tone: "amber" }, skipped: { text: "Skipped", tone: "mut" }, error: { text: "Failed", tone: "amber" } };
const time = (iso: string) => { try { return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Hong_Kong" }); } catch { return ""; } };
const PAGE = 50;

// Audit: read-only record of every change to the books, who made it and when, newest first.
export default function LedgerAuditLog() {
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const navigate = useNavigate();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventFilter, setEventFilter] = useState("all");
  const [show, setShow] = useState<"all" | "problems">("all");
  const [search, setSearch] = useState(""), [page, setPage] = useState(1);
  const period = usePagePeriod(rows.map(r => r.created_at.slice(0, 10)), "mtd");

  useEffect(() => {
    if (tenantLoading) return;
    if (!tenantId) { setRows([]); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await fetchAllRows("ledger_audit_log", "*", { col: "created_at", asc: false }, tenantId);
      if (!cancelled) { setRows(data as AuditRow[]); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [tenantId, tenantLoading]);

  const what = (r: AuditRow) => EVENT_LABELS[r.event_type] ?? r.event_type.replace(/_/g, " ");
  const st = (r: AuditRow) => STATUS[r.status] ?? { text: r.status, tone: "mut" as Tone };
  const who = (r: AuditRow) => r.user_display_name ?? "Automatic";
  const inPeriod = rows.filter(r => period.inPeriod(r.created_at));
  const problems = inPeriod.filter(r => r.status === "error" || r.status === "in_progress");
  const list = inPeriod.filter(r => (eventFilter === "all" || r.event_type === eventFilter) && (show === "all" || r.status === "error" || r.status === "in_progress") && (!search || `${what(r)} ${r.notes ?? ""} ${who(r)} ${r.employee_name ?? ""}`.toLowerCase().includes(search.toLowerCase())));
  const pages = Math.max(1, Math.ceil(list.length / PAGE)), current = Math.min(page, pages), visible = list.slice((current - 1) * PAGE, current * PAGE);
  const openEntry = (r: AuditRow) => r.journal_entry_id && navigate(`/finance/books?view=journal&entry=${r.journal_entry_id}`);
  const download = () => downloadCSV(list.map(r => ({ when: r.created_at, who: who(r), what: what(r), notes: r.notes ?? "", amount: r.amount ?? "", status: st(r).text })), [{ key: "when", label: "When" }, { key: "who", label: "Who" }, { key: "what", label: "What changed" }, { key: "notes", label: "Details" }, { key: "amount", label: "Amount" }, { key: "status", label: "Status" }], "audit");
  const eventSelect = <Select value={eventFilter} onValueChange={v => { setEventFilter(v); setPage(1); }}><SelectTrigger className="h-9 w-48 rounded-full" aria-label="Kind of change"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Every kind of change</SelectItem>{Object.entries(EVENT_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select>;

  return <div className="min-w-0 space-y-5 max-sm:space-y-3">
    <PageTop tabsAbove title="Audit" period={period.control} />
    <Section title="Changes" detail={`${period.label} · ${formatTableInteger(inPeriod.length)}`} busy={loading}>
      <QuickFilter label="Changes" value={show} onChange={k => { setShow(k); setPage(1); }} options={[{ key: "all", label: "All" }, { key: "problems", label: "Failed or running", count: problems.length }]} />
      <Toolbar search={search} onSearch={v => { setSearch(v); setPage(1); }} placeholder="Search changes" mobileSearchBelow filter={eventSelect} onDownload={download} downloadLabel="Download audit" />
      <ul className="min-[768px]:hidden kit divide-y divide-border/60">{visible.map(r => { const s = st(r); return <PhoneRow key={r.id} flag={s.tone === "amber" && s.text} title={what(r)} amount={r.amount != null ? formatTableCurrency(Number(r.amount)) : undefined} sub={`${shortDay(r.created_at.slice(0, 10))} ${time(r.created_at)} · ${who(r)}${r.notes ? ` · ${r.notes}` : ""}`} tone={s.tone === "amber" ? "amber" : "mut"} onOpen={r.journal_entry_id ? () => openEntry(r) : undefined} />; })}</ul>
      <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Changes table"><table className="sales-table" aria-label="Audit">
        <thead><tr><th scope="col" className="sales-flag-cell"><span className="sr-only">Needs a look</span></th><th scope="col" className="sales-cell-left">When</th><th scope="col" className="sales-cell-left">Who</th><th scope="col" className="sales-cell-left">What changed</th><th scope="col" className="sales-cell-right">Amount</th><th scope="col" className="sales-cell-left">Status</th><th scope="col" className="sales-cell-right"><span className="sr-only">Entry</span></th></tr></thead>
        <tbody>{visible.map(r => { const s = st(r); const detail = [what(r), r.employee_name, r.notes].filter(Boolean).join(" · "); return <tr key={r.id} className={`sales-record-row ${s.tone === "amber" ? "sales-attention-row" : ""}`} {...(r.journal_entry_id ? keyOpen(() => openEntry(r)) : {})}>
          <td className="sales-flag-cell">{s.tone === "amber" && <Flag text={s.text} />}</td>
          <td className="sales-cell-left">{shortDay(r.created_at.slice(0, 10))} · {time(r.created_at)}</td>
          <td className="sales-cell-left" title={who(r)}>{who(r)}</td>
          <td className="sales-cell-left" title={detail}>{detail}</td>
          <td className="kit-num">{r.amount != null ? formatTableCurrency(Number(r.amount)) : <span className="text-muted-foreground">—</span>}</td>
          <td className="sales-cell-left"><Status text={s.text} tone={s.tone} /></td>
          <td className="kit-num">{r.journal_entry_id && <Link className="kit-link" to={`/finance/books?view=journal&entry=${r.journal_entry_id}`} onClick={e => e.stopPropagation()}>Entry</Link>}</td>
        </tr>; })}</tbody></table></div>
      {!visible.length && <Empty>{loading ? "Loading changes…" : "No changes recorded in this period."}</Empty>}
      <Pager page={current} pages={pages} onPage={setPage} />
      <Note>Read only. Every change to the books, who made it and when. Automatic means no person made the change: posting rules, rebuilds or Bani.</Note>
    </Section>
  </div>;
}
