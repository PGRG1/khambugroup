import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { useAssetPolicy } from '@/hooks/useAssetPolicy';
import { useBooksWindow } from '@/hooks/useBooksWindow';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import { useCanEditAccountRules } from '@/hooks/useCanEditAccountRules';
import { useVenues } from '@/hooks/useVenues';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@/utils/money';
import { dayBefore } from '@/utils/openingTrialBalance';
import { SettingsCard } from './SettingsForm';

const db = supabase as any;
const money = (n: number) => formatMoney(n, undefined, { decimals: 0 });
const shortDate = (iso: string) => iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
export type OpeningAssetRow = { id: string; name: string; category: string; venue: string | null; in_service_date: string; cost: number; opening_depreciation: number; useful_life_months: number; asset_account_id: string; accumulated_depr_account_id: string; started: boolean };

/** Months of life left at a date, straight line from the date in use. */
export function monthsLeft(inUse: string, lifeMonths: number, at: string) {
  const a = new Date(`${inUse}T00:00:00Z`), b = new Date(`${at}T00:00:00Z`);
  const used = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + 1;
  return Math.max(0, lifeMonths - Math.max(0, used));
}

export async function loadOpeningAssets(tenantId: string): Promise<OpeningAssetRow[]> {
  const { data } = await db.from('fixed_assets').select('id,name,category,venue,in_service_date,cost,opening_depreciation,useful_life_months,asset_account_id,accumulated_depr_account_id,amount_depreciated')
    .eq('tenant_id', tenantId).eq('is_opening', true).order('in_service_date');
  return (data ?? []).map((r: any) => ({ ...r, cost: Number(r.cost), opening_depreciation: Number(r.opening_depreciation), started: Number(r.amount_depreciated) > Number(r.opening_depreciation) + 0.005 }));
}

