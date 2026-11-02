import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { useBaseCurrency } from '@/hooks/useFxRate';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import { formatDate } from '@/utils/format';
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
  const cell = (rate: number | null, date: string | null, nearest: boolean | null) => rate == null ? <span className="text-muted-foreground">No rate yet</span> : <><span className="td-num">{formatRate(Number(rate))}</span><p className="text-xs text-muted-foreground">{date ? formatDate(date) : ''}{nearest ? ' · nearest available' : ''}</p></>;
  async function save() {
    if (!edit || !tenantId) return; const rate = Number(edit.rate);
    if (!(rate > 0)) { toast.error('Enter a rate above 0'); return; }
    const { error } = await supabase.from('bank_fx_rates').upsert({ tenant_id: tenantId, rate_date: edit.date, from_currency: edit.currency, to_currency: base, rate, source: 'manual', overridden_at: new Date().toISOString() }, { onConflict: 'tenant_id,rate_date,from_currency,to_currency' });
    if (error) { toast.error(error.message); return; }
    toast.success('Rate saved'); setEdit(null); await cache.invalidateQueries({ queryKey: ['fx-in-use'] }); await cache.invalidateQueries({ queryKey: ['fx-rate'] });
  }
  return <div className="space-y-4">
    <section className="kit card-glass rounded-xl"><div className="px-4 py-4 sm:px-5 grid gap-3 sm:grid-cols-2 text-sm">
      <div><p className="kit-group-h">Base currency</p><p className="font-medium">{base} · {currencySymbol(base)}</p><p className="text-xs text-muted-foreground">Change it in Settings › Accounting until the first entry is posted.</p></div>
      <div><p className="kit-group-h">Rate source</p><p>Daily reference rates (open.er-api.com; ECB history for past dates)</p><p className="text-xs text-muted-foreground">Month-end uses the last rate on or before month end. Your own rates win for their date.</p></div>
    </div></section>
    <section className="kit card-glass rounded-xl overflow-hidden">
      <div className="max-w-full overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="text-xs text-muted-foreground text-left border-b border-border"><tr><th className="p-4">Currency</th><th>Used in</th><th>Today · 1 = {base}</th><th>Last month end</th><th className="p-4 text-right"></th></tr></thead>
        <tbody>{(q.data ?? []).map(r => <tr key={r.currency} className="border-b border-border/50"><td className="p-4"><p className="font-medium">{r.currency} · {currencySymbol(r.currency)}</p><p className="text-xs text-muted-foreground">{r.first_used ? `First used ${formatDate(r.first_used)}` : ''}</p></td><td>{r.used_in}</td><td>{cell(r.today_rate, r.today_date, r.today_nearest)}</td><td>{cell(r.month_end_rate, r.month_end_date, r.month_end_nearest)}</td><td className="p-4 text-right"><Button variant="outline" size="sm" disabled={preview.isPreviewActive} onClick={() => setEdit({ currency: r.currency, date: new Date().toISOString().slice(0, 10), rate: r.today_rate ? String(r.today_rate) : '' })}>Set rate</Button></td></tr>)}</tbody></table></div>
      {q.isPending ? <p className="p-6 text-center text-muted-foreground">Checking…</p> : !q.data?.length && <p className="p-6 text-center text-muted-foreground">Only {base} so far. A currency appears here the first time an account or document uses it.</p>}
    </section>
    <Dialog open={!!edit} onOpenChange={o => !o && setEdit(null)}><DialogContent><DialogHeader><DialogTitle>{edit?.currency} rate</DialogTitle></DialogHeader>{edit && <div className="space-y-3"><label className="text-sm block">Date<Input type="date" value={edit.date} onChange={e => setEdit({ ...edit, date: e.target.value })} /></label><label className="text-sm block">1 {edit.currency} = ? {base}<Input inputMode="decimal" aria-label="Rate" value={edit.rate} onChange={e => setEdit({ ...edit, rate: e.target.value })} /></label><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save}>Save rate</Button></div></div>}</DialogContent></Dialog>
  </div>;
}
