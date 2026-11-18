import { Fragment, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { FinanceViewTabs } from '@/components/finance/FinanceViewTabs';
import { BankReconciliationReport } from '@/components/finance/cash/BankReconciliationReport';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useCentralSharing } from '@/hooks/useCentralSharing';
import { centralShares } from '@/utils/centralSharing';
import { useFinanceBooks } from '@/hooks/useFinanceBooks';
import { useFinanceOverviewData } from '@/hooks/useFinanceOverviewData';
import { useFinancePeriod } from '@/components/kit/PeriodControl';
import { useVenueScope } from '@/hooks/useVenueScope';
import { PageTop } from '@/components/kit/PageTop';
import { QuickFilter } from '@/components/kit/QuickFilter';
import { DownloadMenu, type DownloadFormat } from '@/components/kit/DownloadMenu';
import { restaurantPL, type PLRow, type PLPeriod } from '@/utils/restaurantPL';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeftRight } from 'lucide-react';
import { balanceSheetRows, indirectCashRows, type ReportRow } from '@/utils/financeReportViews';
import { reportMonths } from '@/utils/financeClose';
import { formatCurrency, formatMonthLabel, formatPercent, formatTableCurrency, formatTableInteger } from '@/utils/format';
import { downloadCSV } from '@/utils/csvDownload';
import { tenantToday, shortDay } from '@/utils/salesRecordChecks';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ManagementReports from './ManagementReports';
import { Hero, Section, Flag, PhoneRow, GroupHead, Note, Empty, keyOpen, type Stat } from '@/components/finance/accounting/AccountingKit';

// Reports only read the posted books: Profit & loss, Balance sheet, Cash flow, By venue, and Bank reconciliation
// (the one read-only view across bank accounts). Every line opens what is behind it; fixes happen where the work lives.
// Aged payables and receivables live in Payables › Ageing and Receivables › Ageing; old links redirect there.
const views = [['pl', 'Profit & loss'], ['bs', 'Balance sheet'], ['cash', 'Cash flow'], ['venue', 'By venue'], ['bankrec', 'Bank reconciliation']];
const FRIENDLY: Record<string, string> = { Assets: 'What you own', Liabilities: 'What you owe', Equity: "Owner's equity", 'Total assets': 'Total you own', 'Total liabilities': 'Total you owe', Operating: 'From running the business', Investing: 'From buying equipment', Financing: 'From owners and loans' };
const BOLD = /^(Total|Change in cash|Closing cash)/;
const shiftIso = (iso: string, months: number, years = 0) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() - years); d.setUTCMonth(d.getUTCMonth() - months); return d.toISOString().slice(0, 10); };
const signed = (n: number) => `${n < 0 ? '−' : ''}${formatTableCurrency(Math.abs(n))}`;

