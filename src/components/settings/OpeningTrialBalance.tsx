import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { useBooksWindow } from '@/hooks/useBooksWindow';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@/utils/money';
import { BALANCE_SHEET_TYPES, TYPE_LABEL, dayBefore, r2, tbChecks, tbTotals, type TbAccount, type TbLine } from '@/utils/openingTrialBalance';
import { Row, SettingsCard } from './SettingsForm';

const db = supabase as any;
const money = (n: number) => formatMoney(n, undefined, { decimals: 2 });
const shortDate = (iso: string) => iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
const num = (v: string) => { const n = Number(v.replace(/,/g, '')); return Number.isFinite(n) && n >= 0 ? n : 0; };

// Settings › Books setup: the opening trial balance (ERP style). Read first; Edit opens the account grid;
// Post to books makes one opening journal on the as-at date (difference → Opening Balance Equity).
export function OpeningTrialBalance({ detailVersion = 0 }: { detailVersion?: number }) {
  const { tenantId } = useActiveTenant(), books = useBooksWindow(), preview = usePreviewMode(), cache = useQueryClient();
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]), [orgId, setOrgId] = useState('');
  const [accounts, setAccounts] = useState<TbAccount[]>([]);
  const [saved, setSaved] = useState<{ lines: Record<string, TbLine>; asAt: string; posted: boolean }>({ lines: {}, asAt: '', posted: false });
  const [detail, setDetail] = useState({ owed: 0, credits: 0, customers: 0, deposits: 0 });
  const [canEdit, setCanEdit] = useState(false), [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState<'' | 'post' | 'undo'>('');
  const [draft, setDraft] = useState<Record<string, { debit: string; credit: string }>>({}), [asAt, setAsAt] = useState('');

  useEffect(() => {
    if (!tenantId) return;
    let on = true;
    void Promise.all([
      db.from('organizations').select('id,name').eq('tenant_id', tenantId).order('name'),
      db.from('chart_of_accounts').select('id,code,name,account_type').eq('tenant_id', tenantId).eq('is_active', true).in('account_type', BALANCE_SHEET_TYPES as unknown as string[]).order('code'),
      db.rpc('can_edit_account_rules', { t: tenantId }),
    ]).then(([o, a, c]: any[]) => {
      if (!on) return;
      setOrgs(o.data ?? []); setOrgId(id => id || o.data?.[0]?.id || '');
      setAccounts(a.data ?? []); setCanEdit(c.data === true);
    });
    return () => { on = false; };
  }, [tenantId]);

  const load = useCallback(async () => {
    if (!tenantId || !orgId) return;
    const [ob, sup, cn, cust, dep] = await Promise.all([
      db.from('account_opening_balances').select('coa_account_id,debit,credit,as_at_date,status').eq('tenant_id', tenantId).eq('organization_id', orgId),
      db.from('supplier_opening_balances').select('amount').eq('tenant_id', tenantId),
      db.from('credit_notes').select('remaining_balance,status').eq('tenant_id', tenantId).eq('is_opening_balance', true),
      db.from('customer_opening_balances').select('outstanding_amount,is_credit_note').eq('tenant_id', tenantId),
      db.from('deposit_opening_balances').select('total_value').eq('tenant_id', tenantId),
    ]);
    const lines: Record<string, TbLine> = {};
    for (const r of ob.data ?? []) lines[r.coa_account_id] = { debit: Number(r.debit) || 0, credit: Number(r.credit) || 0 };
    setSaved({ lines, asAt: ob.data?.[0]?.as_at_date ?? '', posted: (ob.data ?? []).some((r: any) => r.status === 'posted') });
    const sum = (rows: any[] | null, f: (r: any) => number) => r2((rows ?? []).reduce((t, r) => t + f(r), 0));
    setDetail({
      owed: sum(sup.data, r => Number(r.amount) || 0),
      credits: sum((cn.data ?? []).filter((r: any) => r.status !== 'void'), r => Number(r.remaining_balance) || 0),
      customers: sum(cust.data, r => (r.is_credit_note ? -1 : 1) * (Number(r.outstanding_amount) || 0)),
      deposits: sum(dep.data, r => Number(r.total_value) || 0),
    });
  }, [tenantId, orgId]);
  useEffect(() => { void load(); }, [load, detailVersion]);

  const defaultAsAt = books.start ? dayBefore(books.start) : '';
  const draftLines = useMemo(() => Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, { debit: num(v.debit), credit: num(v.credit) }])), [draft]);
  const shownLines = editing ? draftLines : saved.lines;
  const totals = tbTotals(shownLines), checks = tbChecks(accounts, shownLines, detail);
  const entered = Object.values(saved.lines).filter(l => l.debit || l.credit).length;
  const locked = preview.isPreviewActive || !canEdit;

  function startEdit() {
    setDraft(Object.fromEntries(Object.entries(saved.lines).map(([k, l]) => [k, { debit: l.debit ? String(l.debit) : '', credit: l.credit ? String(l.credit) : '' }])));
    setAsAt(saved.asAt || defaultAsAt); setEditing(true);
  }
  async function run(fn: () => Promise<{ error: any }>, ok: string) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false); setConfirm('');
    if (error) { toast.error(error.message); return false; }
    toast.success(ok); await load(); await cache.invalidateQueries({ queryKey: ['books-window'] });
    return true;
  }
  const save = () => run(() => db.rpc('save_opening_balances', { p_tenant: tenantId, p_org: orgId, p_as_at: asAt,
    p_rows: Object.entries(draftLines).filter(([, l]) => l.debit || l.credit).map(([account_id, l]) => ({ account_id, debit: l.debit, credit: l.credit })) }), 'Opening balances saved as a draft').then(ok => ok && setEditing(false));
  const post = () => run(() => db.rpc('post_opening_balances', { p_tenant: tenantId, p_org: orgId }), 'Opening balances posted to the books');
  const undo = () => run(() => db.rpc('unpost_opening_balances', { p_tenant: tenantId, p_org: orgId }), 'Opening journal removed');

  if (!orgs.length) return null;
  const org = orgs.find(o => o.id === orgId);
  const status = saved.posted ? 'Posted to the books' : entered ? 'Draft · not in the books yet' : '';
  const diffLine = totals.difference ? `${money(Math.abs(totals.difference))} goes to Opening Balance Equity` : 'Balanced';

  if (editing) return <SettingsCard title="Opening trial balance" editing>
    <div className="mb-3 flex flex-wrap items-end gap-3">
      {orgs.length > 1 && <label className="text-[12px] text-muted-foreground">Company<select className="mt-1 block h-9 rounded-md border bg-white px-2 text-[13px] text-foreground" value={orgId} onChange={e => setOrgId(e.target.value)}>{orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
      <label className="text-[12px] text-muted-foreground">Balances as at<Input type="date" className="mt-1 h-9 w-44" value={asAt} onChange={e => setAsAt(e.target.value)} /></label>
      {defaultAsAt && asAt !== defaultAsAt && <p className="pb-2 text-[12.5px] text-[#B45309]">Books start {shortDate(books.start)}, so this is usually {shortDate(defaultAsAt)}.</p>}
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-[13px]" aria-label="Opening trial balance">
        <thead><tr className="text-[12px] text-muted-foreground"><th className="py-2 text-left font-medium">Account</th><th className="w-36 text-right font-medium">Debit</th><th className="w-36 text-right font-medium">Credit</th></tr></thead>
        {BALANCE_SHEET_TYPES.map(t => <tbody key={t}>
          <tr><td colSpan={3} className="pt-3 pb-1 text-[12px] font-semibold text-muted-foreground">{TYPE_LABEL[t]}</td></tr>
          {accounts.filter(a => a.account_type === t).map(a => <tr key={a.id}>
            <td className="py-1 pr-2 whitespace-nowrap">{a.code} · {a.name}</td>
            {(['debit', 'credit'] as const).map(side => <td key={side} className="py-1 pl-2"><Input inputMode="decimal" aria-label={`${a.name} ${side}`} className="h-9 text-right tabular-nums" value={draft[a.id]?.[side] ?? ''}
              onChange={e => setDraft(d => ({ ...d, [a.id]: { debit: d[a.id]?.debit ?? '', credit: d[a.id]?.credit ?? '', [side]: e.target.value } }))} /></td>)}
          </tr>)}
        </tbody>)}
        <tfoot><tr className="font-semibold"><td className="pt-3">Totals</td><td className="pt-3 text-right tabular-nums">{money(totals.debit)}</td><td className="pt-3 text-right tabular-nums">{money(totals.credit)}</td></tr></tfoot>
      </table>
    </div>
    <p className={`mt-2 text-[13px] ${totals.difference ? 'text-[#B45309]' : 'text-[#1F6B5E]'}`}>{diffLine}</p>
    <Checks checks={checks} />
    <div className="settings-save">
      <Button type="button" variant="outline" className="rounded-full" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
      <Button type="button" className="rounded-full" disabled={busy || !asAt} onClick={() => void save()}>{busy ? 'Saving…' : 'Save draft'}</Button>
    </div>
  </SettingsCard>;

  return <SettingsCard title="Opening trial balance" onEdit={locked || saved.posted ? undefined : startEdit}>
    <Row label="As at" value={saved.asAt ? shortDate(saved.asAt) : ''} missing={defaultAsAt ? `Usually ${shortDate(defaultAsAt)}` : 'Not set'} />
    <Row label="Status" value={status} missing="Nothing entered yet" />
    <Row label="Debits · Credits" value={entered ? `${money(totals.debit)} · ${money(totals.credit)}` : ''} missing="—" />
    {entered > 0 && <Row label="Difference" value={diffLine} />}
    {orgs.length > 1 && <Row label="Company" value={org?.name} />}
    {checks.length > 0 && <div><Checks checks={checks} /></div>}
    {!locked && entered > 0 && <div className="flex flex-wrap items-center justify-end gap-2">
      {confirm ? <>
        <span className="text-[13px]">{confirm === 'post' ? `Post one opening journal on ${shortDate(saved.asAt)}?` : 'Remove the opening journal from the books?'}</span>
        <Button variant="outline" className="rounded-full" disabled={busy} onClick={() => setConfirm('')}>Cancel</Button>
        <Button className="rounded-full" disabled={busy} onClick={() => void (confirm === 'post' ? post() : undo())}>{busy ? 'Working…' : confirm === 'post' ? 'Post' : 'Undo posting'}</Button>
      </> : saved.posted
        ? <Button variant="outline" className="rounded-full" onClick={() => setConfirm('undo')}>Undo posting</Button>
        : <Button className="rounded-full" onClick={() => setConfirm('post')}>Post to books</Button>}
    </div>}
  </SettingsCard>;
}

function Checks({ checks }: { checks: ReturnType<typeof tbChecks> }) {
  if (!checks.length) return null;
  return <ul className="mt-2 space-y-1 text-[13px]">{checks.map(c => <li key={c.label} className="flex flex-wrap justify-between gap-2">
    <span>{c.label}</span>
    <span className={`tabular-nums ${c.ok ? 'text-[#1F6B5E]' : 'text-[#B45309]'}`}>{c.ok ? `Agree · ${money(c.detail)}` : `Detail ${money(c.detail)} · Books ${money(c.ledger)}`}</span>
  </li>)}</ul>;
}
