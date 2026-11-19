import { useEffect, useRef, useState } from 'react';
import { useOrganizations, type Organization } from '@/hooks/useOrganizations';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, SaveBar } from './SettingsForm';

type Draft = Partial<Organization>;
const FIELDS: { key: keyof Organization; label: string; hint?: string; type?: string; placeholder?: string; needed?: boolean }[] = [
  { key: 'name', label: 'Company name', needed: true },
  { key: 'legal_name', label: 'Legal name', placeholder: 'As registered' },
  { key: 'registration_number', label: 'Registration number', hint: 'Business Registration (BR) number', placeholder: 'e.g. 12345678', needed: true },
  { key: 'incorporation_date', label: 'Incorporated', hint: 'Optional', type: 'date' },
  { key: 'registered_address', label: 'Registered address', placeholder: 'Street, district' },
  { key: 'auditor', label: 'Auditor', hint: 'Optional' },
];

// Company details as one plain form. More than one company: pick it at the top, or add another.
export function CompanyDetails({ fallbackName }: { fallbackName: string }) {
  const org = useOrganizations();
  const [id, setId] = useState<string>('new');
  const [draft, setDraft] = useState<Draft>({ name: fallbackName });
  const [saving, setSaving] = useState(false);
  const saved: Draft = org.organizations.find(o => o.id === id) ?? { name: fallbackName };
  const picked = useRef(false), createdName = useRef<string | null>(null);
  useEffect(() => {
    const made = createdName.current && org.organizations.find(o => o.name === createdName.current);
    if (made) { createdName.current = null; setId(made.id); return; }
    if (!picked.current && org.organizations.length) { picked.current = true; setId(org.organizations[0].id); }
  }, [org.organizations]);
  useEffect(() => { setDraft({ ...saved }); }, [id, org.organizations]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = FIELDS.some(f => (draft[f.key] ?? '') !== (saved[f.key] ?? '')) || id === 'new';
  const save = async () => {
    if (!draft.name?.trim()) return;
    setSaving(true);
    const body = { name: draft.name.trim(), legal_name: draft.legal_name || null, registration_number: draft.registration_number || null, incorporation_date: draft.incorporation_date || null, registered_address: draft.registered_address || null, auditor: draft.auditor || null } as Partial<Organization>;
    if (id === 'new') createdName.current = body.name!;
    if (id !== 'new') await org.update(id, body); else await org.create({ ...body, name: body.name! });
    setSaving(false);
  };
  if (org.loading) return <p role="status" className="text-[13px] text-muted-foreground">Loading…</p>;
  return <div className="min-w-0">
    {(org.organizations.length > 1 || id === 'new' && org.organizations.length > 0) && <Field label="Company">
      <Select value={id} onValueChange={setId}><SelectTrigger aria-label="Company"><SelectValue /></SelectTrigger>
        <SelectContent>{org.organizations.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}<SelectItem value="new">Add another company</SelectItem></SelectContent></Select>
    </Field>}
    {FIELDS.map(f => <Field key={f.key} label={f.label} hint={f.hint} htmlFor={`company-${f.key}`} missing={f.needed && !draft[f.key]}>
      <Input id={`company-${f.key}`} type={f.type ?? 'text'} placeholder={f.placeholder} value={(draft[f.key] as string | null | undefined) ?? ''} onChange={e => setDraft({ ...draft, [f.key]: e.target.value })} />
    </Field>)}
    <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onCancel={() => setDraft({ ...saved })} />
    {org.organizations.length === 1 && id !== 'new' && <button type="button" className="mt-3 text-[13px] text-[#2F5E5A]" onClick={() => setId('new')}>Add another company</button>}
  </div>;
}
