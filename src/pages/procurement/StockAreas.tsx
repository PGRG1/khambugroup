import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { useVenueScope } from '@/hooks/useVenueScope';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import { useAuth } from '@/hooks/useAuth';
import { PageTop } from '@/components/kit/PageTop';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus } from 'lucide-react';
import { Toolbar } from '@/components/kit/Toolbar';
import { Status, PhoneRow, keyOpen } from '@/components/finance/accounting/AccountingKit';
import '@/components/kit/kit.css';

// Stock & menu › Stock areas: the places stock is counted (Kitchen, Bar…), for every venue in scope.
// Anyone with Do on Stock (or an admin/manager) adds, renames or archives an area; RLS checks the same.

type Area = { id: string; name: string; venue_id: string | null; venue: string | null; is_active: boolean; sort_order: number | null };
type Edit = { id?: string; name: string; venueId: string; active: boolean };

export default function StockAreas() {
  const { tenantId } = useActiveTenant();
  const scope = useVenueScope();
  const { isAdmin } = useAuth();
  const { isPreviewActive } = usePreviewMode();
  const { isPlatformAdmin: bani } = usePlatformAdmin();
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [{ data }, level] = await Promise.all([
      supabase.from('stock_locations').select('id,name,venue_id,venue,is_active,sort_order').eq('tenant_id', tenantId).order('sort_order'),
      bani || isAdmin ? Promise.resolve({ data: 3 }) : (supabase as any).rpc('access_level', { t: tenantId, area: 'stock' }),
    ]);
    setAreas((data ?? []) as Area[]);
    setCanEdit(Number(level.data ?? 0) >= 2);
    setLoading(false);
  }, [tenantId, bani, isAdmin]);
  useEffect(() => { void load(); }, [load]);

  const venueName = (a: Area) => scope.venues.find((v) => v.id === a.venue_id)?.name ?? a.venue ?? '—';
  const q = search.trim().toLowerCase();
  const shown = areas.filter((a) => scope.includesId(a.venue_id) || (!a.venue_id && scope.includesName(a.venue)))
    .filter((a) => !q || `${a.name} ${venueName(a)}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || venueName(a).localeCompare(venueName(b)) || a.name.localeCompare(b.name));
  const live = canEdit && !isPreviewActive;

  const save = async () => {
    if (!edit || !tenantId || !edit.name.trim() || !edit.venueId) return;
    const venue = scope.venues.find((v) => v.id === edit.venueId);
    setSaving(true);
    const { error } = edit.id
      ? await supabase.from('stock_locations').update({ name: edit.name.trim(), is_active: edit.active }).eq('id', edit.id).eq('tenant_id', tenantId)
      : await supabase.from('stock_locations').insert({ tenant_id: tenantId, venue_id: edit.venueId, venue: venue?.name ?? '', name: edit.name.trim(), sort_order: areas.length + 1 });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(edit.id ? 'Stock area saved' : `${edit.name.trim()} added`);
    setEdit(null); void load();
  };

  const add = () => setEdit({ name: '', venueId: scope.selectedVenues.length === 1 ? scope.selectedVenues[0].id : '', active: true });

  const open = (a: Area) => setEdit({ id: a.id, name: a.name, venueId: a.venue_id ?? '', active: a.is_active });
  // Same list layout as Team, Supplier accounts and Settings › People: count heading, search, table (phone rows).
  return <div className="w-full mx-auto space-y-4">
    <PageTop tabsAbove title="Stock areas" actions={live ? <Button size="sm" className="h-10 rounded-full" onClick={add}><Plus className="h-4 w-4" />Add area</Button> : undefined} />
    <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Stock areas">
      <h2 className="text-base font-display font-semibold px-1">{shown.length} {shown.length === 1 ? 'area' : 'areas'}</h2>
      <Toolbar search={search} onSearch={setSearch} placeholder="Search areas" />
      <ul className="min-[768px]:hidden kit">{shown.map((a) => <PhoneRow key={a.id} title={a.name} amount={a.is_active ? 'In use' : 'Archived'} sub={venueName(a)} tone="mut" onOpen={live ? () => open(a) : undefined} />)}</ul>
      <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Stock areas table"><table className="sales-table" aria-label="Stock areas">
        <thead><tr><th scope="col" className="sales-cell-left">Area</th><th scope="col" className="sales-cell-left">Venue</th><th scope="col" className="sales-cell-left">Status</th></tr></thead>
        <tbody>{shown.map((a) => <tr key={a.id} className="sales-record-row" {...(live ? keyOpen(() => open(a)) : {})}>
          <td className="sales-cell-left" title={a.name}>{a.name}</td>
          <td className="sales-cell-left" title={venueName(a)}>{venueName(a)}</td>
          <td className="sales-cell-left">{a.is_active ? <Status text="In use" tone="ok" /> : <Status text="Archived" tone="mut" />}</td>
        </tr>)}</tbody></table></div>
      {!shown.length && <p className="p-10 text-center text-sm text-muted-foreground">{loading ? 'Loading stock areas…' : search ? 'Nothing matches your search.' : 'No stock areas yet. Add the places you count stock, like Kitchen or Bar.'}</p>}
    </section>

    <Dialog open={!!edit} onOpenChange={(o) => !o && !saving && setEdit(null)}>
      <DialogContent className="!bg-card !backdrop-blur-none">
        <DialogHeader><DialogTitle>{edit?.id ? 'Stock area' : 'New stock area'}</DialogTitle></DialogHeader>
        {edit && <div className="space-y-3.5">
          <div><label htmlFor="area-name" className="mb-1.5 block text-[13px] text-muted-foreground">Name</label>
            <Input id="area-name" className="h-10 text-[14px]" value={edit.name} placeholder="Kitchen" onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
          <div><label className="mb-1.5 block text-[13px] text-muted-foreground">Venue</label>
            {edit.id ? <p className="text-[14px]">{scope.venues.find((v) => v.id === edit.venueId)?.name ?? '—'}</p>
              : <Select value={edit.venueId} onValueChange={(v) => setEdit({ ...edit, venueId: v })}><SelectTrigger className="h-10 text-[14px]"><SelectValue placeholder="Select venue" /></SelectTrigger>
                <SelectContent>{scope.venues.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select>}</div>
          <div className="flex items-center gap-2 pt-1">
            {edit.id && <Button variant="ghost" className="mr-auto" disabled={saving} onClick={() => setEdit({ ...edit, active: !edit.active })}>{edit.active ? 'Archive' : 'Use again'}</Button>}
            <Button variant="outline" className="ml-auto rounded-full" disabled={saving} onClick={() => setEdit(null)}>Cancel</Button>
            <Button className="rounded-full bg-[#1F6B5E] text-white hover:bg-[#1A5C51]" disabled={saving || !edit.name.trim() || !edit.venueId} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>}
      </DialogContent>
    </Dialog>
  </div>;
}
