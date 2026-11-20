import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBooksWindow } from '@/hooks/useBooksWindow';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Field, Row, SaveBar, SettingsCard } from './SettingsForm';
import { toast } from 'sonner';
export function BooksStartSetting() {
  const books = useBooksWindow(), preview = usePreviewMode(), cache = useQueryClient();
  const [value, setValue] = useState(books.start), [busy, setBusy] = useState(false);
  useEffect(() => { setValue(books.start); }, [books.start]);
  async function save() {
    if (!books.tenantId || !value || value > books.today || preview.isPreviewActive) return;
    setBusy(true);
    const { error } = await supabase.from('app_config').upsert({ tenant_id: books.tenantId, key: 'books_start_date', value }, { onConflict: 'tenant_id,key' });
    setBusy(false);
    if (error) toast.error(error.message);
    else { await cache.invalidateQueries({ queryKey: ['books-window'] }); toast.success('Books start date saved'); }
  }
  const [editing, setEditing] = useState(false);
  const shown = books.start ? new Date(`${books.start}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
  return <SettingsCard title="Books start" editing={editing} onEdit={editing || preview.isPreviewActive ? undefined : () => { setValue(books.start); setEditing(true); }}>
    {editing ? <>
      <Field label="Books start date" htmlFor="books-start-date" missing={!value}><Input id="books-start-date" type="date" max={books.today} value={value} onChange={e => setValue(e.target.value)} className="w-44" /></Field>
      <SaveBar dirty={!!value && value <= books.today && value !== books.start} saving={busy || books.isPending} onSave={() => void save().then(() => setEditing(false))} onCancel={() => setEditing(false)} />
    </> : <Row label="Books start date" value={shown} missing="Pick the first day of your books" />}
    {books.isError && <p role="alert" className="text-sm text-destructive">Books start date could not be loaded.</p>}
  </SettingsCard>;
}
