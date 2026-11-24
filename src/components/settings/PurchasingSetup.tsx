import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SettingsCard, Field, SaveBar } from '@/components/settings/SettingsForm';
import { keyOpen, Empty } from '@/components/finance/accounting/AccountingKit';
import { GROUPS, groupLabel, buildRows, groupOf, accountAt, rowProblem, categoryLabel, type CategoryRow } from '@/utils/purchasingSetup';
import { dayLabel } from '@/utils/revenueMapping';

// Settings › Purchasing setup: which account each product category posts to, for every client. Bani and roles
// with Approve on Finance edit it (save_purchasing_setup); invoices already in the books never change. An approved
// invoice that cannot post is held with its reason (purchase_posting_holds) instead of being skipped.

type Hold = { invoice_id: string; reasons: string[]; invoice: { invoice_number: string; invoice_date: string; venue: string; total_amount: number; supplier: { name: string } | null } | null };
type Version = { id: string; version_no: number; created_by_name: string | null; created_at: string; note: string | null; rows: unknown[] };
type Mode = 'view' | 'edit' | 'history';

const money = (n: number) => `HK$ ${Number(n ?? 0).toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PurchasingSetup() {
  const { tenantId } = useActiveTenant();
  const { isPlatformAdmin: bani } = usePlatformAdmin();
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [rows, setRows] = useState<CategoryRow[]>([]);
  const [venues, setVenues] = useState<{ id: string; name: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [mode, setMode] = useState<Mode>('view');
  const [scope, setScope] = useState('all');
  const [draft, setDraft] = useState<CategoryRow[]>([]);
  const [row, setRow] = useState<CategoryRow | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const db = supabase as any;
    const products: { financial_treatment: string | null; level1_category: string | null }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from('product_master').select('financial_treatment,level1_category').eq('tenant_id', tenantId).range(from, from + 999);
      products.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const [ru, vn, coa, hs, vs, lvl] = await Promise.all([
      db.from('account_mapping_rules').select('rule_type,match_key,account_id').eq('tenant_id', tenantId).in('rule_type', ['procurement_category', 'procurement_category_venue']),
      db.from('venues').select('id,name').eq('tenant_id', tenantId).eq('is_active', true).order('name'),
      db.from('chart_of_accounts').select('id,code,name').eq('tenant_id', tenantId).eq('is_active', true).order('code'),
      db.from('purchase_posting_holds').select('invoice_id,reasons,invoice:invoices(invoice_number,invoice_date,venue,total_amount,supplier:suppliers(name))').eq('tenant_id', tenantId).order('updated_at', { ascending: false }),
      db.from('purchasing_setup_versions').select('id,version_no,created_by_name,created_at,note,rows').eq('tenant_id', tenantId).order('version_no', { ascending: false }),
      bani ? Promise.resolve({ data: 3 }) : db.rpc('access_level', { t: tenantId, area: 'finance' }),
    ]);
    const vlist = (vn.data ?? []) as { id: string; name: string }[];
    setVenues(vlist); setAccounts(coa.data ?? []);
    setRows(buildRows(products, ru.data ?? [], vlist));
    setHolds(((hs.data ?? []) as Hold[]).sort((a, b) => String(b.invoice?.invoice_date ?? '').localeCompare(String(a.invoice?.invoice_date ?? ''))));
    setVersions(vs.data ?? []);
    setCanEdit(bani || Number(lvl.data ?? 0) >= 3);
    setLoading(false);
  }, [tenantId, bani]);
  useEffect(() => { void load(); }, [load]);

  const venueIds = venues.map((v) => v.id);
  const accountLabel = (id: string | null) => { const a = accounts.find((x) => x.id === id); return a ? `${a.code} ${a.name}` : null; };
  const editing = mode === 'edit';
  const list = editing ? draft : rows;
  const problems = list.filter((r) => rowProblem(r, venueIds)).length;
  const accountCell = (r: CategoryRow) => {
    const at = scope !== 'all' ? scope : null;
    if (!at && Object.keys(r.venue_accounts).length) return r.account_id && Object.keys(r.venue_accounts).length < venues.length
      ? <>{accountLabel(r.account_id)}<span className="text-muted-foreground"> · some venues differ</span></>
      : <span className="text-muted-foreground">By venue</span>;
    return accountLabel(accountAt(r, at)) ?? <span className="text-[#B45309]">No account</span>;
  };

  const startEdit = () => { setDraft(rows.map((r) => ({ ...r, venue_accounts: { ...r.venue_accounts } }))); setNote(''); setRow(null); setMode('edit'); };
  const done = () => { if (row) { setDraft(draft.map((r) => (r.key === row.key ? row : r))); setRow(null); } };
  const save = async () => {
    if (!tenantId) return;
    setSaving(true);
    const body = draft.map((r) => ({ treatment: r.treatment, category: r.category, new_treatment: r.new_treatment, account_id: r.account_id, venue_accounts: r.venue_accounts }));
    const { data, error } = await (supabase.rpc as any)('save_purchasing_setup', { p_tenant: tenantId, p_rows: body, p_note: note || null });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Version ${data} saved`);
    setMode('view'); setDraft([]); void load();
  };

  if (loading) return <SettingsCard title="Purchasing setup"><p className="py-2 text-[13px] text-muted-foreground">Loading…</p></SettingsCard>;

  // One category, being changed.
  if (row) {
    const same = !Object.keys(row.venue_accounts).length;
    const setSame = (on: boolean) => on
      ? setRow({ ...row, account_id: row.account_id ?? Object.values(row.venue_accounts)[0] ?? null, venue_accounts: {} })
      : setRow({ ...row, venue_accounts: Object.fromEntries(venues.map((v) => [v.id, accountAt(row, v.id) ?? ''] as const).filter(([, a]) => a)) });
    const pick = (value: string | null, onChange: (v: string) => void, label: string) => <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="h-10 text-[13px]"><SelectValue placeholder="Select account" /></SelectTrigger>
      <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>)}</SelectContent></Select>;
    return <SettingsCard title={categoryLabel(row)} editing>
      <Field label="Group" missing={!groupOf(row)}>
        {row.treatment
          ? <p className="py-2 text-[13px]">{groupLabel(row.treatment) ?? row.treatment}</p>
          : <Select value={row.new_treatment ?? undefined} onValueChange={(v) => setRow({ ...row, new_treatment: v })}>
              <SelectTrigger aria-label="Group" className="h-10 text-[13px]"><SelectValue placeholder="Select group" /></SelectTrigger>
              <SelectContent>{GROUPS.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>}
      </Field>
      <Field label="Account" missing={!!rowProblem(row, venueIds)}>
        {venues.length > 1 && <label className="mb-2 flex min-h-9 cursor-pointer items-center gap-2.5 text-[13px] whitespace-nowrap">
          <input type="checkbox" className="h-4 w-4 accent-[#1F6B5E]" checked={same} onChange={(e) => setSame(e.target.checked)} />Same for all venues</label>}
        {same ? pick(row.account_id, (v) => setRow({ ...row, account_id: v }), 'Account')
          : <div className="grid gap-2">{venues.map((v) => <div key={v.id} className="grid grid-cols-[110px_1fr] items-center gap-3">
              <span className="truncate text-[13px]">{v.name}</span>
              {pick(row.venue_accounts[v.id] ?? null, (a) => setRow({ ...row, venue_accounts: { ...row.venue_accounts, [v.id]: a } }), `Account for ${v.name}`)}
            </div>)}</div>}
      </Field>
      <SaveBar dirty label="Done" onSave={done} onCancel={() => setRow(null)} />
    </SettingsCard>;
  }

  if (mode === 'history') return <SettingsCard title="History" action={<button type="button" className="settings-edit" onClick={() => setMode('view')}>Back</button>}>
    {versions.length ? <div className="kit sales-table-scroll" tabIndex={0} role="region" aria-label="Versions table"><table className="sales-table" aria-label="Versions">
      <thead><tr>{['Version', 'Saved by', 'Categories', 'Saved on', 'What changed'].map((h, i) => <th key={h} scope="col" className={i === 2 ? 'sales-cell-right' : 'sales-cell-left'}>{h}</th>)}</tr></thead>
      <tbody>{versions.map((v) => <tr key={v.id} className="sales-record-row">
        <td className="sales-cell-left font-medium whitespace-nowrap">Version {v.version_no}</td>
        <td className="sales-cell-left whitespace-nowrap">{v.created_by_name ?? '—'}</td>
        <td className="kit-num">{v.rows?.length ?? 0}</td>
        <td className="sales-cell-left whitespace-nowrap">{dayLabel(v.created_at.slice(0, 10))}</td>
        <td className="sales-cell-left truncate">{v.note ?? '—'}</td>
      </tr>)}</tbody></table></div> : <Empty>No versions yet.</Empty>}
  </SettingsCard>;

  const tabs = venues.length > 1 && <div className="settings-tabs" role="tablist" aria-label="Venue">
    {[{ id: 'all', name: 'All venues' }, ...venues].map((v) => <button key={v.id} type="button" role="tab" aria-selected={scope === v.id} onClick={() => setScope(v.id)}>{v.name}</button>)}
  </div>;
  const current = versions[0];
  const summary = editing
    ? <>{list.length} {list.length === 1 ? 'category' : 'categories'}{problems > 0 && <span className="text-[#B45309]"> · {problems} to finish</span>}</>
    : <>{current ? `Version ${current.version_no}${current.created_by_name ? ` · ${current.created_by_name}` : ''}` : 'Not saved yet · today\'s accounts'}{problems > 0 && <span className="text-[#B45309]"> · {problems} {problems === 1 ? 'category has' : 'categories have'} no account</span>}</>;

  return <>
    <SettingsCard title={editing ? 'Editing purchasing setup' : 'Purchasing setup'} action={editing
      ? <span className="flex gap-4 whitespace-nowrap"><button type="button" className="settings-edit" onClick={() => setMode('view')}>Cancel</button></span>
      : <span className="flex gap-4 whitespace-nowrap">{versions.length > 0 && <button type="button" className="settings-edit" onClick={() => setMode('history')}>History</button>}{canEdit && <button type="button" className="settings-edit" onClick={startEdit}>Edit</button>}</span>}>
      {tabs}
      <p className="py-2 text-[13px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">{summary}</p>
      {list.length ? <div className="kit sales-table-scroll" tabIndex={0} role="region" aria-label="Purchasing setup table"><table className="sales-table" aria-label="Purchasing setup">
        <thead><tr>{['Category', 'Group', 'Account', 'Products'].map((h, i) => <th key={h} scope="col" className={i === 3 ? 'sales-cell-right' : 'sales-cell-left'}>{h}</th>)}</tr></thead>
        <tbody>{list.map((r) => <tr key={r.key} className="sales-record-row" {...(editing ? keyOpen(() => setRow({ ...r, venue_accounts: { ...r.venue_accounts } })) : {})}>
          <td className="sales-cell-left font-medium whitespace-nowrap">{categoryLabel(r)}</td>
          <td className="sales-cell-left whitespace-nowrap">{groupLabel(groupOf(r)) ?? (groupOf(r) || <span className="text-[#B45309]">Select group</span>)}</td>
          <td className="sales-cell-left whitespace-nowrap">{accountCell(r)}</td>
          <td className="kit-num">{r.products}</td>
        </tr>)}</tbody></table></div> : <Empty>No product categories yet.</Empty>}
      {editing && <div className="mt-3 space-y-3">
        <Field label="What changed" htmlFor="ps-note"><Input id="ps-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className="h-10 text-[13px]" /></Field>
        <SaveBar dirty={!!draft.length} saving={saving} label="Save setup" onSave={() => void save()} onCancel={() => setMode('view')} />
      </div>}
    </SettingsCard>

    {!editing && holds.length > 0 && <SettingsCard title={`Held invoices · ${holds.length}`}>
      <div className="kit sales-table-scroll" tabIndex={0} role="region" aria-label="Held invoices table"><table className="sales-table" aria-label="Held invoices">
        <thead><tr>{['Invoice', 'Supplier', 'Date', 'Venue', 'Amount', 'Why'].map((h, i) => <th key={h} scope="col" className={i === 4 ? 'sales-cell-right' : 'sales-cell-left'}>{h}</th>)}</tr></thead>
        <tbody>{holds.map((h) => <tr key={h.invoice_id} className="sales-record-row">
          <td className="sales-cell-left font-medium whitespace-nowrap"><Link className="kit-link text-[13px]" to={`/procurement/invoices?invoice=${h.invoice_id}`}>{h.invoice?.invoice_number ?? 'Invoice'}</Link></td>
          <td className="sales-cell-left whitespace-nowrap">{h.invoice?.supplier?.name ?? '—'}</td>
          <td className="sales-cell-left whitespace-nowrap">{h.invoice?.invoice_date ? dayLabel(h.invoice.invoice_date) : '—'}</td>
          <td className="sales-cell-left whitespace-nowrap">{h.invoice?.venue ?? '—'}</td>
          <td className="kit-num">{money(h.invoice?.total_amount ?? 0)}</td>
          <td className="sales-cell-left whitespace-nowrap text-[#B45309]">{h.reasons.join(' · ')}</td>
        </tr>)}</tbody></table></div>
    </SettingsCard>}
  </>;
}
