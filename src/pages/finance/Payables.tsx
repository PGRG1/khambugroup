import { shortMoney } from '@/utils/revenueOverview';
import { Fragment, useState, type KeyboardEvent } from 'react';
import { owedInCurrency } from '@/utils/fxDocument';
import { getBaseCurrency } from '@/utils/money';
import { ReceiptIndicator } from '@/components/finance/payables/ReceiptIndicator';
import { paidFromAccountLabel } from '@/utils/paymentMethods';
import { useTaxNotices } from '@/hooks/useTaxNotices';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FinanceViewTabs } from '@/components/finance/FinanceViewTabs';
import { usePayables } from '@/hooks/usePayables';
import { useFinanceObligations } from '@/hooks/useFinanceObligations';
import { useFinanceOverviewData } from '@/hooks/useFinanceOverviewData';
import { useVenueScope } from '@/hooks/useVenueScope';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import { PageTop } from '@/components/kit/PageTop';
import { useFinancePeriod } from '@/components/kit/PeriodControl';
import { paidByKindLabel } from '@/utils/paidBy';
import { RecordOwedPaymentDialog } from '@/components/finance/RecordOwedPaymentDialog';
import { PaymentReceiptsDialog } from '@/components/finance/payables/PaymentReceiptsDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeftRight } from 'lucide-react';
import { formatCurrency, formatTableInteger, formatTableCurrency } from '@/utils/format';
import { Toolbar } from '@/components/kit/Toolbar';
import { QuickFilter } from '@/components/kit/QuickFilter';
import { groupPayees, daysLate, type OwedItem } from '@/utils/financeWorkingCapital';
import { downloadCSV } from '@/utils/csvDownload';
import { useSupplierDisplayTerms } from '@/components/finance/FinanceAging';
import { dueFromTerms, selectPaymentRun, capPaymentAmount } from '@/utils/financeReportViews';
import { useBankModule } from '@/hooks/useBankModule';
import { tenantToday, shortDay } from '@/utils/salesRecordChecks';

// Payables follows Cash and Receivables: Suppliers (you owe, then one owed amount, plain status and Pay per payee),
// Bills (every bill, earliest due first), Payments (what was paid and whether it is in the bank), Ageing (by days late).
// A supplier's account page lives in Purchasing (/procurement/finance/suppliers/:id); rows link there.
type Cat = 'Suppliers' | 'Bills & contracts' | 'Staff & MPF' | 'Paid for you';
const CATS: Cat[] = ['Suppliers', 'Bills & contracts', 'Staff & MPF', 'Paid for you'];
// 'Paid for you': staff, the director or a group company paid a supplier, and the business owes them back.
const catOf = (i: OwedItem): Cat => i.source === 'supplier' ? 'Suppliers' : i.source === 'bill' ? 'Bills & contracts' : i.source === 'person' ? 'Paid for you' : 'Staff & MPF';
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);
const AGE = ['Not due / 0–30 days', '31–60 days late', '61–90 days late', 'Over 90 days late'];
const ageIndex = (late: number) => late <= 30 ? 0 : late <= 60 ? 1 : late <= 90 ? 2 : 3;

