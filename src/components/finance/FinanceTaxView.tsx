import { shortMoney } from '@/utils/revenueOverview';
import { useFinanceSchedules } from '@/hooks/useFinanceSchedules';
import { useTaxNotices } from '@/hooks/useTaxNotices';
import { PageTop } from '@/components/kit/PageTop';
import { ScheduleSetup } from './ScheduleSetup';
import { TaxNoticeReview } from './TaxNoticeReview';
import { formatTableCurrency, formatTableInteger } from '@/utils/format';
import { shortDay, tenantToday } from '@/utils/salesRecordChecks';
import { Hero, Section, Status, Note, Empty } from './accounting/AccountingKit';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Tax: Hong Kong profits tax. The summary shows what is due next and how tax is set up;
// notices (append-only due evidence) and the monthly tax drafts sit underneath. Setup is the one top-row action.
export function FinanceTaxView() {
  const q = useFinanceSchedules(), notices = useTaxNotices(), today = tenantToday(), s = q.settings;
  const next = [...(notices.data ?? [])].filter(n => n.due_date >= today).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const soon = next && (Date.parse(next.due_date) - Date.parse(today)) / 86_400_000 <= 30;
  const rates = s.business_type === 'company' ? '8.25% on the first HK$2M, 16.5% above' : '7.5% on the first HK$2M, 15% above';
  const drafts = q.rows('finance_entry_drafts').filter(d => d.kind === 'tax').sort((a, b) => String(b.entry_date).localeCompare(String(a.entry_date)));
  return <div className="space-y-5 max-sm:space-y-3 min-w-0">
    <PageTop tabsAbove title="Tax" actions={<ScheduleSetup tax label="Tax setup" />} />
    <Hero aria="Tax summary" busy={q.isPending || notices.isPending} label={next ? shortDay(next.due_date) : 'nothing recorded'} check={soon ? 'Due soon' : s.tax_enabled ? 'Drafts on' : 'Drafts off'} checkTone={soon ? 'amber' : s.tax_enabled ? 'ok' : 'mut'}
      stats={[
        { label: 'Next tax due', value: next ? shortMoney(Number(next.amount)) : '—', tone: soon ? 'amber' : undefined },
        { label: 'Year end', value: `${s.year_end_day} ${MONTHS[(s.year_end_month ?? 3) - 1] ?? ''}` },
        { label: 'Rates', value: s.business_type === 'company' ? '8.25 · 16.5%' : '7.5 · 15%' },
        { label: 'Filed by', value: s.filed_by || '—' },
      ]} />
    <TaxNoticeReview />
    <Section title="Tax drafts" detail={formatTableInteger(drafts.length)} busy={q.isPending}>
      <ul className="kit divide-y divide-border/60">{drafts.map(d => <li key={d.id} className="flex items-center justify-between gap-3 px-2 min-h-11 py-2 text-[13px]">
        <span className="truncate">{shortDay(d.entry_date)} · {d.label ?? 'Tax set-aside'}</span>
        <span className="flex shrink-0 items-center gap-3"><span className="td-num">{formatTableCurrency((d.lines ?? []).reduce((n: number, l: { debit: number }) => n + Number(l.debit), 0))}</span><Status text={d.status === 'waiting' ? 'Waiting for approval' : d.status} tone={d.status === 'waiting' ? 'amber' : d.status === 'posted' ? 'ok' : 'mut'} /></span>
      </li>)}</ul>
      {!drafts.length && <Empty>No tax drafts yet.{s.tax_enabled ? '' : ' Turn on monthly drafts in Tax setup.'}</Empty>}
      {!!s.assessment_dates.length && <Note>Provisional assessment due dates: {s.assessment_dates.map(d => String(d)).join(' · ')}</Note>}
      <Note>Monthly set-aside estimates need your accountant's review; they are not a filed return. IR56B and MPF stay in Payroll.</Note>
    </Section>
  </div>;
}