export default function Reports() {
  const today = tenantToday(), books = useFinanceBooks(Number(today.slice(0, 4))), facts = useFinanceOverviewData(), scope = useVenueScope(), sharing = useCentralSharing(), navigate = useNavigate();
  const [params] = useSearchParams(), view = params.get('view') ?? 'pl';
  const period = useFinancePeriod('period', 'last-month', { extraShortcuts: true, dataMonths: books.entries.map(e => e.entry_date.slice(0, 7)) }), asAtPeriod = useFinancePeriod('asat'), asAt = asAtPeriod.toIso ?? today;
  const [compare, setCompare] = useState<'off' | 'previous' | 'year'>('off'), [management, setManagement] = useState(false), [detailed, setDetailed] = useState<'detail' | 'summary'>('detail');
  if (view === 'ap') return <Navigate to="/finance/payables?view=age" replace />;
  if (view === 'ar') return <Navigate to="/finance/receivables?view=age" replace />;

  const needsFacts = ['pl', 'venue'].includes(view);
  const loading = books.loading || !scope.ready || (needsFacts && facts.isPending) || (view === 'venue' && sharing.isPending);
  const failed = Boolean(books.error || (needsFacts && facts.isError) || (view === 'venue' && sharing.isError));
  const from = period.fromIso ?? books.entries.map(e => e.entry_date).sort()[0] ?? `${today.slice(0, 4)}-01-01`, to = period.toIso ?? today;
  const months = reportMonths(books.entries.map(e => e.entry_date), from, to);
  const lines = books.lines.filter(l => scope.includesName(l.venue));
  const payroll = facts.data?.payroll ?? [];
  const back = (iso: string) => compare === 'year' ? shiftIso(iso, 0, 1) : shiftIso(iso, Math.max(months.length, 1));
  const compareLabel = compare === 'year' ? 'Same period last year' : 'Previous period';
  const closedMonth = (m: string) => books.closed.some((c: any) => c.month_start === `${m}-01` && !c.reopened_at);

  const top = (actions: ReactNode, asat = false) => <PageTop tabsAbove title="Reports" period={asat ? asAtPeriod.control : period.control} actions={actions} />;
  const compareMenu = <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="h-10"><ArrowLeftRight className="h-4 w-4" />{compare === 'off' ? 'Compare' : compare === 'year' ? 'vs last year' : 'vs previous'}</Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setCompare('off')}>No comparison</DropdownMenuItem><DropdownMenuItem onSelect={() => setCompare('previous')}>vs previous period</DropdownMenuItem><DropdownMenuItem onSelect={() => setCompare('year')}>vs same period last year</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
  const tabs = <FinanceViewTabs items={views.map(([key, label]) => ({ key, label }))} value={view} />;
  const error = failed && <p role="alert" className="kit-explain">{books.error || 'Report sources could not be loaded.'} <Button variant="outline" size="sm" onClick={() => { void books.refetch(); void facts.refetch(); void sharing.refetch(); }}>Retry</Button></p>;
  const shell = (children: ReactNode) => <div className="min-w-0 w-full space-y-5 max-sm:space-y-3 pb-24">{tabs}{children}</div>;
  const exportFile = (title: string, columns: string[], rows: { label: string; values: (number | null)[]; percent?: boolean; section?: boolean }[], f: DownloadFormat) => {
    const cell = (r: typeof rows[number], i: number) => r.values[i] == null ? '' : r.percent ? formatPercent(r.values[i]!) : formatCurrency(r.values[i]!);
    if (f === 'pdf') { const doc = new jsPDF({ orientation: columns.length > 3 ? 'landscape' : 'portrait' }); doc.text(title, 14, 18); autoTable(doc, { startY: 25, head: [['Line', ...columns]], body: rows.map(r => [r.label, ...columns.map((_, i) => r.section ? '' : cell(r, i))]) }); doc.save(`${title.toLowerCase().replace(/[^a-z]+/g, '-')}.pdf`); return; }
    downloadCSV(rows.filter(r => !r.section).flatMap(r => columns.map((c, i) => ({ line: r.label, column: c, amount: r.values[i] ?? '' }))), [{ key: 'line', label: 'Line' }, { key: 'column', label: 'Period' }, { key: 'amount', label: 'Amount' }], title.toLowerCase().replace(/[^a-z]+/g, '-'));
  };

  // ---------- Bank reconciliation ----------
  if (view === 'bankrec') return shell(<>{top(null, true)}<BankReconciliationReport asAt={asAt} /></>);

  // ---------- Profit & loss ----------
  if (view === 'pl') {
    const end = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const periods: PLPeriod[] = months.map(m => ({ label: formatMonthLabel(m), from: `${m}-01` < from ? from : `${m}-01`, to: end(m) > to ? to : end(m) }));
    if (periods.length > 1) periods.push({ label: 'Total', from, to });
    if (compare !== 'off') periods.push({ label: compareLabel, from: back(from), to: back(to) });
    const rows: PLRow[] = loading || failed ? [] : restaurantPL(books.entries, lines, books.accounts, payroll, periods);
    const columns = periods.map(p => p.label), cur = Math.max(0, periods.findIndex(p => p.label === 'Total'));
    const prev = loading || failed ? [] : restaurantPL(books.entries, lines, books.accounts, payroll, [{ label: 'prev', from: shiftIso(from, Math.max(months.length, 1)), to: shiftIso(to, Math.max(months.length, 1)) }]);
    const v = (rs: PLRow[], id: string, i: number) => rs.find(r => r.id === id)?.values[i] ?? 0;
    const sales = v(rows, 'net-sales', cur), profit = v(rows, 'profit', cur), prime = v(rows, 'prime-ratio', cur), prevSales = v(prev, 'net-sales', 0), prevProfit = v(prev, 'profit', 0);
    const prevName = months.length === 1 ? formatMonthLabel(shiftIso(`${months[0]}-01`, 1).slice(0, 7)) : 'the period before';
    const moves = rows.filter(r => r.kind === 'account' && r.accountId).map(r => ({ r, d: (r.values[cur] ?? 0) - (prev.find(p => p.id === r.id)?.values[0] ?? 0) })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const why = !rows.length || (!prevSales && !prevProfit) ? null : `Profit is ${profit >= prevProfit ? 'up' : 'down'} ${formatTableCurrency(Math.abs(profit - prevProfit))} on ${prevName}.${moves[0] && Math.abs(moves[0].d) > 0.5 ? ` Biggest move: ${moves[0].r.label} ${moves[0].d >= 0 ? 'up' : 'down'} ${formatTableCurrency(Math.abs(moves[0].d))}.` : ''}`;
    const closed = months.length > 0 && months.every(closedMonth);
    const salesOf = (i: number) => v(rows, 'net-sales', i);
    const shown = rows.filter(r => detailed === 'detail' || r.kind !== 'account');
    // On screen: one line per heading with its amount, accounts under it when asked; no duplicate or ratio lines.
    const COSTS = ['food', 'staff', 'running', 'fx-r', 'fx-u'];
    let under = '';
    const screen = rows.map(r => { if (r.kind === 'section') under = r.id; return { r, cost: COSTS.includes(r.kind === 'section' ? r.id : under) && (r.kind === 'section' || r.kind === 'account') }; })
      .filter(({ r }) => !['net-sales', 'prime', 'prime-ratio', 'margin'].includes(r.id) && !r.percent)
      .filter(({ r }) => !(r.id.startsWith('fx-') && r.values.every(n => Math.abs(n ?? 0) < .005)))
      .filter(({ r }) => detailed === 'detail' || r.kind !== 'account');
    const money = (n: number | null | undefined, cost: boolean) => n == null || Math.abs(n) < .005 ? '—' : `${(cost ? -n : n) < 0 ? '−' : ''}${formatTableInteger(Math.round(Math.abs(n)))}`;
    const share = (r: PLRow, i: number) => r.id === 'sales' || !salesOf(i) || r.values[i] == null || Math.abs(r.values[i] ?? 0) < .005 ? '' : `${Math.round(Math.abs(r.values[i] ?? 0) / salesOf(i) * 100)}%`;
    const strong = (r: PLRow) => r.kind === 'total' || r.kind === 'grand' || (detailed === 'detail' && r.kind === 'section');
    const pctOf = (r: PLRow, i: number) => r.percent ? null : salesOf(i) ? formatPercent((r.values[i] ?? 0) / salesOf(i) * 100) : '—';
    const amount = (r: PLRow, i: number) => r.values[i] == null ? '—' : r.percent ? formatPercent(r.values[i]!) : signed(r.values[i] ?? 0);
    const ledger = (r: PLRow) => r.accountId ? () => navigate(`/finance/books?view=ledger&account=${encodeURIComponent(r.accountId!)}`) : undefined;
    const stats: Stat[] = [
      { label: 'Profit before tax', value: signed(profit), sub: sales ? `${formatPercent(profit / sales * 100)} margin` : '', tone: profit >= 0 ? 'green' : 'amber' },
      { label: 'Revenue', value: formatTableCurrency(sales), sub: prevSales ? `${sales >= prevSales ? '+' : '−'}${formatPercent(Math.abs((sales - prevSales) / prevSales * 100))} on ${prevName}` : 'posted sales' },
      { label: 'Prime cost', value: formatPercent(prime), sub: 'food, drinks and staff · aim under 60%', tone: prime > 60 ? 'amber' : undefined },    ];
    const plExport = shown.map(r => ({ label: r.label, values: r.values, percent: r.percent, section: r.kind === 'section' }));
    return shell(<>{top(<>{compareMenu}<DownloadMenu formats={['csv', 'pdf']} onDownload={f => exportFile('Profit and loss', columns, plExport, f)} label="Download profit and loss" disabled={loading || failed} /></>)}{error}
      <Hero aria="Profit summary" busy={loading} label={period.label} check={closed ? `${months.length === 1 ? formatMonthLabel(months[0]) : 'Every month'} is closed` : 'Not closed yet'} checkTone={closed ? 'ok' : 'mut'} stats={stats} />
      {why && !loading && <p className="px-1 text-[13px] text-muted-foreground"><span className="font-medium text-[color:var(--kit-ink)]">Bani:</span> {why}</p>}
      <Section title="Profit & loss" detail={compare === 'off' ? undefined : `vs ${compare === 'year' ? 'last year' : 'previous period'}`} busy={loading}>
        <div className="flex items-center justify-between gap-2"><QuickFilter label="Detail" value={detailed} onChange={setDetailed} options={[{ key: 'summary', label: 'Summary' }, { key: 'detail', label: 'Accounts' }]} /><button type="button" className="kit-link px-1 text-[12px] text-muted-foreground" onClick={() => setManagement(true)}>Adjustments</button></div>
        <div className="min-[768px]:hidden kit"><ul>{screen.map(({ r, cost }) => <li key={r.id} className={`flex items-baseline justify-between gap-3 min-h-11 py-2 border-t border-border/60 first:border-t-0 ${r.kind === 'account' ? 'pl-4 text-[13px] text-[#4A5853]' : 'text-[14px]'} ${strong(r) ? 'font-semibold' : ''} ${r.accountId ? 'cursor-pointer' : ''}`} {...(r.accountId ? keyOpen(ledger(r)!) : {})}>
          <span className="min-w-0 truncate">{r.label}</span>
          <span className="shrink-0 td-num"><span className={r.kind === 'grand' ? 'text-[#1F6B5E]' : ''}>{money(r.values[cur], cost)}</span><span className="inline-block w-10 text-right text-[12px] font-normal text-muted-foreground">{share(r, cur)}</span></span>
        </li>)}</ul></div>
        <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Profit and loss table"><table className="sales-table !table-fixed !w-full" aria-label="Profit and loss">
          <colgroup><col />{columns.map(c => <Fragment key={c}><col className="w-[130px]" /><col className="w-[56px]" /></Fragment>)}</colgroup>
          <thead><tr><th scope="col" className="sales-cell-left"><span className="sr-only">Line</span></th>{columns.map(c => <Fragment key={c}><th scope="col" className="sales-cell-right !text-right">{c}</th><th scope="col"><span className="sr-only">% of revenue</span></th></Fragment>)}</tr></thead>
          <tbody>{screen.map(({ r, cost }) => <tr key={r.id} className={`${r.accountId ? 'sales-record-row' : ''} ${r.kind === 'grand' ? 'border-t border-border' : ''}`} {...(r.accountId ? keyOpen(ledger(r)!) : {})}>
              <td className={`sales-cell-left ${r.kind === 'account' ? 'pl-8 text-[#4A5853]' : ''} ${strong(r) ? 'font-semibold' : ''}`} title={r.label}>{r.label}</td>
              {columns.map((c, i) => <Fragment key={c}><td className={`kit-num !text-right ${strong(r) ? 'font-semibold' : ''} ${r.kind === 'grand' && i === cur ? 'text-[#1F6B5E]' : ''}`}>{money(r.values[i], cost)}</td><td className="kit-num !text-right text-muted-foreground !pl-1">{share(r, i)}</td></Fragment>)}
            </tr>)}</tbody></table></div>
        {!loading && !failed && !rows.length && <Empty>No posted entries in this period.</Empty>}
      </Section>
      <Dialog open={management} onOpenChange={setManagement}><DialogContent className="max-w-[95vw] max-h-[90vh] overflow-auto"><DialogHeader><DialogTitle>Management adjustments</DialogTitle></DialogHeader><ManagementReports /></DialogContent></Dialog>
    </>);
  }

  // ---------- By venue ----------
  if (view === 'venue') {
    const venues = [...scope.venues.map(x => x.name), 'Central', 'Needs venue'];
    const posted = new Map(books.entries.filter(e => e.status === 'posted' && e.entry_date >= from && e.entry_date <= to).map(e => [e.id, e]));
    const account = new Map(books.accounts.map(a => [a.id, a]));
    const sums = venues.map(name => {
      let s = 0, food = 0, staff = 0, running = 0;
      for (const l of books.lines) {
        const a = l.account_id ? account.get(l.account_id) : undefined;
        if (!a || !posted.has(l.entry_id) || (l.venue ?? 'Needs venue') !== name) continue;
        const n = Number(l.debit) - Number(l.credit);
        if (['revenue', 'other_income'].includes(a.account_type)) s -= n;
        else if (a.code.startsWith('5')) food += n;
        else if (['opex', 'other_expense'].includes(a.account_type)) { if (/salary|salaries|mpf|wages|payroll/i.test(a.name)) staff += n; else running += n; }
      }
      return [s, food, staff, running, s - food - staff - running];
    });
    const ci = venues.indexOf('Central'), operating = scope.venues.map(x => ({ name: x.name, sales: sums[venues.indexOf(x.name)][0] }));
    const allocated = [1, 2, 3].map(i => centralShares(sums[ci][i], operating, sharing.data?.rule ?? 'sales'));
    const share = operating.map((_, i) => allocated.reduce((n, a) => n + a.shares[i], 0));
    for (let i = 0; i < operating.length; i++) { for (let k = 1; k <= 3; k++) sums[i][k] += allocated[k - 1].shares[i]; sums[i][4] = sums[i][0] - sums[i][1] - sums[i][2] - sums[i][3]; }
    for (let k = 1; k <= 3; k++) sums[ci][k] = allocated[k - 1].unallocated;
    sums[ci][4] = sums[ci][0] - sums[ci][1] - sums[ci][2] - sums[ci][3];
    const list = venues.map((name, i) => ({ name, i, s: sums[i], share: share[i] ?? 0 })).filter(x => scope.selectedNames.includes(x.name) || (!scope.restricted && ['Central', 'Needs venue'].includes(x.name)))
      .filter(x => x.name !== 'Needs venue' || Math.abs(x.s[1]) + Math.abs(x.s[2]) + Math.abs(x.s[3]) + Math.abs(x.s[0]) > 0.005);
    const total = [0, 1, 2, 3, 4].map(k => list.reduce((n, x) => n + x.s[k], 0)), real = list.filter(x => !['Central', 'Needs venue'].includes(x.name) && x.s[0] > 0);
    const best = [...real].sort((a, b) => b.s[4] / b.s[0] - a.s[4] / a.s[0])[0], needs = list.find(x => x.name === 'Needs venue');
    const pct = (n: number, d: number) => d ? formatPercent(n / d * 100) : '—';
    const isOp = (x: typeof list[number]) => !['Central', 'Needs venue'].includes(x.name);
    const cols = ['Sales', 'Food & drink', 'Staff', 'Running costs', 'Profit before tax'];
    const venueExport = list.map(x => ({ label: x.name, values: x.s })).concat([{ label: 'Total', values: total }]);
    return shell(<>{top(<DownloadMenu formats={['csv', 'pdf']} onDownload={f => exportFile('Profit by venue', cols, venueExport, f)} label="Download by venue" disabled={loading || failed} />)}{error}
      <Hero aria="By venue summary" busy={loading} label={`${period.label} · posted books`} check={`Central costs shared by ${sharing.data?.rule === 'equal' ? 'equal shares' : 'sales'}${sharing.data?.configured ? '' : ' (default)'}`} checkTone="mut"
        stats={[{ label: 'Best margin', value: best?.name ?? '—', sub: best ? `${pct(best.s[4], best.s[0])} · ${formatTableCurrency(best.s[4])}` : 'no sales yet', tone: best ? 'green' : undefined }, { label: 'Total profit', value: signed(total[4]), sub: `${pct(total[4], total[0])} of sales` }, { label: 'Needs venue', value: formatTableCurrency(Math.abs((needs?.s[1] ?? 0) + (needs?.s[2] ?? 0) + (needs?.s[3] ?? 0))), sub: 'costs with no venue', tone: needs ? 'amber' : undefined }]} />
      <Section title="By venue" detail={`${real.length} ${real.length === 1 ? 'venue' : 'venues'}`} busy={loading}>
        <ul className="min-[768px]:hidden kit divide-y divide-border/60">{list.map(x => <PhoneRow key={x.name} flag={x.name === 'Needs venue' && 'Costs with no venue'} title={x.name} amount={signed(x.s[4])} sub={isOp(x) ? `Sales ${formatTableCurrency(x.s[0])} · margin ${pct(x.s[4], x.s[0])}` : x.name === 'Central' ? 'Costs not shared out' : 'Costs with no venue · give them one'} tone={x.name === 'Needs venue' ? 'amber' : 'mut'} />)}</ul>
        <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="By venue table"><table className="sales-table" aria-label="Profit by venue">
          <thead><tr><th scope="col" className="sales-flag-cell"><span className="sr-only">Needs you</span></th><th scope="col" className="sales-cell-left">Venue</th><th scope="col" className="sales-cell-right">Sales</th><th scope="col" className="sales-cell-right">Food cost %</th><th scope="col" className="sales-cell-right">Staff %</th><th scope="col" className="sales-cell-right">Running costs</th><th scope="col" className="sales-cell-right">Central share</th><th scope="col" className="sales-cell-right">Profit</th><th scope="col" className="sales-cell-right">Margin</th></tr></thead>
          <tbody>{list.map(x => <tr key={x.name} className={`sales-record-row ${x.name === 'Needs venue' ? 'sales-attention-row' : ''}`}>
            <td className="sales-flag-cell">{x.name === 'Needs venue' && <Flag text="Costs with no venue" />}</td>
            <td className="sales-cell-left">{x.name === 'Central' ? 'Central (not shared out)' : x.name}</td>
            <td className="kit-num">{isOp(x) ? formatTableCurrency(x.s[0]) : <span className="text-muted-foreground">—</span>}</td>
            <td className="kit-num text-muted-foreground">{isOp(x) ? pct(x.s[1], x.s[0]) : '—'}</td>
            <td className="kit-num text-muted-foreground">{isOp(x) ? pct(x.s[2], x.s[0]) : '—'}</td>
            <td className="kit-num">{formatTableCurrency(x.s[3])}</td>
            <td className="kit-num text-muted-foreground">{isOp(x) ? formatTableCurrency(x.share) : '—'}</td>
            <td className="kit-num">{signed(x.s[4])}</td>
            <td className={`kit-num ${x.name === 'Needs venue' ? 'text-[#B45309]' : 'text-muted-foreground'}`}>{isOp(x) ? pct(x.s[4], x.s[0]) : x.name === 'Needs venue' ? 'Give a venue' : '—'}</td>
          </tr>)}
            {!!list.length && <tr className="sales-week-row"><th colSpan={2}><span>Total</span></th><td className="kit-num font-semibold">{formatTableCurrency(total[0])}</td><td className="kit-num font-semibold">{pct(total[1], total[0])}</td><td className="kit-num font-semibold">{pct(total[2], total[0])}</td><td className="kit-num font-semibold">{formatTableCurrency(total[3])}</td><td /><td className="kit-num font-semibold">{signed(total[4])}</td><td className="kit-num font-semibold">{pct(total[4], total[0])}</td></tr>}
          </tbody></table></div>
        {!loading && !failed && !list.length && <Empty>No posted entries in this period.</Empty>}
        <Note>Food cost and staff are shares of each venue's sales, after central costs are shared out. Needs venue lists costs posted without a venue; give them one in the journal.</Note>
      </Section>
    </>);
  }

  // ---------- Balance sheet and Cash flow ----------
  const bs = view === 'bs';
  const base: ReportRow[] = loading || failed ? [] : bs ? balanceSheetRows(books.entries, lines, books.accounts, asAt) : indirectCashRows(books.entries, lines, books.accounts, from, to);
  const previous: ReportRow[] = compare === 'off' || loading || failed ? [] : bs ? balanceSheetRows(books.entries, lines, books.accounts, back(asAt)) : indirectCashRows(books.entries, lines, books.accounts, back(from), back(to));
  const rows = base.map(r => ({ ...r, values: compare === 'off' ? r.values : [...r.values, r.section ? null : previous.find(p => p.label === r.label)?.values[0] ?? null] }));
  const columns = [bs ? `As at ${shortDay(asAt)}` : period.label, ...(compare === 'off' ? [] : [bs ? `As at ${shortDay(back(asAt))}` : compareLabel])];
  const val = (label: string) => base.find(r => r.label === label)?.values[0] ?? 0;
  const assets = val('Total assets'), owe = val('Total liabilities'), equity = val('Total equity'), gap = assets - owe - equity;
  const stats: Stat[] = bs
    ? [{ label: 'You own', value: formatTableCurrency(assets), sub: 'cash, money owed to you, equipment' }, { label: 'You owe', value: formatTableCurrency(owe), sub: 'suppliers, staff, deposits' }, { label: "Owner's equity", value: signed(equity), sub: 'capital and profit kept' }]
    : [{ label: 'Cash at start', value: formatTableCurrency(val('Opening cash')), sub: `before ${shortDay(from)}` }, { label: 'Change', value: signed(val('Change in cash')), sub: `profit was ${signed(val('Profit before tax'))}`, tone: val('Change in cash') < 0 ? 'amber' : undefined }, { label: 'Cash at end', value: formatTableCurrency(val('Closing cash')), sub: shortDay(to) }];
  const name = (label: string) => FRIENDLY[label] ?? label;
  const title = bs ? 'Balance sheet' : 'Cash flow';
  return shell(<>{top(<>{compareMenu}<DownloadMenu formats={['csv', 'pdf']} onDownload={f => exportFile(title, columns, rows.map(r => ({ ...r, label: name(r.label) })), f)} label={`Download ${title.toLowerCase()}`} disabled={loading || failed} /></>, bs)}{error}
    <Hero aria={`${title} summary`} busy={loading} label={bs ? shortDay(asAt) : period.label} check={bs ? (Math.abs(gap) < 0.005 ? 'Balances' : `Off by ${formatTableCurrency(Math.abs(gap))}`) : undefined} checkTone={bs && Math.abs(gap) >= 0.005 ? 'amber' : bs ? 'ok' : 'mut'} stats={stats} />
    <Section title={title} detail={compare === 'off' ? undefined : `vs ${compare === 'year' ? 'last year' : 'previous period'}`} busy={loading}>
      {(() => {
        const whole = (n: number | null | undefined) => n == null || Math.abs(n) < .005 ? '—' : `${n < 0 ? '−' : ''}${formatTableInteger(Math.round(Math.abs(n)))}`;
        const bold = (r: { label: string }) => BOLD.test(r.label);
        return <>
          <div className="min-[768px]:hidden kit"><ul>{rows.map((r, i) => r.section
            ? <li key={i} className="pt-4 pb-1 text-[12px] font-medium text-muted-foreground">{name(r.label)}</li>
            : <li key={i} className={`flex items-baseline justify-between gap-3 min-h-11 py-2 border-t border-border/60 ${bold(r) ? 'font-semibold text-[14px]' : 'pl-4 text-[13px] text-[#4A5853]'}`}><span className="min-w-0 truncate">{name(r.label)}</span><span className="shrink-0 td-num">{whole(r.values[0])}</span></li>)}</ul></div>
          <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label={`${title} table`}><table className="sales-table !table-fixed !w-full" aria-label={title}>
            <colgroup><col />{columns.map(c => <col key={c} className="w-[140px]" />)}</colgroup>
            <thead><tr><th scope="col" className="sales-cell-left"><span className="sr-only">Line</span></th>{columns.map(c => <th key={c} scope="col" className="sales-cell-right !text-right">{c}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => r.section
              ? <tr key={i}><td colSpan={columns.length + 1} className="sales-cell-left pt-5 text-[12px] font-medium text-muted-foreground">{name(r.label)}</td></tr>
              : <tr key={i}><td className={`sales-cell-left ${bold(r) ? 'font-semibold' : 'pl-8 text-[#4A5853]'}`} title={name(r.label)}>{name(r.label)}</td>{columns.map((c, n) => <td key={c} className={`kit-num !text-right ${bold(r) ? 'font-semibold' : ''} ${n > 0 ? 'text-muted-foreground' : ''}`}>{whole(r.values[n])}</td>)}</tr>)}</tbody></table></div>
        </>;
      })()}
      {!loading && !failed && !rows.length && <Empty>No posted entries yet.</Empty>}
    </Section>
  </>);
}
