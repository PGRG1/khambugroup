// Settings › Accounting › Card processors: one card per processor with its merchants (number, venue, bank account)
// and its fees (card or wallet · Hong Kong cards · foreign cards), each edited in place. Rates that apply to one
// merchant only are their own row ("Mastercard · Assembly"). Table rules live in src/utils/feeTable.ts.
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { usePaymentSettlements, type ProcessorMerchant } from '@/hooks/usePaymentSettlements';
import { useBankModule } from '@/hooks/useBankModule';
import { useVenues } from '@/hooks/useVenues';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CARDS, feeRows, feeWrites, pct, type FeeRow } from '@/utils/feeTable';
import { hongKongDate } from '@/utils/purchasingOverview';

const SHARED = '__shared__';
type MerchantDraft = { id?: string; processor_id: string; merchant_number: string; venue: string; shared: string[]; bank: string; is_active: boolean };

export function ProcessorCards() {
  const { tenantId } = useActiveTenant();
  const { loading, processors, merchants, feeRates, reload } = usePaymentSettlements();
  const { accounts } = useBankModule();
  const { venues } = useVenues();
  const today = hongKongDate();
  const [merchant, setMerchant] = useState<MerchantDraft | null>(null);
  const [feeEdit, setFeeEdit] = useState<{ processorId: string; rows: FeeRow[]; values: Record<string, { hk: string; foreign: string }> } | null>(null);
  const [newProc, setNewProc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const bankName = (id: string | null) => { const a = accounts.find(x => x.id === id); return a ? `${a.account_name}${a.account_number_last4 ? ` ··${a.account_number_last4}` : ''}` : ''; };
  const merchantName = useMemo(() => { const m = new Map(merchants.map(x => [x.merchant_number, x.venue || x.shared_venues.join(' + ') || x.display_name])); return (n: string) => m.get(n) ?? null; }, [merchants]);
  const venueNames = venues.filter(v => v.is_active).map(v => v.name);

  if (loading) return <p role="status" className="text-[13px] text-muted-foreground">Loading…</p>;

  const saveMerchant = async () => {
    if (!merchant || !tenantId) return;
    const shared = merchant.venue === SHARED;
    const name = shared ? merchant.shared.join(' + ') : merchant.venue;
    if (!merchant.merchant_number.trim() || !name) return toast.error('Fill in the merchant number and which venue it is for');
    if (shared && merchant.shared.length < 2) return toast.error('Pick at least two venues for a shared merchant');
    const payload = { processor_id: merchant.processor_id, merchant_number: merchant.merchant_number.trim(), display_name: name, venue: shared ? null : merchant.venue, shared_venues: shared ? merchant.shared : [], default_bank_account_id: merchant.bank || null, is_active: merchant.is_active };
    setSaving(true);
    const { error } = merchant.id
      ? await supabase.from('payment_processor_merchants' as any).update(payload).eq('id', merchant.id).eq('tenant_id', tenantId)
      : await supabase.from('payment_processor_merchants' as any).insert({ ...payload, tenant_id: tenantId, sort_order: merchants.filter(m => m.processor_id === merchant.processor_id).length, store_address: '', notes: '' });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Merchant saved'); setMerchant(null); reload();
  };

  const saveFees = async () => {
    if (!feeEdit || !tenantId) return;
    const { writes, bad } = feeWrites(feeEdit.processorId, feeEdit.rows, feeEdit.values);
    if (bad.length) return toast.error(`Check the rate for ${bad.join(', ')} (a number like 1.5)`);
    setSaving(true);
    for (const w of writes) {
      const q = supabase.from('payment_processor_fee_rates' as any);
      const { error } = w.op === 'update' ? await q.update({ rate: w.rate }).eq('id', w.id).eq('tenant_id', tenantId)
        : w.op === 'delete' ? await q.delete().eq('id', w.id).eq('tenant_id', tenantId)
        : await q.insert({ ...w.row, tenant_id: tenantId, rounding_dp: 2, rounding_method: 'normal' });
      if (error) { setSaving(false); toast.error(error.message); reload(); return; }
    }
    setSaving(false); toast.success(writes.length ? 'Fees saved' : 'No changes'); setFeeEdit(null); reload();
  };

  const addProcessor = async () => {
    if (!tenantId || !newProc?.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('payment_processors' as any).insert({ name: newProc.trim(), type: 'card', notes: '', is_active: true, tenant_id: tenantId, sort_order: processors.length });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${newProc.trim()} added`); setNewProc(null); reload();
  };

  const th = 'h-9 whitespace-nowrap border-b border-border pr-3 text-left text-[12px] font-normal text-muted-foreground';
  const td = 'h-11 border-b border-border/50 pr-3 text-[13px]';
  const link = 'text-[13px] text-[#1F6B5E] hover:underline';

  return <div className="space-y-3">
    {processors.map(p => {
      const ms = merchants.filter(m => m.processor_id === p.id);
      const rows = feeRows(feeRates.filter(r => r.processor_id === p.id) as any, merchantName, today);
      const editing = feeEdit?.processorId === p.id ? feeEdit : null;
      const shownRows = editing ? editing.rows : rows;
      const openMerchant = (m?: ProcessorMerchant) => setMerchant(m
        ? { id: m.id, processor_id: p.id, merchant_number: m.merchant_number, venue: m.shared_venues.length ? SHARED : m.venue || '', shared: m.shared_venues, bank: m.default_bank_account_id || '', is_active: m.is_active }
        : { processor_id: p.id, merchant_number: '', venue: '', shared: [], bank: '', is_active: true });
      const startFees = () => setFeeEdit({ processorId: p.id, rows, values: Object.fromEntries(rows.map(r => [r.key, { hk: r.hk ? (r.hk.rate * 100).toFixed(2) : '', foreign: r.foreign ? (r.foreign.rate * 100).toFixed(2) : '' }])) });
      const addCard = (key: string) => editing && setFeeEdit({ ...editing, rows: [...editing.rows, { key: `${key}|`, card: key, label: CARDS.find(c => c.key === key)?.label ?? key, merchant: null, merchantLabel: null, wallet: !!CARDS.find(c => c.key === key)?.wallet, hk: null, foreign: null }], values: { ...editing.values, [`${key}|`]: { hk: '', foreign: '' } } });
      const missingCards = CARDS.filter(c => !shownRows.some(r => r.card === c.key && !r.merchant));
      return <section key={p.id} className="settings-card has-title" aria-label={p.name}>
        <h3 className="settings-card-title">{p.is_active ? p.name : `${p.name} · archived`}</h3>

        <div className="mt-3 flex items-baseline justify-between"><h4 className="text-[13px] font-semibold">Merchants</h4><button type="button" className={link} onClick={() => openMerchant()}>+ Add merchant</button></div>
        {ms.length === 0
          ? <p className="mt-1 text-[13px] text-[hsl(var(--warning))]">No merchants yet. Add the merchant number from a {p.name} payout so Bani can match its payouts to a venue.</p>
          : <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className={th}>Merchant no.</th><th className={th}>For</th><th className={th}>Pays into</th><th className={th} /></tr></thead>
            <tbody>{ms.map(m => <tr key={m.id} className={m.is_active ? '' : 'text-muted-foreground'}>
              <td className={`${td} whitespace-nowrap tabular-nums`}>{m.merchant_number}</td>
              <td className={`${td} whitespace-nowrap`}>{m.venue || m.shared_venues.join(' + ') || m.display_name}{m.shared_venues.length > 0 && <span className="ml-1.5 rounded-md bg-muted px-1.5 py-px text-[11px] text-muted-foreground">shared</span>}{!m.is_active && ' · archived'}</td>
              <td className={`${td} whitespace-nowrap`}>{bankName(m.default_bank_account_id) || <span className="text-[hsl(var(--warning))]">Not set</span>}</td>
              <td className={`${td} text-right`}><button type="button" className={link} onClick={() => openMerchant(m)}>Edit</button></td>
            </tr>)}</tbody></table></div>}

        <div className="mt-5 flex items-baseline justify-between"><h4 className="text-[13px] font-semibold">Fees</h4>{!editing && <button type="button" className={link} onClick={startFees}>Edit fees</button>}</div>
        {shownRows.length === 0 && !editing
          ? <p className="mt-1 text-[13px] text-[hsl(var(--warning))]">No fees yet.</p>
          : <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className={th}>Card or wallet</th><th className={`${th} text-right`}>Hong Kong cards</th><th className={`${th} text-right`}>Foreign cards</th></tr></thead>
            <tbody>{shownRows.map(r => {
              const v = editing?.values[r.key];
              const set = (side: 'hk' | 'foreign', text: string) => editing && setFeeEdit({ ...editing, values: { ...editing.values, [r.key]: { ...editing.values[r.key], [side]: text } } });
              const box = (side: 'hk' | 'foreign') => <Input aria-label={`${r.label} ${side === 'hk' ? 'Hong Kong' : 'foreign'} rate`} className="ml-auto h-8 w-24 text-right text-[13px]" inputMode="decimal" placeholder="—" value={v?.[side] ?? ''} onChange={e => set(side, e.target.value)} />;
              return <tr key={r.key}>
                <td className={`${td} whitespace-nowrap`}>{r.label}{r.merchantLabel && <span className="text-muted-foreground"> · {r.merchantLabel}</span>}</td>
                {r.wallet
                  ? <td className={`${td} text-right tabular-nums`} colSpan={2}>{v ? <span className="inline-flex items-center gap-2">{box('hk')}<span className="text-muted-foreground">any card</span></span> : r.hk ? `${pct(r.hk.rate)} (any card)` : '—'}</td>
                  : <><td className={`${td} text-right tabular-nums`}>{v ? box('hk') : r.hk ? pct(r.hk.rate) : '—'}</td><td className={`${td} text-right tabular-nums`}>{v ? box('foreign') : r.foreign ? pct(r.foreign.rate) : '—'}</td></>}
              </tr>;
            })}</tbody></table></div>}
        {editing && <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {missingCards.length > 0 ? <Select value="" onValueChange={addCard}><SelectTrigger className="h-9 w-44 text-[13px]" aria-label="Add a card"><SelectValue placeholder="+ Add a card" /></SelectTrigger><SelectContent>{missingCards.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent></Select> : <span />}
          <span className="flex items-center gap-2"><span className="text-[12px] text-muted-foreground">Leave a box empty to remove that rate.</span><Button variant="outline" onClick={() => setFeeEdit(null)}>Cancel</Button><Button disabled={saving} onClick={saveFees}>Save</Button></span>
        </div>}
      </section>;
    })}

    {newProc == null
      ? <button type="button" className={`${link} px-1`} onClick={() => setNewProc('')}>+ Add processor</button>
      : <div className="flex flex-wrap items-center gap-2 px-1"><Input autoFocus aria-label="Processor name" placeholder="e.g. KPay" className="h-9 w-56" value={newProc} onChange={e => setNewProc(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void addProcessor(); }} /><Button variant="outline" onClick={() => setNewProc(null)}>Cancel</Button><Button disabled={saving || !newProc.trim()} onClick={addProcessor}>Add</Button></div>}

    <Dialog open={!!merchant} onOpenChange={o => { if (!o) setMerchant(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{merchant?.id ? 'Edit merchant' : 'Add merchant'}</DialogTitle></DialogHeader>
        {merchant && <div className="space-y-3">
          <div><Label className="text-xs">Merchant number</Label><Input value={merchant.merchant_number} inputMode="numeric" onChange={e => setMerchant({ ...merchant, merchant_number: e.target.value })} placeholder="As printed on the payout" /></div>
          <div><Label className="text-xs">For</Label>
            <Select value={merchant.venue} onValueChange={v => setMerchant({ ...merchant, venue: v })}><SelectTrigger><SelectValue placeholder="Choose a venue" /></SelectTrigger>
              <SelectContent>{venueNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}<SelectItem value={SHARED}>Shared by several venues</SelectItem></SelectContent></Select>
            {merchant.venue === SHARED && <div className="mt-2 flex flex-wrap gap-3">{venueNames.map(n => <label key={n} className="flex items-center gap-1.5 text-[13px]"><Checkbox checked={merchant.shared.includes(n)} onCheckedChange={c => setMerchant({ ...merchant, shared: c ? [...merchant.shared, n] : merchant.shared.filter(x => x !== n) })} />{n}</label>)}</div>}
          </div>
          <div><Label className="text-xs">Pays into</Label>
            <Select value={merchant.bank} onValueChange={v => setMerchant({ ...merchant, bank: v })}><SelectTrigger><SelectValue placeholder="Choose a bank account" /></SelectTrigger>
              <SelectContent>{accounts.filter(a => a.is_active !== false).map(a => <SelectItem key={a.id} value={a.id}>{bankName(a.id)}</SelectItem>)}</SelectContent></Select></div>
          {merchant.id && <label className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-[13px]">In use<Switch checked={merchant.is_active} onCheckedChange={c => setMerchant({ ...merchant, is_active: c })} /></label>}
        </div>}
        <DialogFooter><Button variant="outline" onClick={() => setMerchant(null)}>Cancel</Button><Button disabled={saving} onClick={saveMerchant}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
