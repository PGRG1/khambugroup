// Settings › Master data › Units: the units products use, in three cards — Recipe units (smallest unit in recipes),
// Stock units (how stock is counted) and Buying units (how suppliers sell). One Edit per card renames or removes;
// + Add adds a unit to one list. Removing only hides the unit from pickers (is_active false); products keep theirs.
import { useState } from 'react';
import { useUomOptions, type UomType, type UomOption } from '@/hooks/useUomOptions';
import { SettingsCard, PageAction } from '@/components/settings/SettingsForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const KINDS: { type: UomType; title: string; hint: string }[] = [
  { type: 'base', title: 'Recipe units', hint: 'Smallest unit used in recipes' },
  { type: 'stock', title: 'Stock units', hint: 'How you count stock' },
  { type: 'purchase', title: 'Buying units', hint: 'How you buy from suppliers' },
];

/** The same page edits Bani's master list on the control plane (store = master store, master = true). */
export type UnitsStore = { items: UomOption[]; loading: boolean; createItem: (i: { label: string; code: string; uom_type: UomType; sort_order: number }) => Promise<unknown>; updateItem: (id: string, patch: Partial<UomOption>) => Promise<unknown> };

export function UnitsPage({ store, master = false }: { store?: UnitsStore; master?: boolean }) {
  const own = useUomOptions();
  const { items, loading, createItem, updateItem } = store ?? own;
  const [editing, setEditing] = useState<UomType | null>(null);
  const [draft, setDraft] = useState<Record<string, { label: string; removed: boolean }>>({});
  const [adding, setAdding] = useState<{ label: string; code: string; type: UomType } | null>(null);
  const [saving, setSaving] = useState(false);

  const active = (t: UomType) => items.filter(i => i.uom_type === t && i.is_active);
  const startEdit = (t: UomType) => { setEditing(t); setDraft(Object.fromEntries(active(t).map(i => [i.id, { label: i.label, removed: false }]))); };
  const save = async () => {
    setSaving(true);
    for (const i of active(editing!)) {
      const d = draft[i.id]; if (!d) continue;
      if (d.removed) await updateItem(i.id, { is_active: false });
      else if (d.label.trim() && d.label.trim() !== i.label) await updateItem(i.id, { label: d.label.trim() });
    }
    setSaving(false); setEditing(null);
  };
  const add = async () => {
    if (!adding) return;
    setSaving(true);
    const ok = await createItem({ label: adding.label, code: adding.code || adding.label, uom_type: adding.type, sort_order: active(adding.type).length });
    setSaving(false);
    if (ok) setAdding(null);
  };

  if (loading) return <p role="status" className="text-[13px] text-muted-foreground">Loading units…</p>;
  return <>
    <PageAction><Button size="sm" className="h-10 rounded-full" onClick={() => setAdding({ label: '', code: '', type: 'stock' })}><Plus className="h-4 w-4" />Add</Button></PageAction>
    {KINDS.map(k => {
      const list = active(k.type);
      const isEditing = editing === k.type;
      return <SettingsCard key={k.type} title={`${k.title} · ${list.length}`} onEdit={() => startEdit(k.type)} editing={isEditing}>
        <p className="-mt-1 mb-3 text-[12.5px] text-muted-foreground">{k.hint}</p>
        {list.length === 0 && <p className="text-[13px] text-muted-foreground">No units yet.</p>}
        <div className="grid gap-x-7 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(u => {
            const d = draft[u.id];
            if (isEditing && d?.removed) return null;
            return <div key={u.id} className="flex h-10 items-center justify-between gap-3 border-b border-border/60 text-[14px]">
              {isEditing
                ? <>{!master && u.master_id
                      ? <span className="flex-1 truncate" title="From Bani's list: Bani keeps its name">{u.label}</span>
                      : <Input aria-label={`Name of ${u.code}`} className="h-8 text-[13px]" value={d?.label ?? u.label} onChange={e => setDraft({ ...draft, [u.id]: { label: e.target.value, removed: false } })} />}
                    <span className="shrink-0 text-[12.5px] text-muted-foreground">{u.code}</span>
                    <button type="button" aria-label={`Remove ${u.label}`} title="Remove" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => setDraft({ ...draft, [u.id]: { label: d?.label ?? u.label, removed: true } })}><X className="h-4 w-4" /></button></>
                : <><span className="truncate">{u.label}</span><span className="shrink-0 text-[12.5px] text-muted-foreground">{u.code}</span></>}
            </div>;
          })}
        </div>
        {isEditing && <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-[12px] text-muted-foreground">{master ? 'Changes reach every client. Removing hides the unit for everyone; products that use it keep it.' : 'Removing a unit hides it from the lists. Products that use it keep it.'}</span>
          <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button disabled={saving} onClick={save}>Save</Button>
        </div>}
      </SettingsCard>;
    })}
    <Dialog open={!!adding} onOpenChange={o => { if (!o) setAdding(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a unit</DialogTitle></DialogHeader>
        {adding && <div className="space-y-3">
          <div><Label className="text-xs">Name</Label><Input autoFocus value={adding.label} placeholder="e.g. Punnet" onChange={e => setAdding({ ...adding, label: e.target.value })} /></div>
          <div><Label className="text-xs">Short code</Label><Input value={adding.code} placeholder={adding.label || 'e.g. Punnet'} onChange={e => setAdding({ ...adding, code: e.target.value })} /></div>
          <div><Label className="text-xs">Used for</Label>
            <Select value={adding.type} onValueChange={v => setAdding({ ...adding, type: v as UomType })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{KINDS.map(k => <SelectItem key={k.type} value={k.type}>{k.title} — {k.hint.toLowerCase()}</SelectItem>)}</SelectContent></Select></div>
        </div>}
        <DialogFooter><Button variant="outline" onClick={() => setAdding(null)}>Cancel</Button><Button disabled={saving || !adding?.label.trim()} onClick={add}>Add</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
