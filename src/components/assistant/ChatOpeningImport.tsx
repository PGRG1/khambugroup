import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { OpeningImportHandoff } from '@/components/assistant/FloatingBaniContext';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { useAssetPolicy } from '@/hooks/useAssetPolicy';
import { useBooksWindow } from '@/hooks/useBooksWindow';
import { useCanEditAccountRules } from '@/hooks/useCanEditAccountRules';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMoney } from '@/utils/money';
import { fileToBase64 } from '@/utils/salesReceiptRead';
import { TYPE_ORDER, dayBefore, matchTbAccount, r2, tbTotals, type TbAccount } from '@/utils/openingTrialBalance';

const db = supabase as any;
const money = (n: number) => formatMoney(n, undefined, { decimals: 2 });
const whole = (n: number) => Math.round(n).toLocaleString('en-HK');
const shortDate = (iso: string) => iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
type TbRead = { as_at: string; lines: { code: string; name: string; debit: number; credit: number }[] };
type AssetRead = { as_at: string; assets: { name: string; class: string; date: string; cost: number; depreciated: number; life_years: number }[] };

/** Each hand-off is read once per browser session, even if the chat re-renders or moves. */
const reads = new Map<string, Promise<TbRead | AssetRead>>();
function readOnce(h: OpeningImportHandoff) {
  if (!reads.has(h.id)) reads.set(h.id, (async () => {
    const base64 = (await fileToBase64(h.file)).replace(/^data:[^,]*,/, '');
    const { data, error } = await supabase.functions.invoke('parse-opening', { body: { kind: h.kind, files: [{ base64, mimeType: h.file.type }] } });
    if (error || !data?.success) throw new Error(data?.error || 'Could not read the document');
    return data.data;
  })());
  return reads.get(h.id)!;
}

/** Bani chat: an opening trial balance or asset list, read and laid out to check; saved only through Books setup's own functions. */
export function ChatOpeningImport({ handoff, onDone }: { handoff: OpeningImportHandoff; onDone: (text: string) => void }) {
  const { tenantId } = useActiveTenant(), canEdit = useCanEditAccountRules(), preview = usePreviewMode();
  const [read, setRead] = useState<TbRead | AssetRead | null>(null), [error, setError] = useState('');
  useEffect(() => { let on = true; readOnce(handoff).then(r => on && setRead(r), e => on && setError(e instanceof Error ? e.message : 'Could not read it')); return () => { on = false; }; }, [handoff]);
  if (preview.isPreviewActive || !tenantId) return <p className="text-[13px] text-muted-foreground">Opening balances can't be set up in preview.</p>;
  if (error) return <p className="text-[13px] text-[#B45309]">{error}. Enter it in Settings › Books setup instead.</p>;
  if (!read) return <p className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Reading {handoff.file.name}…</p>;
  if (!canEdit) return <p className="text-[13px]">Only a books approver (business admin or Approve on Finance) can set up opening balances.</p>;
  return 'lines' in read ? <TbCard tenantId={tenantId} read={read} onDone={onDone} /> : <AssetCard tenantId={tenantId} read={read} onDone={onDone} />;
}

