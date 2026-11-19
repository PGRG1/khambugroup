import { Hero } from '@/components/finance/accounting/AccountingKit';
import { shortMoney } from '@/utils/revenueOverview';
import { Fragment, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Navigate, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FinanceSchedulesView } from '@/components/finance/FinanceSchedulesView';
import { ReceivablesAgeing } from '@/components/finance/receivables/ReceivablesAgeing';
import { useFinancePeriod } from '@/components/kit/PeriodControl';
import { useReceivables } from '@/hooks/useReceivables';
import { usePaymentSettlements } from '@/hooks/usePaymentSettlements';
import { useBankModule } from '@/hooks/useBankModule';
import { useFinanceBooks } from '@/hooks/useFinanceBooks';
import { useFinanceReconciliations } from '@/hooks/useFinanceReconciliations';
import { useVenueScope } from '@/hooks/useVenueScope';
import { PageTop } from '@/components/kit/PageTop';
import { Toolbar } from '@/components/kit/Toolbar';
import { SettleReceivableDialog } from '@/components/finance/SettleReceivableDialog';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { formatTableCurrency, formatTableInteger } from '@/utils/format';
import { FinanceViewTabs } from '@/components/finance/FinanceViewTabs';
import '@/components/kit/kit.css';
import { bankSettled } from '@/utils/financeWorkingCapital';
import { downloadCSV } from '@/utils/csvDownload';
import { tenantToday, shortDay } from '@/utils/salesRecordChecks';

// Receivables follows Cash: Owed to you (one balance, one plain status, one next step per payer) → a payer's own page
// (what makes up the balance, oldest first). Ageing and Deposits & vouchers are their own tabs. Card payout uploads,
// batches and fee checks have their home in Cash › Card payouts.
const recTabs = [{ key: 'who', label: 'Owed to you' }, { key: 'age', label: 'Ageing' }, { key: 'deposits', label: 'Deposits & vouchers' }];
type Tone = 'ok' | 'amber' | 'muted';
type Group = 'Card payouts' | 'Delivery apps' | 'Other';
const GROUPS: Group[] = ['Card payouts', 'Delivery apps', 'Other'];
const TONE: Record<Tone, string> = { ok: 'text-[#1F6B5E]', amber: 'text-[#B45309]', muted: 'text-muted-foreground' };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86_400_000).toISOString().slice(0, 10);
const PAGE = 50;

