import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

// People › person: whether they have a Bani login (matched by user_id, else email), with a link to Settings › People,
// where logins are managed.

type Props = { person: any; data: any };

export function PersonLoginCard({ person, data }: Props) {
  const [login, setLogin] = useState<'loading' | 'yes' | 'no'>('loading');
  useEffect(() => {
    let live = true;
    (async () => {
      if (person.user_id) { setLogin('yes'); return; }
      if (!person.email || !data.tenantId) { setLogin('no'); return; }
      const [{ data: members }, users] = await Promise.all([
        supabase.from('tenant_members').select('user_id').eq('tenant_id', data.tenantId),
        supabase.functions.invoke('list-users'),
      ]);
      const ids = new Set((members ?? []).map((m: any) => m.user_id));
      const email = String(person.email).trim().toLowerCase();
      const hit = ((users.data?.users ?? []) as { id: string; email?: string }[]).some((u) => ids.has(u.id) && String(u.email ?? '').toLowerCase() === email);
      if (live) setLogin(hit ? 'yes' : 'no');
    })().catch(() => live && setLogin('no'));
    return () => { live = false; };
  }, [person.user_id, person.email, data.tenantId]);

  return <section className="card-glass rounded-xl p-3 sm:p-4 min-w-0" aria-label="Bani login">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Bani login</h2>
        <Link className="kit-link text-[13px] whitespace-nowrap" to="/settings?tab=users">{login === 'yes' ? 'Manage in Settings ›' : 'Give a login in Settings ›'}</Link>
      </div>
      <p className="text-[13px] mt-1 text-muted-foreground">{login === 'loading' ? 'Checking…' : login === 'yes' ? 'Has a Bani login' : 'No login'}</p>
    </section>;
}