function TbCard({ tenantId, read, onDone }: { tenantId: string; read: TbRead; onDone: (t: string) => void }) {
  const books = useBooksWindow(), navigate = useNavigate();
  const [accounts, setAccounts] = useState<TbAccount[]>([]), [orgId, setOrgId] = useState(''), [posted, setPosted] = useState(false);
  const [pick, setPick] = useState<Record<number, string>>({}), [asAt, setAsAt] = useState(read.as_at), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false), [err, setErr] = useState('');
  useEffect(() => {
    void Promise.all([
      db.from('chart_of_accounts').select('id,code,name,account_type').eq('tenant_id', tenantId).eq('is_active', true).in('account_type', TYPE_ORDER).order('code'),
      db.from('organizations').select('id').eq('tenant_id', tenantId).order('name').limit(1),
      db.from('account_opening_balances').select('id').eq('tenant_id', tenantId).eq('status', 'posted').limit(1),
    ]).then(([a, o, p]: any[]) => {
      const list: TbAccount[] = a.data ?? [];
      setAccounts(list); setOrgId(o.data?.[0]?.id ?? ''); setPosted(!!p.data?.length);
      setPick(Object.fromEntries(read.lines.map((l, i) => [i, matchTbAccount(l, list) ?? ''])));
    });
  }, [tenantId, read]);
  useEffect(() => { if (!asAt && books.start) setAsAt(dayBefore(books.start)); }, [asAt, books.start]);
  const lines = useMemo(() => Object.fromEntries(read.lines.map((l, i) => [String(i), { debit: l.debit, credit: l.credit }])), [read]);
  const totals = tbTotals(lines), missing = read.lines.filter((_, i) => !pick[i]).length;

  async function save(post: boolean) {
    setBusy(true); setErr('');
    const rows = read.lines.map((l, i) => ({ account_id: pick[i], debit: l.debit, credit: l.credit })).filter(r => r.account_id);
    const s = await db.rpc('save_opening_balances', { p_tenant: tenantId, p_org: orgId, p_as_at: asAt, p_rows: rows });
    if (s.error) { setBusy(false); setErr(s.error.message); return; }
    if (post) {
      const p = await db.rpc('post_opening_balances', { p_tenant: tenantId, p_org: orgId });
      if (p.error) { setBusy(false); setErr(`Saved as a draft, but not posted: ${p.error.message}`); return; }
    }
    setBusy(false);
    onDone(post ? `Opening balances posted to the books at ${shortDate(asAt)}` : `Opening balances saved as a draft at ${shortDate(asAt)}`);
  }

  if (posted) return <p className="text-[13px]">Opening balances are already in the books. Undo the posting in Settings › Books setup first, then send this again.</p>;
  return <div className="fb-wide-card space-y-2 text-[13px]">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="font-semibold">Opening trial balance · {read.lines.length} lines</span>
      <label className="flex items-center gap-2 text-muted-foreground">As at<Input type="date" className="h-8 w-40" value={asAt} onChange={e => setAsAt(e.target.value)} /></label>
    </div>
    <div className="kit sales-table-scroll" tabIndex={0} role="region" aria-label="Trial balance lines"><table className="sales-table" aria-label="Trial balance lines">
      <thead><tr><th className="sales-cell-left">As printed</th><th className="sales-cell-left">Account</th><th className="sales-cell-right">Balance</th></tr></thead>
      <tbody>{read.lines.map((l, i) => <tr key={i} className="sales-record-row">
        <td className="sales-cell-left" title={l.name}><span className="block max-w-[140px] truncate">{l.code && `${l.code} · `}{l.name}</span></td>
        <td className="sales-cell-left"><select aria-label={`Account for ${l.name}`} className={`h-8 w-[170px] rounded-md border bg-white px-1 text-[13px] ${pick[i] ? '' : 'border-[#B45309] text-[#B45309]'}`} value={pick[i] ?? ''} onChange={e => setPick(p => ({ ...p, [i]: e.target.value }))}>
          <option value="">Pick account</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}</select></td>
        <td className="sales-cell-right tabular-nums whitespace-nowrap">{l.debit ? `${whole(l.debit)} Dr` : `${whole(l.credit)} Cr`}</td>
      </tr>)}
        <tr className="font-semibold"><td className="sales-cell-left">Totals</td><td /><td className="sales-cell-right tabular-nums whitespace-nowrap">{whole(totals.debit)} Dr<br />{whole(totals.credit)} Cr</td></tr>
      </tbody></table></div>
    <p className={totals.difference ? 'text-[#B45309]' : 'text-[#1F6B5E]'}>{totals.difference ? `Out by ${money(Math.abs(totals.difference))}: it goes to Opening Balance Equity if you post` : 'Balanced'}{missing ? ` · ${missing} ${missing === 1 ? 'line needs' : 'lines need'} an account` : ''}</p>
    {err && <p role="alert" className="text-destructive">{err}</p>}
    <div className="flex flex-wrap items-center justify-end gap-2">
      {confirm ? <>
        <span>Post one opening journal on {shortDate(asAt)}?</span>
        <Button variant="outline" className="rounded-full" disabled={busy} onClick={() => setConfirm(false)}>Cancel</Button>
        <Button className="rounded-full" disabled={busy} onClick={() => void save(true)}>{busy ? 'Posting…' : 'Post'}</Button>
      </> : <>
        <Button variant="ghost" className="rounded-full" onClick={() => navigate('/settings?tab=accounting&view=books')}>Open Books setup</Button>
        <Button variant="outline" className="rounded-full" disabled={busy || !!missing || !orgId || !asAt} onClick={() => void save(false)}>Save draft</Button>
        <Button className="rounded-full" disabled={busy || !!missing || !orgId || !asAt} onClick={() => setConfirm(true)}>Post to books</Button>
      </>}
    </div>
  </div>;
}