// Settings › Books setup: assets owned before the books start. They go into the asset register with depreciation
// to date and no journal (the opening trial balance holds the balances); depreciation carries on each month.
export function OpeningAssets({ onChanged }: { onChanged?: () => void }) {
  const { tenantId } = useActiveTenant(), policy = useAssetPolicy(tenantId), books = useBooksWindow(), preview = usePreviewMode();
  const canEdit = useCanEditAccountRules(), { venues } = useVenues();
  const [rows, setRows] = useState<OpeningAssetRow[]>([]), [adding, setAdding] = useState(false), [busy, setBusy] = useState(false);
  const blank = { name: '', class_key: 'kitchen_equipment', venue: '', date: '', cost: '', depreciated: '', years: '' };
  const [form, setForm] = useState(blank);
  const load = useCallback(async () => { if (tenantId) setRows(await loadOpeningAssets(tenantId)); }, [tenantId]);
  useEffect(() => { void load(); }, [load]);
  const asAt = books.start ? dayBefore(books.start) : '';
  const cls = policy.classes.find(c => c.class_key === form.class_key);
  const years = form.years || String(cls?.useful_years ?? '');
  const cost = Number(form.cost), dep = Number(form.depreciated || 0), life = Math.round(Number(years) * 12);
  const valid = form.name.trim() && form.date && cost > 0 && dep >= 0 && dep <= cost && life > 0;
  const totals = useMemo(() => rows.reduce((t, r) => ({ cost: t.cost + r.cost, dep: t.dep + r.opening_depreciation }), { cost: 0, dep: 0 }), [rows]);
  const locked = preview.isPreviewActive || !canEdit;
  const className = (k: string) => policy.classes.find(c => c.class_key === k)?.name ?? k;

  async function add() {
    if (!tenantId || !valid) return;
    setBusy(true);
    const { error } = await db.rpc('add_opening_asset', { t: tenantId, p: { name: form.name.trim(), class_key: form.class_key, venue: form.venue || null, date: form.date, cost, depreciated: dep, life_months: life } });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Asset added'); setForm(blank); setAdding(false); await load(); onChanged?.();
  }
  async function remove(r: OpeningAssetRow) {
    if (!tenantId) return;
    const { error } = await db.rpc('remove_opening_asset', { t: tenantId, p_asset: r.id });
    if (error) { toast.error(error.message); return; }
    toast.success('Asset removed'); await load(); onChanged?.();
  }

  return <SettingsCard title={rows.length ? `Opening assets · ${rows.length}` : 'Opening assets'} action={!locked && !adding ? <button type="button" className="settings-edit" onClick={() => setAdding(true)}>+ Add asset</button> : undefined}>
    {rows.length > 0 && <div className="kit sales-table-scroll" tabIndex={0} role="region" aria-label="Opening assets"><table className="sales-table" aria-label="Opening assets">
      <thead><tr>{['Asset', 'Class', 'In use from', 'Cost', 'Depreciated', 'Book value', 'Months left', ''].map((h, i) => <th key={i} scope="col" className={i > 2 && i < 7 ? 'sales-cell-right' : 'sales-cell-left'}>{h}</th>)}</tr></thead>
      <tbody>{rows.map(r => <tr key={r.id} className="sales-record-row">
        <td className="sales-cell-left" title={r.name}><span className="block max-w-[var(--bani-name-max,220px)] truncate">{r.name}</span>{r.venue && <span className="block text-[12px] text-muted-foreground">{r.venue}</span>}</td>
        <td className="sales-cell-left whitespace-nowrap">{className(r.category)}</td>
        <td className="sales-cell-left whitespace-nowrap">{shortDate(r.in_service_date)}</td>
        <td className="sales-cell-right whitespace-nowrap tabular-nums">{money(r.cost)}</td>
        <td className="sales-cell-right whitespace-nowrap tabular-nums">{money(r.opening_depreciation)}</td>
        <td className="sales-cell-right whitespace-nowrap tabular-nums">{money(r.cost - r.opening_depreciation)}</td>
        <td className="sales-cell-right whitespace-nowrap tabular-nums">{asAt ? monthsLeft(r.in_service_date, r.useful_life_months, asAt) : '—'}</td>
        <td className="sales-cell-right whitespace-nowrap">{!locked && !r.started && <button type="button" className="text-[13px] text-[#B45309]" onClick={() => void remove(r)}>Remove</button>}</td>
      </tr>)}
        <tr className="font-semibold"><td className="sales-cell-left">Total</td><td /><td /><td className="sales-cell-right tabular-nums">{money(totals.cost)}</td><td className="sales-cell-right tabular-nums">{money(totals.dep)}</td><td className="sales-cell-right tabular-nums">{money(totals.cost - totals.dep)}</td><td /><td /></tr>
      </tbody></table></div>}
    {!rows.length && !adding && <p className="text-[13px] text-muted-foreground">None yet</p>}
    {adding && <div className="mt-2 grid gap-3 sm:grid-cols-2">
      <label className="text-[12px] text-muted-foreground">Asset<Input className="mt-1 h-9" value={form.name} placeholder="Combi oven" onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label className="text-[12px] text-muted-foreground">Class<select aria-label="Asset class" className="mt-1 block h-9 w-full rounded-md border bg-white px-2 text-[13px] text-foreground" value={form.class_key} onChange={e => setForm({ ...form, class_key: e.target.value, years: '' })}>{policy.classes.map(c => <option key={c.class_key} value={c.class_key}>{c.name}</option>)}</select></label>
      <label className="text-[12px] text-muted-foreground">Venue<select aria-label="Asset venue" className="mt-1 block h-9 w-full rounded-md border bg-white px-2 text-[13px] text-foreground" value={form.venue} onChange={e => setForm({ ...form, venue: e.target.value })}><option value="">Shared</option>{venues.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}</select></label>
      <label className="text-[12px] text-muted-foreground">In use from<Input type="date" className="mt-1 h-9" max={asAt || undefined} value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
      <label className="text-[12px] text-muted-foreground">Cost<Input inputMode="decimal" className="mt-1 h-9 text-right tabular-nums" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} /></label>
      <label className="text-[12px] text-muted-foreground">Depreciated up to {asAt ? shortDate(asAt) : 'the books start'}<Input inputMode="decimal" className="mt-1 h-9 text-right tabular-nums" value={form.depreciated} onChange={e => setForm({ ...form, depreciated: e.target.value })} /></label>
      <label className="text-[12px] text-muted-foreground">Useful life (years)<Input inputMode="decimal" className="mt-1 h-9 text-right tabular-nums" value={years} onChange={e => setForm({ ...form, years: e.target.value })} /></label>
      <p className="self-end pb-2 text-[13px]">{valid ? `Book value ${money(cost - dep)} · ${money(Math.round((cost / life) * 100) / 100)} a month from ${books.start ? shortDate(books.start) : 'the books start'}` : ''}</p>
      <div className="settings-save sm:col-span-2">
        <Button type="button" variant="outline" className="rounded-full" disabled={busy} onClick={() => { setAdding(false); setForm(blank); }}>Cancel</Button>
        <Button type="button" className="rounded-full" disabled={busy || !valid} onClick={() => void add()}>{busy ? 'Adding…' : 'Add asset'}</Button>
      </div>
    </div>}
  </SettingsCard>;
}
