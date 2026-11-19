import { shortMoney } from '@/utils/revenueOverview';
import {BaseCurrencySetting} from '@/components/settings/BaseCurrencySetting';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { useBaseCurrency } from '@/hooks/useFxRate';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import { formatTableInteger } from '@/utils/format';
import { shortDay, tenantToday } from '@/utils/salesRecordChecks';
import { PageTop } from '@/components/kit/PageTop';
import { Hero, Section, Status, Flag, PhoneRow, Ask, Note, Empty, type Tone } from './accounting/AccountingKit';
import { currencySymbol, formatRate } from '@/utils/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

type Row = { currency: string; first_used: string | null; used_in: string; today_rate: number | null; today_date: string | null; today_nearest: boolean | null; month_end_rate: number | null; month_end_date: string | null; month_end_nearest: boolean | null };

/** Books › Currencies: base, rate source, currencies in use with today's and last month-end rate; manual override per date. */
export function CurrenciesView() {
  const { tenantId } = useActiveTenant(), base = useBaseCurrency().data?.base ?? 'HKD', cache = useQueryClient(), preview = usePreviewMode();
  const q = useQuery({ queryKey: ['fx-in-use', tenantId], enabled: !!tenantId, queryFn: async () => { const { data, error } = await supabase.rpc('fx_currencies_in_use', { p_tenant: tenantId! }); if (error) throw error; return (data ?? []) as Row[]; } });
  const [edit, setEdit] = useState<{ currency: string; date: string; rate: string } | null>(null);
  async function save() {
    if (!edit || !tenantId) return; const rate = Number(edit.rate);
    if (!(rate > 0)) { toast.error('Enter a rate above 0'); return; }
    const { error } = await supabase.from('bank_fx_rates').upsert({ tenant_id: tenantId, rate_date: edit.date, from_currency: edit.currency, to_currency: base, rate, source: 'manual', overridden_at: new Date().toISOString() }, { onConflict: 'tenant_id,rate_date,from_currency,to_currency' });
    if (error) { toast.error(error.message); return; }
    toast.success('Rate saved'); setEdit(null); await cache.invalidateQueries({ queryKey: ['fx-in-use'] }); await cache.invalidateQueries({ queryKey: ['fx-rate'] });
  }
  const list = q.data ?? [], missing = list.filter(r => r.today_rate == null), nearest = list.filter(r => r.today_rate != null && r.today_nearest);
  const status = (r: Row): { text: string; tone: Tone } => r.today_rate == null ? { text: 'No rate yet', tone: 'amber' } : r.today_nearest ? { text: 'Using nearest rate', tone: 'mut' } : { text: 'Up to date', tone: 'ok' };
  const rate = (v: number | null, d: string | null) => v == null ? '—' : `${formatRate(Number(v))}${d ? ` · ${shortDay(d)}` : ''}`;
  const setRate = (r: Row) => setEdit({ currency: r.currency, date: tenantToday(), rate: r.today_rate ? String(r.today_rate) : '' });
  const btn = (r: Row) => !preview.isPreviewActive && <button type="button" className="kit-link" onClick={e => { e.stopPropagation(); setRate(r); }}>Set rate</button>;
  return <div className="space-y-5 max-sm:space-y-3 min-w-0">
    <PageTop tabsAbove title="Currency" />
    <Hero aria="Currency summary" busy={q.isPending} label={`home ${base}`} check={missing.length ? `${formatTableInteger(missing.length)} missing` : 'Up to date'} checkTone={missing.length ? 'amber' : 'ok'}
      stats={[{ label: 'Currencies', value: formatTableInteger(list.length + 1) }, { label: 'Foreign', value: formatTableInteger(list.length) }, { label: 'Rates missing', value: formatTableInteger(missing.length), tone: missing.length ? 'amber' : undefined }, { label: 'Nearest day', value: formatTableInteger(nearest.length) }]} />
    {!!missing.length && <Ask>no rate today for {missing.map(r => r.currency).join(', ')}.</Ask>}
    <Section title="Currencies" detail={formatTableInteger(list.length + 1)} busy={q.isPending}>
      <ul className="min-[768px]:hidden kit divide-y divide-border/60">
        <PhoneRow title={`${base} · ${currencySymbol(base)}`} sub="Home currency · everything is booked in it" />
        {list.map(r => { const s = status(r); return <PhoneRow key={r.currency} flag={s.tone === 'amber' && s.text} title={`${r.currency} · ${currencySymbol(r.currency)}`} amount={r.today_rate == null ? '—' : formatRate(Number(r.today_rate))} sub={`${s.text} · ${r.used_in}`} tone={s.tone === 'amber' ? 'amber' : 'mut'} onOpen={preview.isPreviewActive ? undefined : () => setRate(r)} />; })}
      </ul>
      <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Currencies table"><table className="sales-table" aria-label="Currencies">
        <thead><tr><th scope="col" className="sales-flag-cell"><span className="sr-only">Needs you</span></th><th scope="col" className="sales-cell-left">Currency</th><th scope="col" className="sales-cell-left">Today · 1 = {base}</th><th scope="col" className="sales-cell-left">Last month end</th><th scope="col" className="sales-cell-left">Used in</th><th scope="col" className="sales-cell-left">Status</th><th scope="col" className="sales-cell-right"><span className="sr-only">Set rate</span></th></tr></thead>
        <tbody>
          <tr className="sales-record-row"><td className="sales-flag-cell" /><td className="sales-cell-left font-medium">{base} · {currencySymbol(base)}</td><td className="sales-cell-left text-muted-foreground">Home currency</td><td className="sales-cell-left text-muted-foreground">—</td><td className="sales-cell-left">Everything</td><td className="sales-cell-left"><Status text="Home" tone="mut" /></td><td className="kit-num" /></tr>
          {list.map(r => { const s = status(r); return <tr key={r.currency} className={`sales-record-row ${s.tone === 'amber' ? 'sales-attention-row' : ''}`}>
            <td className="sales-flag-cell">{s.tone === 'amber' && <Flag text={s.text} />}</td>
            <td className="sales-cell-left font-medium" title={r.first_used ? `First used ${shortDay(r.first_used)}` : undefined}>{r.currency} · {currencySymbol(r.currency)}</td>
            <td className="sales-cell-left td-num">{rate(r.today_rate, r.today_date)}</td>
            <td className="sales-cell-left td-num">{rate(r.month_end_rate, r.month_end_date)}</td>
            <td className="sales-cell-left" title={r.used_in}>{r.used_in}</td>
            <td className="sales-cell-left"><Status text={s.text} tone={s.tone} /></td>
            <td className="kit-num">{btn(r)}</td>
          </tr>; })}
        </tbody></table></div>
      {!q.isPending && !list.length && <Empty>Only {base} so far. A currency appears here the first time an account or document uses it.</Empty>}
      <div className="px-1"><BaseCurrencySetting /></div>
      <Note>Rates update each day from reference rates (ECB history for past dates). Month end uses the last rate on or before month end. A rate you set wins for its date.</Note>
    </Section>
    <Dialog open={!!edit} onOpenChange={o => !o && setEdit(null)}><DialogContent><DialogHeader><DialogTitle>{edit?.currency} rate</DialogTitle></DialogHeader>{edit && <div className="space-y-3"><label className="text-sm block">Date<Input type="date" value={edit.date} onChange={e => setEdit({ ...edit, date: e.target.value })} /></label><label className="text-sm block">1 {edit.currency} = ? {base}<Input inputMode="decimal" aria-label="Rate" value={edit.rate} onChange={e => setEdit({ ...edit, rate: e.target.value })} /></label><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save}>Save rate</Button></div></div>}</DialogContent></Dialog>
  </div>;
}
