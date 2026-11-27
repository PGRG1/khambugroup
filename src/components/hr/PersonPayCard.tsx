import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { personRotaShare, type TeamMode } from '@/utils/teamWorking';
import { formatMonthLabel } from '@/utils/format';

// People › person: where their pay is charged in venue profit (their venue, split by rota hours, or central),
// saved on tap through save_pay_split; Bani's hint is their rota hours last month. Then whether they have a Bani
// login (matched by user_id, else email), with a link to Settings › People, where logins are managed.

type Props = { person: any; data: any; venues: { id: string; name: string }[]; venueName: string; readOnly?: boolean };

export function PersonPayCard({ person, data, venues, venueName, readOnly }: Props) {
  const [mode, setMode] = useState<TeamMode | null>(person.pay_split ?? null);
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState<'loading' | 'yes' | 'no'>('loading');
  useEffect(() => setMode(person.pay_split ?? null), [person.pay_split]);

  const month = useMemo(() => { const d = new Date(`${data.today}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); }, [data.today]);
  const share = useMemo(() => personRotaShare(person.id, data.rawEmployees, data.shifts, data.terms, venues, month), [person.id, data.rawEmployees, data.shifts, data.terms, venues, month]);
  const suggested: TeamMode | null = share.length > 1 ? 'across' : null;

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

  const save = async (next: TeamMode) => {
    if (readOnly || busy || next === mode) return;
    setBusy(true);
    const { error } = await (supabase as any).rpc('save_pay_split', { t: data.tenantId, e: person.id, p_mode: next });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setMode(next); toast.success('Saved'); void data.reload();
  };

  const options: { key: TeamMode; title: string; line: string }[] = [
    { key: 'own', title: venueName, line: 'Their venue' },
    { key: 'across', title: 'Shared', line: 'Split by rota hours' },
    { key: 'central', title: 'Central', line: 'No venue' },
  ];

  return <>
    <section className="card-glass rounded-xl p-3 sm:p-4 min-w-0" aria-label="Pay charged to">
      <h2 className="font-display text-lg font-semibold mb-3">Pay charged to</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Pay charged to">
        {options.map((o) => { const on = mode === o.key; return <button key={o.key} type="button" role="radio" aria-checked={on} disabled={readOnly || busy}
          onClick={() => void save(o.key)}
          className={`text-left rounded-lg border px-3 py-2.5 min-w-0 transition-colors ${on ? 'border-[#1F6B5E] bg-[rgba(31,107,94,0.06)]' : 'border-border bg-card'}`}>
          <p className="text-[13px] font-medium truncate">{o.title}</p>
          <p className="text-[12px] text-muted-foreground whitespace-nowrap">{o.line}</p>
        </button>; })}
      </div>
      {!mode && <p className="text-[12px] text-[#B45309] mt-2 whitespace-nowrap overflow-hidden text-ellipsis">Not chosen yet · Bani uses the role setting for now</p>}
      {share.length > 0 && <p className="text-[12px] text-muted-foreground mt-2 whitespace-nowrap overflow-hidden text-ellipsis">
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[#3E8C80] mr-1.5 align-middle" />
        Bani: {formatMonthLabel(month)} rota {share.map((s) => `${s.pct}% ${s.name}`).join(', ')}{suggested && mode !== suggested ? ' · Shared fits' : ''}
      </p>}
    </section>
    <section className="card-glass rounded-xl p-3 sm:p-4 min-w-0" aria-label="Bani login">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Bani login</h2>
        <Link className="kit-link text-[13px] whitespace-nowrap" to="/settings?tab=users">{login === 'yes' ? 'Manage in Settings ›' : 'Give a login in Settings ›'}</Link>
      </div>
      <p className="text-[13px] mt-1 text-muted-foreground">{login === 'loading' ? 'Checking…' : login === 'yes' ? 'Has a Bani login' : 'No login'}</p>
    </section>
  </>;
}
