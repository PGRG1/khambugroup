import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBooksWindow } from '@/hooks/useBooksWindow';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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
  return <div className="p-4 border-b border-border flex flex-wrap items-end gap-3"><div><Label htmlFor="books-start-date">Books start date</Label><Input id="books-start-date" type="date" max={books.today} value={value} onChange={e => setValue(e.target.value)} className="mt-1 w-44"/></div><Button variant="outline" disabled={busy || books.isPending || preview.isPreviewActive || !value || value > books.today || value === books.start} onClick={() => void save()}>Save</Button>{books.isError && <p role="alert" className="text-sm text-destructive">Books start date could not be loaded.</p>}</div>;
}