function AssetCard({ tenantId, read, onDone }: { tenantId: string; read: AssetRead; onDone: (t: string) => void }) {
  const policy = useAssetPolicy(tenantId), books = useBooksWindow();
  const [rows, setRows] = useState(read.assets.map(a => ({ ...a, keep: true }))), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const kept = rows.filter(r => r.keep), years = (k: string) => policy.classes.find(c => c.class_key === k)?.useful_years ?? 5;
  const total = kept.reduce((t, r) => ({ cost: r2(t.cost + r.cost), dep: r2(t.dep + r.depreciated) }), { cost: 0, dep: 0 });
  const bad = kept.filter(r => !r.date || r.depreciated > r.cost).length;

  async function add() {
    setBusy(true); setErr('');
    let n = 0;
    for (const r of kept) {
      const { error } = await db.rpc('add_opening_asset', { t: tenantId, p: { name: r.name, class_key: r.class, date: r.date, cost: r.cost, depreciated: r.depreciated, life_months: Math.round((r.life_years || years(r.class)) * 12) } });
      if (error) { setBusy(false); setErr(`${n} added. ${r.name}: ${error.message}`); setRows(rs => rs.map(x => kept.slice(0, n).includes(x) ? { ...x, keep: false } : x)); return; }
      n++;
    }
    setBusy(false);
    onDone(`${n} opening ${n === 1 ? 'asset' : 'assets'} added to the register · ${money(total.cost)} cost, ${money(total.dep)} depreciated. Depreciation carries on from ${shortDate(books.start)}`);
  }

  return <div className="fb-wide-card space-y-2 text-[13px]">
    <span className="font-semibold">Opening assets · {kept.length} of {rows.length}</span>
    <div className="kit sales-table-scroll" tabIndex={0} role="region" aria-label="Opening assets"><table className="sales-table" aria-label="Opening assets">
      <thead><tr><th className="sales-cell-left" /><th className="sales-cell-left">Asset</th><th className="sales-cell-left">Class</th><th className="sales-cell-left">In use from</th><th className="sales-cell-right">Cost · Depr.</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className={`sales-record-row ${r.keep ? '' : 'sales-closed-row'}`}>
        <td className="sales-cell-left"><input type="checkbox" aria-label={`Add ${r.name}`} checked={r.keep} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, keep: e.target.checked } : x))} /></td>
        <td className="sales-cell-left" title={r.name}><span className="block max-w-[130px] truncate">{r.name}</span></td>
        <td className="sales-cell-left"><select aria-label={`Class for ${r.name}`} className="h-8 w-[130px] rounded-md border bg-white px-1 text-[13px]" value={r.class} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, class: e.target.value } : x))}>{policy.classes.map(c => <option key={c.class_key} value={c.class_key}>{c.name}</option>)}</select></td>
        <td className="sales-cell-left"><Input type="date" className={`h-8 w-[132px] px-2 ${r.date ? '' : 'border-[#B45309]'}`} value={r.date} onChange={e => setRows(rs => rs.map((x, j) => j === i ? { ...x, date: e.target.value } : x))} /></td>
        <td className="sales-cell-right tabular-nums whitespace-nowrap">{whole(r.cost)}<span className={`block text-[12px] ${r.depreciated > r.cost ? 'text-[#B45309]' : 'text-muted-foreground'}`}>{whole(r.depreciated)}</span></td>
      </tr>)}
        <tr className="font-semibold"><td /><td className="sales-cell-left">Total</td><td /><td /><td className="sales-cell-right tabular-nums whitespace-nowrap">{whole(total.cost)}<span className="block text-[12px] text-muted-foreground">{whole(total.dep)}</span></td></tr>
      </tbody></table></div>
    {bad > 0 && <p className="text-[#B45309]">{bad} {bad === 1 ? 'asset needs' : 'assets need'} a date, or has more depreciation than cost.</p>}
    {err && <p role="alert" className="text-destructive">{err}</p>}
    <div className="flex justify-end"><Button className="rounded-full" disabled={busy || !kept.length || bad > 0} onClick={() => void add()}>{busy ? 'Adding…' : `Add ${kept.length} ${kept.length === 1 ? 'asset' : 'assets'}`}</Button></div>
  </div>;
}
