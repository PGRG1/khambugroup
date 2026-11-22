import { useEffect, useRef, useState } from 'react';
import { useOrganizations, type Organization } from '@/hooks/useOrganizations';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, Row, SaveBar, SettingsCard } from './SettingsForm';

type Key = 'name' | 'legal_name' | 'registration_number' | 'incorporation_date' | 'auditor' | 'registered_address';
type Draft = Partial<Record<Key, string | null>>;
const CARDS: { title: string; fields: { key: Key; label: string; type?: string; placeholder?: string; missing?: string }[] }[] = [
  { title: 'Company', fields: [{ key: 'name', label: 'Company name', missing: 'Add the company name' }, { key: 'legal_name', label: 'Legal name', placeholder: 'As registered' }] },
  { title: 'Registration', fields: [{ key: 'registration_number', label: 'BR number', placeholder: 'e.g. 12345678', missing: 'Add your BR number' }, { key: 'incorporation_date', label: 'Incorporated', type: 'date' }, { key: 'auditor', label: 'Auditor', placeholder: 'Optional' }] },
  { title: 'Registered address', fields: [{ key: 'registered_address', label: 'Address', placeholder: 'Street, district', missing: 'Add the registered address' }] },
];
const dayText = (iso?: string | null) => iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';

// Company details, read first: cards show what is saved; Edit turns one card into fields.
// Company setup is done by the Bani team: only Bani platform admins can edit or add (the database enforces it too).
export function CompanyDetails({ fallbackName }: { fallbackName: string }) {
  const org = useOrganizations();
  const { isPlatformAdmin: canEdit } = usePlatformAdmin();
  const [id, setId] = useState<string>('new');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const picked = useRef(false), createdName = useRef<string | null>(null);
  useEffect(() => {
    const made = createdName.current && org.organizations.find(o => o.name === createdName.current);
    if (made) { createdName.current = null; setId(made.id); setEditing(null); return; }
    if (!picked.current && org.organizations.length) { picked.current = true; setId(org.organizations[0].id); setEditing(null); }
  }, [org.organizations]);
  const isNew = id === 'new';
  const saved: Draft = (org.organizations.find(o => o.id === id) as Draft | undefined) ?? (isNew && org.organizations.length ? {} : { name: fallbackName });
  useEffect(() => { if (canEdit && !org.loading && isNew && !org.organizations.length) { setDraft({ ...saved }); setEditing('Company'); } }, [id, org.loading, org.organizations.length, canEdit]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (title: string) => { setDraft({ ...saved }); setEditing(title); };
  const save = async (keys: Key[]) => {
    const body = Object.fromEntries(keys.map(k => [k, (draft[k] ?? '').toString().trim() || null])) as Partial<Organization>;
    setSaving(true);
    if (isNew) {
      const name = (draft.name ?? '').toString().trim();
      if (!name) { setSaving(false); return; }
      createdName.current = name; await org.create({ ...body, name });
    } else {
      if (keys.includes('name') && !body.name) { setSaving(false); return; }
      if (await org.update(id, body)) setEditing(null);
    }
    setSaving(false);
  };
  if (org.loading) return <p role="status" className="text-[13px] text-muted-foreground">Loading…</p>;
  return <>
    {(org.organizations.length > 1 || isNew && org.organizations.length > 0) && <SettingsCard title="Which company">
      <Select value={id} onValueChange={v => { setId(v); if (v === 'new') { setDraft({}); setEditing('Company'); } else setEditing(null); }}><SelectTrigger aria-label="Company" className="max-w-[420px] rounded-full bg-white"><SelectValue /></SelectTrigger>
        <SelectContent>{org.organizations.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}{canEdit && <SelectItem value="new">Add another company</SelectItem>}</SelectContent></Select>
    </SettingsCard>}
    {CARDS.map(c => {
      const on = editing === c.title;
      return <SettingsCard key={c.title} title={c.title} editing={on} onEdit={on || isNew || !canEdit ? undefined : () => open(c.title)}>
        {on ? <>
          {c.fields.map(f => <Field key={f.key} label={f.label} htmlFor={`company-${f.key}`} missing={!!f.missing && !draft[f.key]}>
            <Input id={`company-${f.key}`} type={f.type ?? 'text'} placeholder={f.placeholder} value={draft[f.key] ?? ''} onChange={e => setDraft({ ...draft, [f.key]: e.target.value })} />
          </Field>)}
          <SaveBar dirty saving={saving} onSave={() => void save(c.fields.map(f => f.key))} onCancel={isNew ? undefined : () => setEditing(null)} />
        </> : c.fields.map(f => <Row key={f.key} label={f.label} value={f.type === 'date' ? dayText(saved[f.key]) : saved[f.key]} missing={f.missing} />)}
      </SettingsCard>;
    })}
    {!canEdit && <p className="px-1 text-[13px] text-muted-foreground">Company details are set up by Bani. Contact Bani to change them.</p>}
    {canEdit && org.organizations.length === 1 && !isNew && <button type="button" className="self-start px-1 text-[13px] text-[#1F6B5E]" onClick={() => setId('new')}>Add another company</button>}
  </>;
}
