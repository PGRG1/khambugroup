import { useState } from "react";
import { useFinanceBooks } from "@/hooks/useFinanceBooks";
import { useVenueScope } from "@/hooks/useVenueScope";
import { Toolbar } from "@/components/kit/Toolbar";
import { ageBucket, receivableBuckets } from "@/utils/financeReportViews";
import { formatTableCurrency } from "@/utils/format";
import { shortDay } from "@/utils/salesRecordChecks";
import { downloadCSV } from "@/utils/csvDownload";

const BUCKETS = ["0–30 days", "31–60 days", "61–90 days", "Over 90 days"];
/** Friendly name for a receivable ledger account. */
const nameOf = (name: string, contractName: string) => {
  const venue = name.match(/clearing\s*[–-]\s*(.+)$/i)?.[1];
  return venue ? `Card payouts · ${venue.trim()}` : /other receivables/i.test(name) ? contractName : name;
};

/**
 * Receivables › Ageing: what is owed, by how long since the sale. Same rule as the Reports view
 * (credits clear the oldest amounts first within each account); shown with Bani's table and wording.
 */
export function ReceivablesAgeing({ asAt, contractName, onOpen }: { asAt: string; contractName: string; onOpen?: (accountName: string) => void }) {
  const books = useFinanceBooks(Number(asAt.slice(0, 4))), scope = useVenueScope();
  const [search, setSearch] = useState("");
  const entries = new Map(books.entries.filter(e => e.status === "posted" && e.entry_date <= asAt).map(e => [e.id, e]));
  const accounts = books.accounts.filter(a => a.account_type === "asset" && /receivable|clearing|accrued income/i.test(a.name));
  const rows = accounts.map(a => {
    const ls = books.lines.filter(l => l.account_id === a.id && entries.has(l.entry_id) && scope.includesName(l.venue))
      .sort((x, y) => (entries.get(x.entry_id)?.entry_date ?? "").localeCompare(entries.get(y.entry_id)?.entry_date ?? ""));
    let credits = ls.reduce((n, l) => n + Number(l.credit), 0);
    const values = [0, 0, 0, 0];
    for (const l of ls) {
      const debit = Number(l.debit), used = Math.min(credits, debit);
      credits -= used;
      if (debit - used > 0.005) values[ageBucket(entries.get(l.entry_id)?.entry_date ?? asAt, asAt)] += debit - used;
    }
    return { key: a.id, account: a.name, name: nameOf(a.name, contractName), values, total: values.reduce((n, v) => n + v, 0) };
  }).filter(r => r.total > 0.005 && (!search || r.name.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => b.total - a.total);
  const tot = [0, 1, 2, 3].map(i => rows.reduce((n, r) => n + r.values[i], 0)), all = tot.reduce((n, v) => n + v, 0);
  const amount = (v: number, hot = false) => v > 0.005 ? <span className={hot ? "font-semibold text-[#B45309]" : ""}>{formatTableCurrency(v)}</span> : <span className="text-muted-foreground">—</span>;
  const download = () => downloadCSV(rows.map(r => ({ who: r.name, ...Object.fromEntries(receivableBuckets.map((b, i) => [b, r.values[i]])), total: r.total })),
    [{ key: "who", label: "Who" }, ...receivableBuckets.map(b => ({ key: b, label: b })), { key: "total", label: "Total" }], `receivables-ageing-${asAt}`);
  const open = (r: typeof rows[number]) => onOpen?.(r.account);
  return <>
    <section className="glass-surface rounded-xl border border-border/60 px-5 py-5 max-sm:px-4 max-sm:py-4 min-w-0" aria-label="Owed to you by age" aria-busy={books.loading}>
      <p className="text-[13px] font-medium text-muted-foreground whitespace-nowrap">Owed to you · {shortDay(asAt)}</p>
      <p className="mt-1 text-[32px] sm:text-[42px] leading-none font-semibold td-num tabular-nums whitespace-nowrap">{books.loading ? "…" : formatTableCurrency(all)}</p>
      {/* Phone: one line for the oldest money; computer: the four buckets. */}
      {tot[3] > 0.005 && <p className="sm:hidden mt-2 text-[13px] max-sm:text-[12px] text-[#B45309] whitespace-nowrap">{formatTableCurrency(tot[3])} is over 90 days old</p>}
      <div className="max-sm:hidden mt-4 max-sm:mt-3 grid grid-cols-4 gap-3 border-t border-border/50 pt-3">{BUCKETS.map((b, i) => <div key={b} className="min-w-0"><p className="text-[11px] text-muted-foreground whitespace-nowrap">{b}</p><p className={`text-[16px] font-semibold td-num tabular-nums whitespace-nowrap ${i === 3 && tot[3] > 0.005 ? "text-[#B45309]" : ""}`}>{formatTableCurrency(tot[i])}</p></div>)}</div>
    </section>
    <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="By who" aria-busy={books.loading}>
      <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5"><span>By who</span><span className="text-[13px] text-muted-foreground font-normal">· days since the sale</span></h2>
      <Toolbar search={search} onSearch={setSearch} placeholder="Search" mobileSearchBelow onDownload={download} downloadLabel="Download ageing" />
      <ul className="min-[768px]:hidden kit divide-y divide-border/60" aria-label="Ageing by who">{rows.map(r => <li key={r.key} className={`px-2 py-2.5 ${r.values[3] > 0.005 ? "bg-[#FDF3F2]" : ""} ${onOpen ? "cursor-pointer" : ""}`} onClick={() => open(r)}>
        <span className="flex items-baseline justify-between gap-2 text-[14px]"><span className="truncate">{r.name}</span><span className="td-num shrink-0">{formatTableCurrency(r.total)}</span></span>
        <span className="mt-1.5 grid grid-cols-4 gap-1">{["0–30", "31–60", "61–90", "90+"].map((b, i) => <span key={b} className="min-w-0"><span className="block text-[11px] text-muted-foreground">{b}</span><span className={`block text-[12px] td-num whitespace-nowrap overflow-hidden text-ellipsis ${i === 3 && r.values[3] > 0.005 ? "font-semibold text-[#B45309]" : ""}`}>{r.values[i] > 0.005 ? formatTableCurrency(r.values[i]).replace(/^HK\$/, "") : "—"}</span></span>)}</span>
      </li>)}</ul>
      <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Ageing table"><table className="sales-table" aria-label="Receivables ageing">
        <thead><tr><th scope="col" className="sales-flag-cell"><span className="sr-only">Needs you</span></th><th scope="col" className="sales-cell-left">Who</th>{BUCKETS.map(b => <th key={b} scope="col" className="sales-cell-right">{b}</th>)}<th scope="col" className="sales-cell-right">Total</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.key} className={`${onOpen ? "sales-record-row" : ""} ${r.values[3] > 0.005 ? "sales-attention-row" : ""}`} tabIndex={onOpen ? 0 : undefined} onClick={() => open(r)} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(r); } }}>
          <td className="sales-flag-cell">{r.values[3] > 0.005 && <span className="sales-flag" role="img" aria-label="Over 90 days" title="Over 90 days">!</span>}</td>
          <td className="sales-cell-left" title={r.name}>{r.name}</td>
          {r.values.map((v, i) => <td key={i} className="kit-num">{amount(v, i === 3)}</td>)}
          <td className="kit-num font-semibold">{formatTableCurrency(r.total)}</td>
        </tr>)}
          {rows.length > 0 && <tr><th colSpan={2} className="sales-cell-left font-semibold">Total</th>{tot.map((v, i) => <td key={i} className="kit-num font-semibold">{amount(v, i === 3)}</td>)}<td className="kit-num font-semibold">{formatTableCurrency(all)}</td></tr>}
        </tbody></table></div>
      {!rows.length && !books.loading && <p className="p-8 text-center text-sm text-muted-foreground">Nothing owed to you.</p>}
    </section>
  </>;
}