export default function Receivables() {
  const today = tenantToday(), [params, setParams] = useSearchParams(), navigate = useNavigate();
  const ar = useReceivables(), settlements = usePaymentSettlements(), bank = useBankModule(), books = useFinanceBooks(Number(today.slice(0, 4))), recon = useFinanceReconciliations(today.slice(0, 7)), scope = useVenueScope();
  const period = useFinancePeriod('asat'), asAt = period.toIso ?? today;
  const [selected, setSelected] = useState<(typeof ar.openItems)[number] | null>(null), [search, setSearch] = useState(''), [page, setPage] = useState(1);
  const view = params.get('view') === 'age' ? 'age' : params.get('view') === 'deposits' ? 'deposits' : 'who', payer = params.get('payer');
  const posted = new Set(books.entries.filter(e => e.status === 'posted' && e.entry_date <= asAt).map(e => e.id));
  const entryDate = new Map(books.entries.map(e => [e.id, e.entry_date]));
  const clearing = books.accounts.filter(a => ['1290', '1295'].includes(a.code));
  const clearingFor = (venues: string[]) => clearing.filter(a => venues.some(v => a.name.toLowerCase().includes(v.toLowerCase())));
  const ledger = (venues: string[]) => { const ids = new Set(clearingFor(venues).map(a => a.id)); return books.lines.filter(l => posted.has(l.entry_id) && !!l.account_id && ids.has(l.account_id)).reduce((n, l) => n + Number(l.debit) - Number(l.credit), 0); };
  const bankDate = (id: string | null) => bank.transactions.find(t => t.id === id && bankSettled(t))?.txn_date ?? null;
  const merchants = settlements.merchants.filter(m => scope.includesName(m.venue) || m.shared_venues?.some(v => scope.includesName(v))).map(m => {
    const venues = [...new Set([m.venue, ...m.shared_venues].filter((v): v is string => !!v))];
    const shared = settlements.merchants.some(o => o.id !== m.id && [o.venue, ...o.shared_venues].some(v => !!v && venues.includes(v)));
    const bs = settlements.batches.filter(b => b.merchant_id === m.id), matched = bs.filter(b => bankDate(b.bank_transaction_id));
    const last = matched.map(b => b.transaction_date).sort().pop() ?? null, unmatched = bs.length - matched.length;
    const name = `${settlements.processors.find(p => p.id === m.processor_id)?.name || 'Processor'} · ${venues.join(' + ') || m.display_name}`;
    let status: string, tone: Tone;
    if (shared) { status = 'Shared between venues · split not set'; tone = 'amber'; }
    else if (!last) { status = 'No payouts matched yet'; tone = 'amber'; }
    else if (daysBetween(last, asAt) > 7) { status = `Payouts matched to ${shortDay(last)}`; tone = 'amber'; }
    else if (unmatched) { status = `${formatTableInteger(unmatched)} ${unmatched === 1 ? 'payout' : 'payouts'} to match`; tone = 'amber'; }
    else { status = `Up to date · ${shortDay(last)}`; tone = 'ok'; }
    return { id: m.id, venues, shared, name, owed: shared ? null : ledger(venues), status, tone, last };
  });
  const contractRow = recon.data?.rows.find(r => r.key === 'customer');
  const contractItems = ar.openItems.filter(i => i.account_code === '1120');
  const contractName = books.entries.some(e => posted.has(e.id) && /arca.*revenue share/i.test(e.memo) && books.lines.some(l => l.entry_id === e.id && books.accounts.some(a => a.id === l.account_id && a.code === '1120'))) ? 'Arca revenue share' : 'Other receivables';
  const contractOwed = contractRow ? (contractRow.books ?? 0) : contractItems.reduce((n, i) => n + Number(i.open_amount), 0);
  const loading = books.loading || settlements.loading || bank.loading || recon.isPending;
  type Row = { key: string; group: Group; name: string; owed: number | null; status: string; tone: Tone; action?: { label: string; run: () => void }; open?: () => void };
  const uploadPayouts = () => navigate('/finance/cash?view=payouts');
  const rows: Row[] = [
    ...merchants.map(m => ({ key: m.id, group: 'Card payouts' as Group, name: m.name, owed: m.owed, status: m.status, tone: m.tone, action: m.tone === 'amber' && !m.shared ? { label: 'Upload payouts', run: uploadPayouts } : undefined, open: () => setParams({ payer: m.id }) })),
    { key: 'delivery', group: 'Delivery apps', name: 'Foodpanda · Keeta · Deliveroo', owed: null, status: 'Not tracked yet', tone: 'muted' },
    ...(contractOwed > 0.005 || contractItems.length ? [{ key: 'contracts', group: 'Other' as Group, name: contractName, owed: contractOwed, status: contractItems.length ? `${formatTableInteger(contractItems.length)} open` : 'Recorded in the books', tone: 'muted' as Tone, open: () => setParams({ payer: 'contracts' }) }] : []),
  ];
  const shownRows = rows.filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()));
  const groupTotal = (g: Group, list = rows) => list.filter(r => r.group === g).reduce((n, r) => n + (r.owed ?? 0), 0);
  const total = GROUPS.reduce((n, g) => n + groupTotal(g), 0), needYou = rows.filter(r => r.tone === 'amber').length;
  const rowProps = (r: Row) => r.open ? { tabIndex: 0, onClick: r.open, onKeyDown: (e: KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); r.open!(); } }, 'aria-label': `Open ${r.name}` } : {};
  const actionLink = (r: Row) => r.action ? <button type="button" className="kit-link" onClick={e => { e.stopPropagation(); r.action!.run(); }}>{r.action.label}</button> : null;
  const flag = (r: Row) => r.tone === 'amber' ? <span className="sales-flag" role="img" aria-label={r.status} title={r.status}>!</span> : null;
  const owedCell = (n: number | null): ReactNode => loading ? '…' : n === null ? <span className="text-muted-foreground">—</span> : formatTableCurrency(n);
  const top = <PageTop tabsAbove title="Receivables" period={period.control} actions={<Button size="sm" className="h-10" onClick={uploadPayouts}><Upload className="h-4 w-4" />Upload payouts</Button>} />;
  const hero = (label: string, amount: number, parts: [string, number | null, boolean?][]) => <section className="glass-surface rounded-xl border border-border/60 px-5 py-5 max-sm:px-4 max-sm:py-4 min-w-0" aria-label={label} aria-busy={loading}>
    <p className="text-[13px] font-medium text-muted-foreground whitespace-nowrap">{label} · {shortDay(asAt)}</p>
    <p className="mt-1 text-[32px] sm:text-[42px] leading-none font-semibold td-num tabular-nums whitespace-nowrap">{loading ? '…' : shortMoney(amount)}</p>
    <div className="mt-4 max-sm:mt-3 grid gap-3 border-t border-border/50 pt-3" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>{parts.map(([l, v, hot]) => <div key={l} className="min-w-0"><p className="text-[11px] text-muted-foreground whitespace-nowrap">{l}</p><p className={`text-[16px] font-semibold td-num tabular-nums whitespace-nowrap ${hot ? 'text-[#B45309]' : ''}`}>{v === null ? '—' : shortMoney(v)}</p></div>)}</div>
  </section>;

  if (params.get('view') === 'payouts') return <Navigate to="/finance/cash?view=payouts" replace />;
  if (view === 'deposits') return <div className="min-w-0 w-full space-y-5 max-sm:space-y-3 pb-24"><FinanceViewTabs items={recTabs} value="deposits" /><FinanceSchedulesView focus="deferred" /></div>;
  if (view === 'age') return <div className="min-w-0 w-full space-y-5 max-sm:space-y-3 pb-24"><FinanceViewTabs items={recTabs} value="age" />{top}
    <ReceivablesAgeing asAt={asAt} contractName={contractName} onOpen={account => { const m = merchants.find(x => clearingFor(x.venues).some(a => a.name === account)); if (m) setParams({ payer: m.id }); else if (/other receivables/i.test(account)) setParams({ payer: 'contracts' }); }} /></div>;

  // ---- A payer's own page ----
  if (payer) {
    const back = <Link to="/finance/receivables" className="kit kit-link inline-block px-1 text-[13px]">← Owed to you</Link>;
    if (payer === 'contracts') return <div className="min-w-0 w-full space-y-5 max-sm:space-y-3 pb-24"><FinanceViewTabs items={recTabs} value="who" />{top}{back}
      {hero(contractName, contractOwed, [])}
      <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="What makes it up">
        <h2 className="text-base font-display font-semibold px-1">What makes it up</h2>
        <ul className="kit divide-y divide-border/60">
          {contractRow?.items.map(i => <li key={i.id} className="flex items-center justify-between gap-2 px-2 min-h-11 py-2 text-[14px]"><span className="truncate">{i.name}</span><span className="td-num shrink-0">{formatTableCurrency(i.amount ?? 0)}</span></li>)}
          {contractItems.map(i => <li key={i.line_id} className="flex items-center justify-between gap-2 px-2 min-h-11 py-2 text-[14px]"><span className="truncate">{i.memo}</span><span className="flex items-center gap-3 shrink-0"><span className="td-num">{formatTableCurrency(Number(i.open_amount))}</span><button type="button" className="kit-link text-[13px]" onClick={() => setSelected(i)}>Record payment</button></span></li>)}
          {!contractRow?.items.length && !contractItems.length && <li className="p-6 text-center text-sm text-muted-foreground">Nothing open.</li>}
        </ul>
      </section>
      <SettleReceivableDialog item={selected} open={!!selected} onOpenChange={o => !o && setSelected(null)} onSettled={ar.refresh} /></div>;
    const m = merchants.find(x => x.id === payer);
    if (!m) return loading ? <div aria-busy className="min-h-40" /> : <Navigate to="/finance/receivables" replace />;
    // Each sale day: card sales booked to this payer's clearing account; money that came in clears the oldest days first.
    const ids = new Set(clearingFor(m.venues).map(a => a.id));
    const lines = books.lines.filter(l => posted.has(l.entry_id) && !!l.account_id && ids.has(l.account_id));
    const days = new Map<string, number>();
    for (const l of lines) if (Number(l.debit) > 0) { const d = entryDate.get(l.entry_id)!; days.set(d, (days.get(d) ?? 0) + Number(l.debit)); }
    let credits = lines.reduce((n, l) => n + Number(l.credit), 0);
    const batches = settlements.batches.filter(b => b.merchant_id === m.id);
    const list = [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, sales]) => {
      const used = Math.min(credits, sales); credits -= used;
      const left = Math.round((sales - used) * 100) / 100, batch = batches.find(b => b.transaction_date === date), paidOn = batch ? bankDate(batch.bank_transaction_id) : null;
      const fees = batch ? Math.abs(Number(batch.fee_amount)) + Math.abs(Number(batch.bank_transfer_fee)) : null, net = batch ? Number(batch.net_settlement) : null;
      let status: string, tone: Tone;
      if (left <= 0.005) { status = paidOn ? `Paid ${shortDay(paidOn)}` : 'Paid'; tone = 'ok'; }
      else if (batch && !paidOn) { status = 'Payout report in · not in the bank yet'; tone = 'muted'; }
      else if (date <= addDays(asAt, -3)) { status = 'No payout report'; tone = 'amber'; }
      else { status = `Expected ${shortDay(addDays(date, 2))}`; tone = 'muted'; }
      return { date, sales, fees, net, left, status, tone };
    });
    const open = list.filter(d => d.left > 0.005), oldest = open[0]?.date ?? null;
    const recent = batches.filter(b => { const d = bankDate(b.bank_transaction_id); return d && d >= addDays(asAt, -30); }).reduce((n, b) => n + Number(b.net_settlement), 0);
    const view2 = list.filter(d => d.left > 0.005 || d.date >= addDays(asAt, -30));
    const pageRows = view2.slice((page - 1) * PAGE, page * PAGE);
    const statusCell = (d: typeof list[number]) => <span className={TONE[d.tone]}>{d.tone === 'ok' ? '✓ ' : ''}{d.status}</span>;
    return <div className="min-w-0 w-full space-y-5 max-sm:space-y-3 pb-24"><FinanceViewTabs items={recTabs} value="who" />{top}{back}
      <h2 className="px-1 text-[18px] font-display font-semibold truncate">{m.name}</h2>
      <Hero aria={m.name} busy={loading} label={shortDay(asAt)} check={m.shared ? 'Split not set' : open.length ? `${formatTableInteger(open.length)} days not paid` : 'Up to date'} checkTone={m.shared || open.length ? 'amber' : 'ok'}
        stats={[{ label: 'Owed to you', value: m.owed === null ? '—' : shortMoney(m.owed) }, { label: 'Oldest not paid', value: oldest ? shortDay(oldest) : '—', tone: !!oldest && daysBetween(oldest, asAt) > 7 ? 'amber' : undefined }, { label: 'Paid, 30 days', value: shortMoney(recent) }, { label: 'Last payout', value: m.last ? shortDay(m.last) : '—' }]} />
      <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="What makes it up">
        <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5"><span>What makes it up</span><span className="text-[13px] text-muted-foreground font-normal">· oldest first · unpaid days and the last 30 days</span></h2>
        <ul className="min-[768px]:hidden kit divide-y divide-border/60">{pageRows.map(d => <li key={d.date} className={`px-2 py-2.5 ${d.tone === 'amber' ? 'bg-[#FDF3F2]' : ''}`}><span className="flex justify-between gap-2 text-[14px]"><span>{shortDay(d.date)}</span><span className="td-num">{formatTableCurrency(d.net ?? d.left)}</span></span><span className="mt-0.5 block truncate text-[12px]">{statusCell(d)}</span></li>)}</ul>
        <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Sale days table"><table className="sales-table" aria-label="Sale days">
          <thead><tr><th scope="col" className="sales-flag-cell"><span className="sr-only">Needs you</span></th><th scope="col" className="sales-cell-left">Sale day</th><th scope="col" className="sales-cell-right">Card sales</th><th scope="col" className="sales-cell-right">Fees</th><th scope="col" className="sales-cell-right">Should arrive</th><th scope="col" className="sales-cell-right">Still owed</th><th scope="col" className="sales-cell-left">Status</th></tr></thead>
          <tbody>{pageRows.map(d => <tr key={d.date} className={d.tone === 'amber' ? 'sales-attention-row' : ''}>
            <td className="sales-flag-cell">{d.tone === 'amber' && <span className="sales-flag" role="img" aria-label={d.status} title={d.status}>!</span>}</td>
            <td className="sales-cell-left">{shortDay(d.date)}</td>
            <td className="kit-num">{formatTableCurrency(d.sales)}</td>
            <td className="kit-num">{d.fees === null ? <span className="text-muted-foreground">—</span> : formatTableCurrency(d.fees)}</td>
            <td className="kit-num">{d.net === null ? <span className="text-muted-foreground">—</span> : formatTableCurrency(d.net)}</td>
            <td className="kit-num">{d.left > 0.005 ? formatTableCurrency(d.left) : <span className="text-muted-foreground">—</span>}</td>
            <td className="sales-cell-left">{statusCell(d)}</td>
          </tr>)}</tbody></table></div>
        {!view2.length && !loading && <p className="p-8 text-center text-sm text-muted-foreground">Nothing owed and no sales in the last 30 days.</p>}
        {view2.length > PAGE && <div className="flex justify-between items-center gap-3 px-1 text-[13px] text-muted-foreground"><span className="td-num">{formatTableInteger((page - 1) * PAGE + 1)}–{formatTableInteger(Math.min(page * PAGE, view2.length))} of {formatTableInteger(view2.length)}</span><span className="flex gap-2"><button type="button" className="kit kit-btn kit-tool-btn" disabled={page === 1} onClick={() => setPage(n => n - 1)}>Previous</button><button type="button" className="kit kit-btn kit-tool-btn" disabled={page * PAGE >= view2.length} onClick={() => setPage(n => n + 1)}>Next</button></span></div>}
      </section></div>;
  }

  // ---- Owed to you ----
  const download = () => downloadCSV(rows.map(r => ({ group: r.group, who: r.name, owed: r.owed ?? '', status: r.status })), [{ key: 'group', label: 'Group' }, { key: 'who', label: 'Who' }, { key: 'owed', label: 'Owed' }, { key: 'status', label: 'Status' }], 'receivables');
  return <div className="min-w-0 w-full space-y-5 max-sm:space-y-3 pb-24"><FinanceViewTabs items={recTabs} value="who" />{top}
    {hero('Owed to you', total, GROUPS.map(g => [g, g === 'Delivery apps' ? null : groupTotal(g)]))}
    <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Who owes you" aria-busy={loading}>
      <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5"><span>{formatTableInteger(rows.length)} {rows.length === 1 ? 'source' : 'sources'}</span><span className="text-[13px] text-muted-foreground font-normal whitespace-nowrap">{needYou ? `· ${formatTableInteger(needYou)} need you` : ''}</span></h2>
      <Toolbar search={search} onSearch={setSearch} placeholder="Search" mobileSearchBelow onDownload={download} downloadLabel="Download receivables" />
      <div className="min-[768px]:hidden kit">{GROUPS.filter(g => shownRows.some(r => r.group === g)).map(g => <Fragment key={g}>
        <p className="mt-3 mb-1 px-2 flex justify-between gap-2 text-[13px] font-semibold text-[color:var(--kit-ink)] whitespace-nowrap"><span>{g}</span><span className="td-num">{g === 'Delivery apps' ? '—' : formatTableCurrency(groupTotal(g, shownRows))}</span></p>
        <ul className="divide-y divide-border/60 border-t border-border/60">{shownRows.filter(r => r.group === g).map(r => <li key={r.key} className={`flex items-center gap-2 px-2 min-h-11 py-2 ${r.tone === 'amber' ? 'bg-[#FDF3F2]' : ''} ${r.open ? 'cursor-pointer' : ''}`} {...rowProps(r)}>
          <span className="w-4 shrink-0">{flag(r)}</span>
          <span className="block flex-1 min-w-0"><span className="flex items-baseline justify-between gap-2"><span className="truncate text-[14px]">{r.name}</span><span className="td-num shrink-0 text-[14px]">{owedCell(r.owed)}</span></span>
            <span className={`mt-0.5 block truncate text-[12px] ${TONE[r.tone]}`}>{r.tone === 'ok' ? '✓ ' : ''}{r.status}{r.action && <> · {actionLink(r)}</>}</span></span>
        </li>)}</ul></Fragment>)}</div>
      <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Who owes you table"><table className="sales-table" aria-label="Who owes you">
        <thead><tr><th scope="col" className="sales-flag-cell"><span className="sr-only">Needs you</span></th><th scope="col" className="sales-cell-left">Who</th><th scope="col" className="sales-cell-right">Owed</th><th scope="col" className="sales-cell-left">Status</th><th scope="col" className="sales-cell-right"><span className="sr-only">Next step</span></th></tr></thead>
        <tbody>{GROUPS.filter(g => shownRows.some(r => r.group === g)).map(g => <Fragment key={g}>
          <tr className="sales-week-row"><th colSpan={4}><span>{g}</span></th><td className="kit-num font-semibold">{g === 'Delivery apps' ? '—' : formatTableCurrency(groupTotal(g, shownRows))}</td></tr>
          {shownRows.filter(r => r.group === g).map(r => <tr key={r.key} className={`${r.open ? 'sales-record-row' : ''} ${r.tone === 'amber' ? 'sales-attention-row' : ''}`} {...rowProps(r)}>
            <td className="sales-flag-cell">{flag(r)}</td>
            <td className="sales-cell-left" title={r.name}>{r.name}</td>
            <td className="kit-num">{owedCell(r.owed)}</td>
            <td className={`sales-cell-left ${TONE[r.tone]}`}>{r.tone === 'ok' ? '✓ ' : ''}{r.status}</td>
            <td className="kit-num">{actionLink(r)}</td>
          </tr>)}</Fragment>)}</tbody></table></div>
    </section>
  </div>;
}
