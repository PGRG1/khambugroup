import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { assetLives } from '@/utils/financeSchedules';
import { tenantToday } from '@/utils/salesRecordChecks';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function ScheduleAssetIntake({ tenantId, venues, accounts, onCreated, disabled }: {
  tenantId: string | null; venues: { id: string; name: string }[];
  accounts: { id: string; code: string; name: string; account_type: string }[];
  onCreated: () => Promise<unknown>; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', venue: '', category: 'kitchen_equipment', cost: '', date: tenantToday(), life_months: 60, opening_depreciation: '0', opening_account_id: '' });
  const cost = Number(form.cost), accumulated = Number(form.opening_depreciation);
  return <><Button disabled={disabled} onClick={() => setOpen(true)}>Add asset</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Add asset · opening draft</DialogTitle></DialogHeader>
    <Label htmlFor="asset-name">Name</Label><Input id="asset-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
    <Label>Venue / Central</Label><Select value={form.venue || 'central'} onValueChange={v => setForm({ ...form, venue: v === 'central' ? '' : v })}><SelectTrigger aria-label="Asset venue"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="central">Central</SelectItem>{venues.map(v => <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>)}</SelectContent></Select>
    <Label>Category</Label><Select value={form.category} onValueChange={v => setForm({ ...form, category: v, life_months: assetLives[v as keyof typeof assetLives] })}><SelectTrigger aria-label="Asset category"><SelectValue /></SelectTrigger><SelectContent>{[['other', 'Fit-out'], ['kitchen_equipment', 'Kitchen equipment'], ['furniture_fixtures', 'Furniture'], ['it_equipment', 'IT'], ['leasehold_improvements', 'Leasehold improvements']].map(([v, label]) => <SelectItem value={v} key={v}>{label}</SelectItem>)}</SelectContent></Select>
    <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="asset-cost">Cost</Label><Input id="asset-cost" type="number" min="0.01" step="0.01" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} /></div><div><Label htmlFor="asset-life">Life (months)</Label><Input id="asset-life" type="number" min="1" step="1" value={form.life_months} onChange={e => setForm({ ...form, life_months: Number(e.target.value) })} /></div></div>
    <Label htmlFor="asset-date">Date in use</Label><Input id="asset-date" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
    <Label htmlFor="asset-opening">Opening accumulated depreciation</Label><Input id="asset-opening" type="number" min="0" max={cost} step="0.01" value={form.opening_depreciation} onChange={e => setForm({ ...form, opening_depreciation: e.target.value })} />
    <Label>Opening equity account</Label><Select value={form.opening_account_id || 'none'} onValueChange={v => setForm({ ...form, opening_account_id: v === 'none' ? '' : v })}><SelectTrigger aria-label="Opening equity account"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Choose account</SelectItem>{accounts.filter(a => a.account_type === 'equity').map(a => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent></Select>
    <Button disabled={busy || !tenantId || !form.name.trim() || !form.date || !form.opening_account_id || !Number.isFinite(cost) || cost <= 0 || !Number.isFinite(accumulated) || accumulated < 0 || accumulated > cost || !Number.isInteger(form.life_months) || form.life_months <= 0} onClick={async () => {
      if (!tenantId) return; setBusy(true);
      try { const { error } = await supabase.rpc('finance_opening_asset', { t: tenantId, p: { ...form, name: form.name.trim(), cost, opening_depreciation: accumulated } }); if (error) throw error; await onCreated(); setOpen(false); toast.success('Opening asset draft created'); }
      catch (e) { toast.error(e instanceof Error ? e.message : 'Asset draft could not be created'); } finally { setBusy(false); }
    }}>Create opening draft</Button>
  </DialogContent></Dialog></>;
}