export default function Payables() {
  const notices = useTaxNotices(), bank = useBankModule(), terms = useSupplierDisplayTerms(), ap = usePayables(), other = useFinanceObligations(), facts = useFinanceOverviewData(), scope = useVenueScope(), preview = usePreviewMode(), navigate = useNavigate();
  const period = useFinancePeriod('asat'), asAt = period.toIso ?? tenantToday();
  const [params] = useSearchParams(), view = (['bills', 'payments', 'age'] as const).find(v => v === params.get('view')) ?? 'who';
  const [filter, setFilter] = useState('all'), [run, setRun] = useState(false), [selected, setSelected] = useState<string[]>([]), [record, setRecord] = useState<OwedItem[]>([]), [paymentId, setPaymentId] = useState<string | null>(null), [search, setSearch] = useState(''), [payFrom, setPayFrom] = useState('none'), [payNow, setPayNow] = useState<Record<string, number>>({}), [editingAmount, setEditingAmount] = useState<string | null>(null);

  const suppliers: OwedItem[] = ap.invoices.filter(i => i.outstanding_amount > .005 && i.payment_status !== 'voided' && scope.includesName(i.venue)).map(i => ({ key: `supplier:${i.id}`, id: i.id, source: 'supplier', payeeKey: `supplier:${i.supplier_id}`, payee: i.supplier_name, what: i.invoice_number || 'Invoice', venue: i.venue, date: i.invoice_date, due: dueFromTerms(i.invoice_date, i.due_date, terms.data?.find(s => s.id === i.supplier_id)?.payment_terms), amount: i.outstanding_amount, currency: i.currency, owed_in_currency: i.owed_in_currency, supplierId: i.supplier_id, link: `/procurement/finance/suppliers/${i.supplier_id}` }));
  const all = [...suppliers, ...other.items].filter(i => i.date <= asAt);
  const matchesSearch = (i: OwedItem) => `${i.payee} ${i.what}`.toLowerCase().includes(search.toLowerCase());
  const items = all.filter(matchesSearch);
  const total = all.reduce((n, i) => n + i.amount, 0), late = (i: OwedItem) => daysLate(i.due, asAt);
  const overdue = all.filter(i => late(i) > 0), overdueTotal = overdue.reduce((n, i) => n + i.amount, 0);
  const lastStatement = facts.data?.statements.map(s => String(s.period_end)).sort().pop();
  const unpaidSince = lastStatement ? suppliers.filter(i => i.date > lastStatement && i.date <= asAt).length : 0;
  const loading = ap.loading || other.loading;
  const refresh = () => { ap.refresh(); void other.reload(); };
  const catTotal = (c: Cat) => all.filter(i => catOf(i) === c).reduce((n, i) => n + i.amount, 0);
  const statusOf = (list: OwedItem[]) => {
    const lates = list.filter(i => late(i) > 0), dues = list.map(i => i.due).filter((d): d is string => !!d).sort();
    if (lates.length) return { text: `${formatTableInteger(lates.length)} overdue · oldest ${shortDay(lates.map(i => i.due!).sort()[0])}`, amber: true };
    return { text: dues[0] ? `Due ${shortDay(dues[0])}` : 'No due date', amber: false };
  };
  const dueText = (i: OwedItem) => { const d = late(i); return d > 0 ? `${formatTableInteger(d)} days late` : i.due ? (i.due === asAt ? 'Due today' : `Due in ${formatTableInteger(Math.max(1, Math.round((Date.parse(i.due) - Date.parse(asAt)) / 86_400_000)))} days`) : 'No due date'; };
  const open = (link?: string) => navigate(link || '/finance/payables');
  const keyOpen = (fn: () => void) => ({ tabIndex: 0, onClick: fn, onKeyDown: (e: KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fn(); } } });
  const pay = (list: OwedItem[]) => !preview.isPreviewActive && <button type="button" className="kit-link" onClick={e => { e.stopPropagation(); setRecord(list); }}>Pay</button>;
  const flag = (text: string) => <span className="sales-flag" role="img" aria-label={text} title={text}>!</span>;
  const startPlan = () => { const first = bank.accounts.filter(a => a.is_active && !/^test/i.test(a.account_name))[0]; setPayFrom(first?.id ?? 'none'); const picks = selectPaymentRun(all, first ? bank.statementBalanceFor(first.id) : 0, asAt); setPayNow(picks); setSelected(Object.keys(picks)); setRun(true); };
  const top = <PageTop tabsAbove title="Payables" period={period.control} actions={<Button size="sm" className="h-10" disabled={preview.isPreviewActive || !all.length} onClick={startPlan}><ArrowLeftRight className="h-4 w-4" />Plan payments</Button>} />;
  const note = lastStatement && unpaidSince > 0 ? <p className="px-1 text-[12px] text-muted-foreground">{formatTableInteger(unpaidSince)} invoices dated after your last bank statement ({shortDay(lastStatement)}) show unpaid; some may already be paid. Upload bank statements and Bani matches them.</p> : null;

  // ---- Suppliers ----
  const suppliersView = () => {
    const groups = CATS.map(c => ({ c, gs: groupPayees(items.filter(i => catOf(i) === c)).map(g => ({ g, s: statusOf(g.items) })).sort((x, y) => Number(y.s.amber) - Number(x.s.amber) || y.g.amount - x.g.amount) })).filter(x => x.gs.length);
    const payees = new Set(all.map(i => i.payeeKey ?? i.payee)).size, needs = groupPayees(all).filter(g => g.items.some(i => late(i) > 0)).length;
    const download = () => downloadCSV(groups.flatMap(x => x.gs.map(({ g, s }) => ({ group: x.c, who: g.name, owed: g.amount, status: s.text }))), [{ key: 'group', label: 'Group' }, { key: 'who', label: 'Who' }, { key: 'owed', label: 'Owed' }, { key: 'status', label: 'Status' }], 'payables');
    return <>
      <section className="glass-surface rounded-xl border border-border/60 px-5 py-5 space-y-4 max-sm:px-4 max-sm:py-4 max-sm:space-y-3 min-w-0" aria-label="You owe" aria-busy={loading}>
        <div><p className="text-[13px] font-medium text-muted-foreground whitespace-nowrap">You owe · {shortDay(asAt)}</p>
        <p className="mt-1 text-[32px] sm:text-[42px] leading-none font-semibold td-num tabular-nums whitespace-nowrap">{loading ? '…' : shortMoney(total)}</p>
        {overdueTotal > 0.005 && <p className="mt-2 max-sm:mt-1.5 text-[13px] max-sm:text-[12px] text-[#B45309] tabular-nums">{shortMoney(overdueTotal)} overdue</p>}</div>
        <div className="grid gap-3 border-t border-border/50 pt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>{CATS.map(c => <div key={c} className="min-w-0"><p className="text-[11px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">{c}</p><p className="text-[16px] font-semibold td-num tabular-nums whitespace-nowrap">{shortMoney(catTotal(c))}</p></div>)}</div>
      </section>
      <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Who you owe" aria-busy={loading}>
        <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5"><span>{formatTableInteger(payees)} {payees === 1 ? 'payee' : 'payees'}</span><span className="text-[13px] text-muted-foreground font-normal whitespace-nowrap">· {formatTableCurrency(total)}{needs ? ` · ${formatTableInteger(needs)} overdue` : ''}</span></h2>
        <Toolbar search={search} onSearch={setSearch} placeholder="Search" mobileSearchBelow onDownload={download} downloadLabel="Download payables" />
        <div className="min-[768px]:hidden kit">{groups.map(({ c, gs }) => <Fragment key={c}>
          <p className="mt-3 mb-1 px-2 flex justify-between gap-2 text-[13px] font-semibold text-[color:var(--kit-ink)] whitespace-nowrap"><span>{c}</span><span className="td-num">{formatTableCurrency(gs.reduce((n, x) => n + x.g.amount, 0))}</span></p>
          <ul className="divide-y divide-border/60 border-t border-border/60">{gs.map(({ g, s }) => <li key={g.key} className={`flex items-center gap-2 px-2 min-h-11 py-2 cursor-pointer ${s.amber ? 'bg-[#FDF3F2]' : ''}`} {...keyOpen(() => open(g.items[0]?.link))}>
            <span className="w-4 shrink-0">{s.amber && flag(s.text)}</span>
            <span className="block flex-1 min-w-0"><span className="flex items-baseline justify-between gap-2"><span className="truncate text-[14px]">{g.name}</span><span className="td-num shrink-0 text-[14px]">{formatTableCurrency(g.amount)}</span></span>
              <span className={`mt-0.5 block truncate text-[12px] ${s.amber ? 'text-[#B45309]' : 'text-muted-foreground'}`}>{s.text}{s.amber && !preview.isPreviewActive && <> · {pay(g.items)}</>}</span></span>
          </li>)}</ul></Fragment>)}</div>
        <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Who you owe table"><table className="sales-table" aria-label="Who you owe">
          <thead><tr><th scope="col" className="sales-flag-cell"><span className="sr-only">Overdue</span></th><th scope="col" className="sales-cell-left">Who</th><th scope="col" className="sales-cell-right">Owed</th><th scope="col" className="sales-cell-left">Due soonest</th><th scope="col" className="sales-cell-left">Status</th><th scope="col" className="sales-cell-right"><span className="sr-only">Pay</span></th></tr></thead>
          <tbody>{groups.map(({ c, gs }) => <Fragment key={c}>
            <tr className="sales-week-row"><th colSpan={5}><span>{c}</span></th><td className="kit-num font-semibold">{formatTableCurrency(gs.reduce((n, x) => n + x.g.amount, 0))}</td></tr>
            {gs.map(({ g, s }) => { const due = g.items.map(i => i.due).filter((d): d is string => !!d).sort()[0], fx = owedInCurrency(g.items, getBaseCurrency()); return <tr key={g.key} className={`sales-record-row ${s.amber ? 'sales-attention-row' : ''}`} {...keyOpen(() => open(g.items[0]?.link))}>
              <td className="sales-flag-cell">{s.amber && flag(s.text)}</td>
              <td className="sales-cell-left" title={[g.name, paidByKindLabel(g.items[0]?.personKind)].filter(Boolean).join(" · ")}>{g.name}</td>
              <td className="kit-num" title={fx ? `Owed in currency ${fx}` : undefined}>{formatTableCurrency(g.amount)}</td>
              <td className="sales-cell-left">{due ? shortDay(due) : <span className="text-muted-foreground">—</span>}</td>
              <td className={`sales-cell-left ${s.amber ? 'text-[#B45309]' : 'text-muted-foreground'}`}>{s.text}</td>
              <td className="kit-num">{pay(g.items)}</td>
            </tr>; })}</Fragment>)}</tbody></table></div>
        {!groups.length && !loading && <p className="p-8 text-center text-sm text-muted-foreground">{search ? 'Nothing matches your search.' : 'Nothing owed.'}</p>}
        {note}
      </section>
    </>;
  };

  // ---- Bills ----
  const billsView = () => {
    const weekEnd = addDays(asAt, 7);
    const list = items.filter(i => filter === 'overdue' ? late(i) > 0 : filter === 'week' ? !!i.due && late(i) <= 0 && i.due <= weekEnd : true).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
    const download = () => downloadCSV(list.map(i => ({ due: i.due ?? '', who: i.payee, what: i.what, venue: i.venue ?? '', owed: i.amount, status: dueText(i) })), [{ key: 'due', label: 'Due' }, { key: 'who', label: 'Who' }, { key: 'what', label: 'What' }, { key: 'venue', label: 'Venue' }, { key: 'owed', label: 'Owed' }, { key: 'status', label: 'Status' }], 'bills-to-pay');
    const week = all.filter(i => !!i.due && late(i) <= 0 && i.due <= weekEnd).length;
    return <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Bills to pay" aria-busy={loading}>
      <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5"><span>Bills to pay</span><span className="text-[13px] text-muted-foreground font-normal whitespace-nowrap">· earliest due first · {formatTableInteger(all.length)} open{overdue.length ? ` · ${formatTableInteger(overdue.length)} overdue` : ''}</span></h2>
      <QuickFilter label="Bills" value={filter} onChange={setFilter} options={[{ key: 'all', label: 'All', count: all.length }, { key: 'overdue', label: 'Overdue', count: overdue.length }, { key: 'week', label: 'Due this week', count: week }]} />
      <Toolbar search={search} onSearch={setSearch} placeholder="Search" mobileSearchBelow onDownload={download} downloadLabel="Download bills" />
      <ul className="min-[768px]:hidden kit divide-y divide-border/60" aria-label="Bills to pay">{list.map(i => { const l = late(i) > 0; return <li key={i.key} className={`flex items-center gap-2 px-2 min-h-11 py-2 cursor-pointer ${l ? 'bg-[#FDF3F2]' : ''}`} {...keyOpen(() => open(i.link))}>
        <span className="w-4 shrink-0">{l && flag(dueText(i))}</span>
        <span className="block flex-1 min-w-0"><span className="flex items-baseline justify-between gap-2"><span className="truncate text-[14px]">{i.payee}</span><span className="td-num shrink-0 text-[14px]">{formatTableCurrency(i.amount)}</span></span>
          <span className={`mt-0.5 block truncate text-[12px] ${l ? 'text-[#B45309]' : 'text-muted-foreground'}`}>{[i.what, i.due ? `due ${shortDay(i.due)}` : null, dueText(i)].filter(Boolean).join(' · ')}{!preview.isPreviewActive && <> · {pay([i])}</>}</span></span>
      </li>; })}</ul>
      <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Bills table"><table className="sales-table" aria-label="Bills to pay">
        <thead><tr><th scope="col" className="sales-flag-cell"><span className="sr-only">Overdue</span></th><th scope="col" className="sales-cell-left">Due</th><th scope="col" className="sales-cell-left">Who</th><th scope="col" className="sales-cell-left">What</th><th scope="col" className="sales-cell-left">Venue</th><th scope="col" className="sales-cell-right">Owed</th><th scope="col" className="sales-cell-left">Status</th><th scope="col" className="sales-cell-right"><span className="sr-only">Pay</span></th></tr></thead>
        <tbody>{list.map(i => { const l = late(i) > 0; return <tr key={i.key} className={`sales-record-row ${l ? 'sales-attention-row' : ''}`} {...keyOpen(() => open(i.link))}>
          <td className="sales-flag-cell">{l && flag(dueText(i))}</td>
          <td className="sales-cell-left">{i.due ? shortDay(i.due) : <span className="text-muted-foreground">—</span>}</td>
          <td className="sales-cell-left" title={[i.payee, paidByKindLabel(i.personKind)].filter(Boolean).join(" · ")}>{i.payee}</td>
          <td className="sales-cell-left" title={i.what}>{i.what}</td>
          <td className="sales-cell-left">{i.venue || <span className="text-muted-foreground">—</span>}</td>
          <td className="kit-num">{formatTableCurrency(i.amount)}</td>
          <td className={`sales-cell-left ${l ? 'text-[#B45309]' : 'text-muted-foreground'}`}>{dueText(i)}</td>
          <td className="kit-num">{pay([i])}</td>
        </tr>; })}</tbody></table></div>
      {!list.length && !loading && <p className="p-8 text-center text-sm text-muted-foreground">Nothing here.</p>}
      {!!notices.data?.length && <div className="space-y-1 px-1 pt-2"><p className="text-[13px] font-semibold text-[color:var(--kit-ink)]">Tax assessments · due, not in the books</p>{notices.data.filter(n => (n.created_at?.slice(0, 10) ?? asAt) <= asAt).map(n => <Link key={n.id} to="/finance/books?view=tax" className="flex justify-between gap-2 border-t border-border/60 py-2 text-[13px]"><span className="truncate">{n.reference} · {n.tax_year}</span><span className="shrink-0 text-muted-foreground">due {shortDay(n.due_date)}</span><span className="td-num shrink-0">{formatTableCurrency(Number(n.amount))}</span></Link>)}</div>}
      {note}
    </section>;
  };

  // ---- Payments ----
  const paymentsView = () => {
    const rows = [
      ...ap.payments.map(p => ({ key: p.id, own: true, id: p.id, date: p.payment_date, who: p.supplier_name, from: paidFromAccountLabel(p.paid_from_account_name), amount: Number(p.amount), what: p.allocation_count ? `${formatTableInteger(p.allocation_count)} ${p.allocation_count === 1 ? 'invoice' : 'invoices'}${Number(p.unallocated_amount) > 0.005 ? ` · ${formatTableCurrency(Number(p.unallocated_amount))} on account` : ''}` : 'On account', inBank: p.match_status === 'matched' || p.match_status === 'not_required', noBank: p.match_status === 'not_required', receipts: p.receipt_count ?? 0, link: '' })),
      ...other.history.map(p => ({ key: p.key, own: false, id: p.paymentId ?? '', date: p.date, who: p.payee, from: p.method, amount: Number(p.amount), what: '', noBank: false, inBank: /match|clear|bank/i.test(p.match), receipts: 0, link: p.link })),
    ].filter(r => r.date <= asAt && (!search || r.who.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => b.date.localeCompare(a.date));
    const download = () => downloadCSV(rows.map(r => ({ date: r.date, who: r.who, from: r.from, amount: r.amount, what: r.what, bank: r.noBank ? 'No bank payment' : r.inBank ? 'In the bank' : 'Not in the bank yet' })), [{ key: 'date', label: 'Date' }, { key: 'who', label: 'Paid to' }, { key: 'from', label: 'From' }, { key: 'amount', label: 'Amount' }, { key: 'what', label: 'What it paid' }, { key: 'bank', label: 'Bank' }], 'payments');
    const openRow = (r: typeof rows[number]) => r.own ? setPaymentId(r.id) : r.link && navigate(r.link);
    const bankCell = (r: typeof rows[number]) => r.noBank ? <span className="text-muted-foreground">No bank payment</span> : r.inBank ? <span className="text-[#1F6B5E]">✓ In the bank</span> : <span className="text-[#B45309]">Not in the bank yet</span>;
    return <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Payments" aria-busy={loading}>
      <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5"><span>Payments</span><span className="text-[13px] text-muted-foreground font-normal whitespace-nowrap">· {formatTableInteger(rows.length)} · {formatTableCurrency(rows.reduce((n, r) => n + r.amount, 0))}</span></h2>
      <Toolbar search={search} onSearch={setSearch} placeholder="Search" mobileSearchBelow onDownload={download} downloadLabel="Download payments" />
      <ul className="min-[768px]:hidden kit divide-y divide-border/60" aria-label="Payments">{rows.map(r => <li key={r.key} className={`flex items-center gap-2 px-2 min-h-11 py-2 cursor-pointer ${r.inBank ? '' : 'bg-[#FDF3F2]'}`} {...keyOpen(() => openRow(r))}>
        <span className="w-4 shrink-0">{!r.inBank && flag('Not in the bank yet')}</span>
        <span className="block flex-1 min-w-0"><span className="flex items-baseline justify-between gap-2"><span className="truncate text-[14px]">{r.who}</span><span className="td-num shrink-0 text-[14px]">{formatTableCurrency(r.amount)}</span></span>
          <span className="mt-0.5 block truncate text-[12px]"><span className="text-muted-foreground">{[shortDay(r.date), r.what].filter(Boolean).join(' · ')} · </span>{bankCell(r)}</span></span>
      </li>)}</ul>
      <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Payments table"><table className="sales-table" aria-label="Payments">
        <thead><tr><th scope="col" className="sales-flag-cell"><span className="sr-only">Not in the bank</span></th><th scope="col" className="sales-cell-left">Date</th><th scope="col" className="sales-cell-left">Paid to</th><th scope="col" className="sales-cell-left">From</th><th scope="col" className="sales-cell-right">Amount</th><th scope="col" className="sales-cell-left">What it paid</th><th scope="col" className="sales-cell-left">Bank</th><th scope="col" className="sales-cell-right"><span className="sr-only">Receipts</span></th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.key} className={`sales-record-row ${r.inBank ? '' : 'sales-attention-row'}`} {...keyOpen(() => openRow(r))}>
          <td className="sales-flag-cell">{!r.inBank && flag('Not in the bank yet')}</td>
          <td className="sales-cell-left">{shortDay(r.date)}</td>
          <td className="sales-cell-left" title={r.who}>{r.who}</td>
          <td className="sales-cell-left text-muted-foreground">{r.from || '—'}</td>
          <td className="kit-num">{formatTableCurrency(r.amount)}</td>
          <td className="sales-cell-left text-muted-foreground">{r.what || '—'}</td>
          <td className="sales-cell-left">{bankCell(r)}</td>
          <td className="kit-num">{r.own && <ReceiptIndicator count={r.receipts} onClick={() => setPaymentId(r.id)} />}</td>
        </tr>)}</tbody></table></div>
      {!rows.length && !loading && <p className="p-8 text-center text-sm text-muted-foreground">No payments recorded.</p>}
    </section>;
  };

  // ---- Ageing ----
  const ageingView = () => {
    const groups = groupPayees(items).map(g => { const v = [0, 0, 0, 0]; for (const i of g.items) v[ageIndex(late(i))] += i.amount; return { g, v }; }).sort((a, b) => b.v[3] - a.v[3] || b.g.amount - a.g.amount);
    const tot = [0, 1, 2, 3].map(k => groups.reduce((n, x) => n + x.v[k], 0)), sum = tot.reduce((n, v) => n + v, 0);
    const amt = (v: number, hot = false) => v > 0.005 ? <span className={hot ? 'font-semibold text-[#B45309]' : ''}>{formatTableCurrency(v)}</span> : <span className="text-muted-foreground">—</span>;
    const download = () => downloadCSV(groups.map(({ g, v }) => ({ who: g.name, a: v[0], b: v[1], c: v[2], d: v[3], total: g.amount })), [{ key: 'who', label: 'Who' }, { key: 'a', label: AGE[0] }, { key: 'b', label: AGE[1] }, { key: 'c', label: AGE[2] }, { key: 'd', label: AGE[3] }, { key: 'total', label: 'Total' }], `payables-ageing-${asAt}`);
    return <>
      <section className="glass-surface rounded-xl border border-border/60 px-5 py-5 max-sm:px-4 max-sm:py-4 min-w-0" aria-label="You owe by age" aria-busy={loading}>
        <p className="text-[13px] font-medium text-muted-foreground whitespace-nowrap">You owe · {shortDay(asAt)}</p>
        <p className="mt-1 text-[32px] sm:text-[42px] leading-none font-semibold td-num tabular-nums whitespace-nowrap">{loading ? '…' : shortMoney(sum)}</p>
        <div className="mt-4 max-sm:mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-border/50 pt-3">{AGE.map((b, k) => <div key={b} className="min-w-0"><p className="text-[11px] text-muted-foreground whitespace-nowrap">{b}</p><p className={`text-[16px] font-semibold td-num tabular-nums whitespace-nowrap ${k === 3 && tot[3] > 0.005 ? 'text-[#B45309]' : ''}`}>{shortMoney(tot[k])}</p></div>)}</div>
      </section>
      <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="By who" aria-busy={loading}>
        <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5"><span>By who</span><span className="text-[13px] text-muted-foreground font-normal">· days past the due date</span></h2>
        <Toolbar search={search} onSearch={setSearch} placeholder="Search" mobileSearchBelow onDownload={download} downloadLabel="Download ageing" />
        <ul className="min-[768px]:hidden kit divide-y divide-border/60">{groups.map(({ g, v }) => <li key={g.key} className={`px-2 py-2.5 cursor-pointer ${v[3] > 0.005 ? 'bg-[#FDF3F2]' : ''}`} {...keyOpen(() => open(g.items[0]?.link))}>
          <span className="flex items-baseline justify-between gap-2 text-[14px]"><span className="truncate">{g.name}</span><span className="td-num shrink-0">{formatTableCurrency(g.amount)}</span></span>
          <span className="mt-1.5 grid grid-cols-4 gap-1">{['0–30', '31–60', '61–90', '90+'].map((b, k) => <span key={b} className="min-w-0"><span className="block text-[11px] text-muted-foreground">{b}</span><span className={`block text-[12px] td-num whitespace-nowrap overflow-hidden text-ellipsis ${k === 3 && v[3] > 0.005 ? 'font-semibold text-[#B45309]' : ''}`}>{v[k] > 0.005 ? formatTableCurrency(v[k]).replace(/^HK\$/, '') : '—'}</span></span>)}</span>
        </li>)}</ul>
        <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Ageing table"><table className="sales-table" aria-label="Payables ageing">
          <thead><tr><th scope="col" className="sales-flag-cell"><span className="sr-only">Over 90 days</span></th><th scope="col" className="sales-cell-left">Who</th><th scope="col" className="sales-cell-right">Not due / 0–30</th><th scope="col" className="sales-cell-right">31–60</th><th scope="col" className="sales-cell-right">61–90</th><th scope="col" className="sales-cell-right">Over 90</th><th scope="col" className="sales-cell-right">Total</th></tr></thead>
          <tbody>{groups.map(({ g, v }) => <tr key={g.key} className={`sales-record-row ${v[3] > 0.005 ? 'sales-attention-row' : ''}`} {...keyOpen(() => open(g.items[0]?.link))}>
            <td className="sales-flag-cell">{v[3] > 0.005 && flag('Over 90 days late')}</td>
            <td className="sales-cell-left" title={[g.name, paidByKindLabel(g.items[0]?.personKind)].filter(Boolean).join(" · ")}>{g.name}</td>
            {v.map((x, k) => <td key={k} className="kit-num">{amt(x, k === 3)}</td>)}
            <td className="kit-num font-semibold">{formatTableCurrency(g.amount)}</td>
          </tr>)}
            {groups.length > 0 && <tr><th colSpan={2} className="sales-cell-left font-semibold">Total</th>{tot.map((x, k) => <td key={k} className="kit-num font-semibold">{amt(x, k === 3)}</td>)}<td className="kit-num font-semibold">{formatTableCurrency(sum)}</td></tr>}
          </tbody></table></div>
        {!groups.length && !loading && <p className="p-8 text-center text-sm text-muted-foreground">Nothing owed.</p>}
      </section>
    </>;
  };

  return <div className="min-w-0 w-full space-y-5 max-sm:space-y-3 pb-24">
    <FinanceViewTabs value={view} items={[{ key: 'who', label: 'Suppliers' }, { key: 'bills', label: 'Bills' }, { key: 'payments', label: 'Payments' }, { key: 'age', label: 'Ageing' }]} />
    {top}
    {view === 'bills' ? billsView() : view === 'payments' ? paymentsView() : view === 'age' ? ageingView() : suppliersView()}
    <Dialog open={run} onOpenChange={setRun}><DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Bani's payment plan</DialogTitle><p className="text-sm text-muted-foreground">Bani picked what is due first and fits your bank balance. Untick or change any amount.</p></DialogHeader>
      <Select value={payFrom} onValueChange={v => { setPayFrom(v); const picks = selectPaymentRun(all, bank.statementBalanceFor(v), asAt); setPayNow(picks); setSelected(Object.keys(picks)); }}><SelectTrigger aria-label="Pay from"><SelectValue placeholder="Pay from" /></SelectTrigger><SelectContent><SelectItem value="none">Choose bank account</SelectItem>{bank.accounts.filter(a => a.is_active).map(a => <SelectItem key={a.id} value={a.id}>{a.account_name} · {formatCurrency(bank.statementBalanceFor(a.id))}</SelectItem>)}</SelectContent></Select>
      <div className="overflow-x-auto"><table className="w-full min-w-[480px] table-fixed text-sm"><thead><tr><th className="w-10" /><th className="text-left p-2">Who</th><th className="p-2 w-32">Owed</th><th className="p-2 w-32">Pay now</th></tr></thead><tbody>{all.map(i => <tr key={i.key} className="border-b border-border"><td><Checkbox aria-label={`Select ${i.payee} ${i.what}`} checked={selected.includes(i.key)} onCheckedChange={v => { setSelected(s => v === true ? [...s, i.key] : s.filter(k => k !== i.key)); if (v === true) setPayNow(p => ({ ...p, [i.key]: Math.max(0, Math.min(i.amount, bank.statementBalanceFor(payFrom) - selected.reduce((n, k) => n + (payNow[k] ?? 0), 0))) })); }} /></td><td className="p-2 break-words">{i.payee}<p className="text-xs text-muted-foreground">{i.what}</p></td><td className="p-2 td-num">{formatCurrency(i.amount)}</td><td className="p-2">{editingAmount === i.key ? <Input type="number" aria-label={`Pay now ${i.what}`} value={payNow[i.key] ?? 0} onBlur={() => setEditingAmount(null)} onChange={e => setPayNow(p => ({ ...p, [i.key]: capPaymentAmount(Number(e.target.value), i.amount, bank.statementBalanceFor(payFrom), selected.filter(k => k !== i.key).reduce((n, k) => n + (p[k] ?? 0), 0)) }))} /> : <Button variant="ghost" className="p-0 td-num" onClick={() => setEditingAmount(i.key)}>{formatCurrency(payNow[i.key] ?? 0)}</Button>}</td></tr>)}</tbody></table></div>
      <p className="text-sm td-num">Selected {formatCurrency(selected.reduce((n, k) => n + (payNow[k] ?? 0), 0))} · available {formatCurrency(payFrom === 'none' ? 0 : bank.statementBalanceFor(payFrom))}</p>
      <Button disabled={payFrom === 'none' || !selected.length || selected.reduce((n, k) => n + (payNow[k] ?? 0), 0) > bank.statementBalanceFor(payFrom) || selected.reduce((n, k) => n + (payNow[k] ?? 0), 0) <= 0} onClick={() => downloadCSV(all.filter(i => selected.includes(i.key) && (payNow[i.key] ?? 0) > 0).map(i => ({ who: i.payee, what: i.what, amount: payNow[i.key], account: bank.accounts.find(a => a.id === payFrom)?.account_name })), [{ key: 'who', label: 'Who' }, { key: 'what', label: 'Item' }, { key: 'amount', label: 'Pay now' }, { key: 'account', label: 'Pay from' }], 'payment-list')}>Download payment list</Button>
      <p className="text-xs text-muted-foreground">Prepared only · nothing is marked paid or sent to your bank.</p>
    </DialogContent></Dialog>
    <RecordOwedPaymentDialog items={record} credits={ap.creditNotesAvailable} accounts={ap.bankAccounts} onClose={() => setRecord([])} onSaved={refresh} />
    <PaymentReceiptsDialog open={!!paymentId} onOpenChange={o => !o && setPaymentId(null)} paymentId={paymentId} />
  </div>;
}
