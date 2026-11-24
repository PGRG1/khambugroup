import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SettingsCard, Field, SaveBar } from '@/components/settings/SettingsForm';
import { keyOpen, Empty } from '@/components/finance/accounting/AccountingKit';
import { matchRead, setupProblems, linesForVenue, type SetupKind } from '../../../supabase/functions/_shared/setupReceipt';
import {
  type MapLine, TYPES, typeValue, fromTypeValue, typeLabel, lineProblem, settlesLabel, inScope, unknownNames, suggestAccounts, prefillDraft,
  methodsFor, methodLabel, accountFor, missingAccount, posts, hkToday, dayLabel,
} from '@/utils/revenueMapping';

// Settings › Revenue mapping: how each printed line of a client's sales report posts to the books. Bani and roles with
// Approve on Finance edit it; every save is a dated version and posted days are never re-posted (save_sales_mapping).
// Every client uses it: a client already scanning on the standard fields starts from those fields, with the
// accounts How things post already uses; its days move onto this setup from the first version's start date.

type Version = { id: string; version_no: number; effective_from: string; created_by_name: string | null; created_at: string; lines: MapLine[]; note: string | null };
type Hold = { day: string; venue: string; reasons: string[] };
type Recent = { id: string; date: string; venue: string; venue_id: string | null; lines: { printed: string; amount: number }[] };
type Mode = 'view' | 'history' | 'edit' | 'date';

const COLS = ['Report line', 'Type', 'Payment method', 'Settles to', 'Account'];

export function RevenueMapping() {
  const { tenantId } = useActiveTenant();
  const { isPlatformAdmin: bani } = usePlatformAdmin();
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState<MapLine[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [venues, setVenues] = useState<{ id: string; name: string }[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [processors, setProcessors] = useState<{ id: string; name: string }[]>([]);
  const [rules, setRules] = useState<{ rule_type: string; match_key: string; account_id: string }[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [records, setRecords] = useState(0);
  const [held, setHeld] = useState<{ venue_id: string | null; names: string[] }[]>([]);
  const [mode, setMode] = useState<Mode>('view');
  const [scope, setScope] = useState<string>('all');
  const [draft, setDraft] = useState<MapLine[]>([]);
  const [line, setLine] = useState<MapLine | null>(null);
  const [from, setFrom] = useState(hkToday());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const db = supabase as any;
    const [ls, vs, hs, vn, coa, pr, ru, rec, ins, lvl] = await Promise.all([
      db.from('sales_report_lines').select('id,venue_id,printed_name,aliases,kind,category,settles_to,processor_ids,gl_account_id,venue_accounts,method,legacy_field,sort_order').eq('tenant_id', tenantId).eq('is_active', true).order('sort_order'),
      db.from('sales_mapping_versions').select('id,version_no,effective_from,created_by_name,created_at,lines,note').eq('tenant_id', tenantId).order('version_no', { ascending: false }),
      db.from('sales_posting_holds').select('day,venue,reasons').eq('tenant_id', tenantId).order('day', { ascending: false }),
      db.from('venues').select('id,name').eq('tenant_id', tenantId).eq('is_active', true).order('name'),
      db.from('chart_of_accounts').select('id,code,name').eq('tenant_id', tenantId).eq('is_active', true).order('code'),
      db.from('payment_processors').select('id,name').eq('tenant_id', tenantId).eq('is_active', true).order('sort_order'),
      db.from('account_mapping_rules').select('rule_type,match_key,account_id').eq('tenant_id', tenantId).in('rule_type', ['payment_settlement_clearing', 'cash_on_hand', 'sales_revenue', 'service_charge', 'sales_discount', 'tips_payable']),
      db.from('sales_records').select('id,date,venue,venue_id').eq('tenant_id', tenantId).order('date', { ascending: false }).limit(30),
      db.from('sales_receipt_intakes').select('venue_id,tentative_values').eq('tenant_id', tenantId).eq('status', 'needs_review').order('created_at', { ascending: false }).limit(20),
      bani ? Promise.resolve({ data: 3 }) : db.rpc('access_level', { t: tenantId, area: 'finance' }),
    ]);
    const rows = (ls.data ?? []) as MapLine[];
    setLines(rows.map((r) => ({ ...r, key: r.id!, aliases: r.aliases ?? [], processor_ids: r.processor_ids ?? [], venue_accounts: r.venue_accounts ?? {} })));
    setVersions((vs.data ?? []) as Version[]);
    setHolds((hs.data ?? []) as Hold[]);
    setVenues(vn.data ?? []); setAccounts(coa.data ?? []); setProcessors(pr.data ?? []); setRules(ru.data ?? []);
    setCanEdit(bani || Number(lvl.data ?? 0) >= 3);
    const recs = (rec.data ?? []) as Omit<Recent, 'lines'>[];
    setRecords(recs.length);
    const { data: rl } = recs.length
      ? await db.from('sales_record_lines').select('sales_record_id,printed_name,amount').eq('tenant_id', tenantId).in('sales_record_id', recs.map((r) => r.id))
      : { data: [] };
    setRecent(recs.map((r) => ({ ...r, lines: ((rl ?? []) as { sales_record_id: string; printed_name: string; amount: number }[]).filter((x) => x.sales_record_id === r.id).map((x) => ({ printed: x.printed_name, amount: Number(x.amount) })) })).filter((r) => r.lines.length));
    setHeld(((ins.data ?? []) as { venue_id: string | null; tentative_values: { lines?: { printed?: string }[] } | null }[])
      .map((i) => ({ venue_id: i.venue_id, names: (Array.isArray(i.tentative_values?.lines) ? i.tentative_values!.lines : []).map((l) => String(l?.printed ?? '').trim()).filter(Boolean) })));
    setLoading(false);
  }, [tenantId, bani]);
  useEffect(() => { void load(); }, [load]);

  const venueName = (id: string | null) => (id ? venues.find((v) => v.id === id)?.name ?? 'Venue' : 'All venues');
  const accountLabel = (id: string | null) => { const a = accounts.find((x) => x.id === id); return a ? `${a.code} ${a.name}` : null; };
  const venueIds = venues.map((v) => v.id);
  // The account cell: a venue tab shows that venue's account; All venues shows the shared one, or "By venue".
  const accountCell = (l: MapLine) => {
    if (!posts(l)) return <span className="text-muted-foreground">—</span>;
    const at = scope !== 'all' ? scope : l.venue_id;
    const byVenue = Object.keys(l.venue_accounts).length > 0;
    if (!at && byVenue) return <span className="text-muted-foreground">By venue</span>;
    const label = accountLabel(at ? accountFor(l, at) : l.gl_account_id);
    if (label) return label;
    return <span className="text-[#B45309]">No account</span>;
  };
  const editing = mode === 'edit' || mode === 'date';
  const source = editing ? draft : lines;
  const shown = inScope(source, scope);
  const follows = scope !== 'all' && !shown.length;
  const rows = follows ? inScope(source, 'all') : shown;
  const current = versions[0];

  // Printed lines seen on recent and held reports that this scope does not know yet.
  const unknown = useMemo(() => {
    if (!editing || follows) return [];
    const seen = [...recent.map((r) => ({ venue_id: r.venue_id, names: r.lines.map((l) => l.printed) })), ...held];
    return unknownNames(draft, scope, seen, venueIds);
  }, [editing, follows, recent, held, draft, scope, venues]);

  // Recent reports checked against the mapping being edited.
  const samples = useMemo(() => recent.slice(0, 3).map((r) => {
    const defs = linesForVenue(draft, r.venue_id).filter((l) => l.kind).map((l) => ({ printed: l.printed_name, kind: l.kind as SetupKind, aliases: l.aliases, method: l.method }));
    const read = matchRead({ lines: r.lines }, defs);
    const unmapped = read.lines.filter((l) => !l.known && l.amount).length;
    const problems = unmapped ? [] : setupProblems(read.lines);
    return { r, text: unmapped ? `${unmapped} unmapped ${unmapped === 1 ? 'line' : 'lines'}` : problems.length ? problems[0] : 'Balanced', ok: !unmapped && !problems.length };
  }), [recent, draft]);

  const issues = draft.filter((l) => lineProblem(l)).length + (mode === 'edit' ? unknown.length : 0);

  // A client scanning on the standard fields: it has lines with a field, or sales but no lines yet.
  const scansFields = lines.some((l) => !!l.legacy_field) || (!lines.length && !versions.length && records > 0);
  const startEdit = () => { setDraft(prefillDraft(lines, { hasVersion: versions.length > 0, scansFields, rules, venues })); setLine(null); setFrom(hkToday()); setNote(''); setMode('edit'); };
  const cancel = () => { setDraft([]); setLine(null); setMode('view'); };
  const open = (l: MapLine) => setLine({ ...l, aliases: [...l.aliases], processor_ids: [...l.processor_ids], venue_accounts: { ...l.venue_accounts } });
  const add = (name = '') => setLine({ key: `new-${Date.now()}`, venue_id: scope === 'all' ? null : scope, printed_name: name, aliases: [], kind: null, category: null, settles_to: null, processor_ids: [], gl_account_id: null, venue_accounts: {}, method: null });
  const ownLines = () => setDraft([...draft, ...inScope(draft, 'all').map((l) => ({ ...l, key: `new-${l.key}-${scope}`, id: undefined, venue_id: scope, gl_account_id: accountFor(l, scope), venue_accounts: {} }))]);
  const useAll = () => setDraft(draft.filter((l) => l.venue_id !== scope));
  const done = () => {
    if (!line) return;
    const name = line.printed_name.trim();
    if (!name) return toast.error('Add the line as printed on the report');
    const clash = inScope(draft, line.venue_id ?? 'all').find((l) => l.key !== line.key && [l.printed_name, ...l.aliases].some((n) => n.trim().toLowerCase() === name.toLowerCase()));
    if (clash) return toast.error(`${name} is already in this mapping`);
    const next = { ...line, printed_name: name };
    setDraft(draft.some((l) => l.key === line.key) ? draft.map((l) => (l.key === line.key ? next : l)) : [...draft, next]);
    setLine(null);
  };
  const remove = () => { if (line) { setDraft(draft.filter((l) => l.key !== line.key)); setLine(null); } };
  const save = async () => {
    if (!tenantId) return;
    setSaving(true);
    const body = draft.map((l) => ({ id: l.id ?? null, venue_id: l.venue_id, printed_name: l.printed_name, aliases: l.aliases, kind: l.kind, category: l.category, settles_to: l.settles_to,
      processor_ids: l.processor_ids, gl_account_id: l.gl_account_id, venue_accounts: l.venue_accounts, method: l.method, legacy_field: l.legacy_field ?? null }));
    const { data, error } = await (supabase.rpc as any)('save_sales_mapping', { p_tenant: tenantId, p_effective: from, p_lines: body, p_note: note || null });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Version ${data} saved`);
    setMode('view'); setDraft([]); void load();
  };

  if (loading) return <SettingsCard title="Revenue setup"><p className="py-2 text-[13px] text-muted-foreground">Loading…</p></SettingsCard>;

  // One line, being changed.
  if (line) {
    const t = typeValue(line);
    const needsAccount = posts(line);
    const suggest = (next: MapLine): MapLine => (next.gl_account_id || Object.keys(next.venue_accounts).length ? next : { ...next, ...(suggestAccounts(next, rules, venues) ?? {}) });
    const setType = (v: string) => {
      let next: MapLine = { ...line, ...fromTypeValue(v) };
      if (next.kind !== 'payment') { next.settles_to = null; next.processor_ids = []; } else if (!next.settles_to) next.settles_to = 'bank';
      if (!methodsFor(next.kind).some(([m]) => m === next.method)) next.method = null;
      if (!posts(next)) next = { ...next, gl_account_id: null, venue_accounts: {} };
      else next = suggest(next);
      setLine(next);
    };
    const setMethod = (m: string) => {
      const next: MapLine = m === 'cash' ? { ...line, method: m, settles_to: 'cash', processor_ids: [] } : { ...line, method: m, settles_to: line.kind === 'payment' ? (line.settles_to === 'cash' ? 'bank' : line.settles_to ?? 'bank') : line.settles_to };
      setLine(suggest(next));
    };
    const toggleProc = (id: string) => setLine({ ...line, settles_to: 'bank', method: line.method === 'cash' ? null : line.method, processor_ids: line.processor_ids.includes(id) ? line.processor_ids.filter((p) => p !== id) : [...line.processor_ids, id] });
    const toggleCash = () => {
      const next: MapLine = line.settles_to === 'cash' ? { ...line, settles_to: 'bank', method: null } : { ...line, settles_to: 'cash', method: 'cash', processor_ids: [] };
      setLine(suggest({ ...next, gl_account_id: null, venue_accounts: {} }));
    };
    const same = !!line.venue_id || !Object.keys(line.venue_accounts).length;
    const setSame = (on: boolean) => on
      ? setLine({ ...line, gl_account_id: line.gl_account_id ?? Object.values(line.venue_accounts)[0] ?? null, venue_accounts: {} })
      : setLine({ ...line, gl_account_id: null, venue_accounts: Object.fromEntries(venues.map((v) => [v.id, accountFor(line, v.id) ?? ''] as const).filter(([, a]) => a)) });
    const accountSelect = (value: string | null, onChange: (v: string) => void, label: string) => <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="h-10 text-[13px]"><SelectValue placeholder="Select account" /></SelectTrigger>
      <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>)}</SelectContent></Select>;
    return <SettingsCard title="Report line" editing>
      <Field label="Printed as" hint="Other names the report uses for this line">
        <Input aria-label="Printed as" value={line.printed_name} onChange={(e) => setLine({ ...line, printed_name: e.target.value })} className="h-10 text-[13px]" />
        <Aliases values={line.aliases} onChange={(aliases) => setLine({ ...line, aliases })} />
      </Field>
      <Field label="Type">
        <Select value={t || undefined} onValueChange={setType}><SelectTrigger aria-label="Type" className="h-10 text-[13px]"><SelectValue placeholder="Select type" /></SelectTrigger>
          <SelectContent>{TYPES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select>
      </Field>
      {methodsFor(line.kind).length > 0 && <Field label={line.kind === 'delivery' ? 'Platform' : 'Payment method'} hint="Used for card payouts and Revenue reports">
        <Select value={line.method ?? undefined} onValueChange={setMethod}><SelectTrigger aria-label="Payment method" className="h-10 text-[13px]"><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>{methodsFor(line.kind).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
      </Field>}
      {line.kind === 'payment' && <Field label="Settles to">
        <div className="grid gap-1">
          {processors.map((p) => <label key={p.id} className="flex min-h-9 cursor-pointer items-center gap-2.5 text-[13px] whitespace-nowrap">
            <input type="checkbox" className="h-4 w-4 accent-[#1F6B5E]" checked={line.processor_ids.includes(p.id)} onChange={() => toggleProc(p.id)} />{p.name}</label>)}
          <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-[13px] whitespace-nowrap">
            <input type="checkbox" className="h-4 w-4 accent-[#1F6B5E]" checked={line.settles_to === 'cash'} onChange={toggleCash} />Cash</label>
          {line.processor_ids.length > 1 && <p className="text-[12.5px] text-muted-foreground">Split by each processor's settlement report.</p>}
          {!processors.length && <p className="text-[12.5px] text-muted-foreground">No card processors yet. Add them in Card processors.</p>}
        </div>
      </Field>}
      {needsAccount && <Field label="Account" missing={missingAccount(line, venueIds)}>
        {!line.venue_id && venues.length > 1 && <label className="mb-2 flex min-h-9 cursor-pointer items-center gap-2.5 text-[13px] whitespace-nowrap">
          <input type="checkbox" className="h-4 w-4 accent-[#1F6B5E]" checked={same} onChange={(e) => setSame(e.target.checked)} />Same for all venues</label>}
        {same ? accountSelect(line.gl_account_id, (v) => setLine({ ...line, gl_account_id: v }), 'Account')
          : <div className="grid gap-2">{venues.map((v) => <div key={v.id} className="grid grid-cols-[110px_1fr] items-center gap-3">
              <span className="truncate text-[13px]">{v.name}</span>
              {accountSelect(line.venue_accounts[v.id] ?? null, (a) => setLine({ ...line, venue_accounts: { ...line.venue_accounts, [v.id]: a } }), `Account for ${v.name}`)}
            </div>)}</div>}
      </Field>}
      <Field label="Applies to">
        <Select value={line.venue_id ?? 'all'} onValueChange={(v) => setLine({ ...line, venue_id: v === 'all' ? null : v })}><SelectTrigger aria-label="Applies to" className="h-10 text-[13px]"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All venues</SelectItem>{venues.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent></Select>
      </Field>
      <div className="flex items-center justify-between gap-3">
        {draft.some((l) => l.key === line.key) ? <button type="button" className="text-[13px] text-[#B45309]" onClick={remove}>Remove line</button> : <span />}
        <SaveBar dirty={!!line.printed_name.trim()} label="Done" onSave={done} onCancel={() => setLine(null)} />
      </div>
    </SettingsCard>;
  }

  // The date the new version starts.
  if (mode === 'date') return <SettingsCard title="When it starts" editing>
    <Field label="Starts on" hint="Days already in the books stay as posted" htmlFor="map-from"><Input id="map-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 max-w-[200px] text-[13px]" /></Field>
    <Field label="What changed" htmlFor="map-note"><Input id="map-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className="h-10 text-[13px]" /></Field>
    <SaveBar dirty={!!from} saving={saving} label="Save setup" onSave={() => void save()} onCancel={() => setMode('edit')} />
  </SettingsCard>;

  if (mode === 'history') return <SettingsCard title="History" action={<button type="button" className="settings-edit" onClick={() => setMode('view')}>Back</button>}>
    {versions.length ? <div className="kit sales-table-scroll" tabIndex={0} role="region" aria-label="Versions table"><table className="sales-table" aria-label="Versions">
      <thead><tr>{['Version', 'Starts on', 'Saved by', 'Lines', 'Saved on', 'What changed'].map((h, i) => <th key={h} scope="col" className={i === 3 ? 'sales-cell-right' : 'sales-cell-left'}>{h}</th>)}</tr></thead>
      <tbody>{versions.map((v) => <tr key={v.id} className="sales-record-row">
        <td className="sales-cell-left font-medium whitespace-nowrap">Version {v.version_no}</td>
        <td className="sales-cell-left whitespace-nowrap">{dayLabel(v.effective_from)}</td>
        <td className="sales-cell-left whitespace-nowrap">{v.created_by_name ?? '—'}</td>
        <td className="kit-num">{v.lines?.length ?? 0}</td>
        <td className="sales-cell-left whitespace-nowrap">{dayLabel(v.created_at.slice(0, 10))}</td>
        <td className="sales-cell-left truncate">{v.note ?? '—'}</td>
      </tr>)}</tbody></table></div> : <Empty>No versions yet.</Empty>}
  </SettingsCard>;

  const tabs = <div className="settings-tabs" role="tablist" aria-label="Venue">
    {[{ id: 'all', name: 'All venues' }, ...venues].map((v) => <button key={v.id} type="button" role="tab" aria-selected={scope === v.id} onClick={() => setScope(v.id)}>{v.name}</button>)}
  </div>;
  const summary = follows
    ? <>{venueName(scope)} follows All venues.{editing && <> <button type="button" className="kit-link" onClick={ownLines}>Give {venueName(scope)} its own lines</button></>}</>
    : editing
      ? <>{shown.length} {shown.length === 1 ? 'line' : 'lines'}{issues > 0 && <span className="text-[#B45309]"> · {issues} to finish</span>}{scope !== 'all' && <> · <button type="button" className="kit-link" onClick={useAll}>Use All venues instead</button></>}</>
      : current ? <>Version {current.version_no} · starts {dayLabel(current.effective_from)}{current.created_by_name ? ` · ${current.created_by_name}` : ''} · {shown.length} {shown.length === 1 ? 'line' : 'lines'}</> : 'Not set up yet';

  return <>
    {editing && recent.length > 0 && <SettingsCard title="Recent reports">
      <div className="kit sales-table-scroll" tabIndex={0} role="region" aria-label="Recent reports table"><table className="sales-table" aria-label="Recent reports"><tbody>
        {samples.map((s) => <tr key={s.r.id} className="sales-record-row"><td className="sales-cell-left whitespace-nowrap">{dayLabel(s.r.date)}</td><td className="sales-cell-left whitespace-nowrap">{s.r.venue}</td>
          <td className="sales-cell-left whitespace-nowrap"><span className={s.ok ? 'text-[#1F6B5E]' : 'text-[#B45309]'}>{s.ok ? '✓ ' : ''}{s.text}</span></td></tr>)}
      </tbody></table></div>
    </SettingsCard>}

    <SettingsCard title={editing ? 'Editing revenue setup' : 'Revenue setup'} action={editing
      ? <span className="flex gap-4 whitespace-nowrap"><button type="button" className="settings-edit" onClick={cancel}>Cancel</button><button type="button" className="settings-edit" disabled={!!issues || !draft.length} onClick={() => setMode('date')}>Next</button></span>
      : <span className="flex gap-4 whitespace-nowrap">{versions.length > 0 && <button type="button" className="settings-edit" onClick={() => setMode('history')}>History</button>}{canEdit && <button type="button" className="settings-edit" onClick={startEdit}>{lines.length ? 'Edit' : 'Set up'}</button>}</span>}>
      {venues.length > 1 && tabs}
      <p className="py-2 text-[13px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">{summary}</p>
      {(rows.length > 0 || unknown.length > 0) && <div className="kit sales-table-scroll" tabIndex={0} role="region" aria-label="Revenue setup table"><table className="sales-table" aria-label="Revenue setup">
        <thead><tr>{COLS.map((h) => <th key={h} scope="col" className="sales-cell-left">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((l) => {
            const tap = editing && !follows ? keyOpen(() => open(l)) : {};
            return <tr key={l.key} className="sales-record-row" {...tap}>
              <td className="sales-cell-left font-medium whitespace-nowrap" title={l.aliases.length ? `Also printed as ${l.aliases.join(', ')}` : undefined}>{l.printed_name}</td>
              <td className="sales-cell-left whitespace-nowrap">{l.kind ? typeLabel(l) : <span className="text-[#B45309]">Select type</span>}</td>
              <td className="sales-cell-left whitespace-nowrap">{methodLabel(l.method) ?? <span className="text-muted-foreground">—</span>}</td>
              <td className="sales-cell-left whitespace-nowrap">{settlesLabel(l, processors)}{l.processor_ids.length > 1 && <span className="text-muted-foreground"> · split by settlement</span>}</td>
              <td className="sales-cell-left whitespace-nowrap">{accountCell(l)}</td>
            </tr>;
          })}
          {unknown.map((n) => <tr key={`u-${n}`} className="sales-record-row" {...keyOpen(() => add(n))}>
            <td className="sales-cell-left font-medium whitespace-nowrap">{n}</td>
            <td className="sales-cell-left whitespace-nowrap"><span className="text-[#B45309]">Select type</span></td>
            <td className="sales-cell-left text-muted-foreground">—</td><td className="sales-cell-left text-muted-foreground">—</td><td className="sales-cell-left text-muted-foreground">—</td>
          </tr>)}
        </tbody></table></div>}
      {!rows.length && !unknown.length && !follows && <Empty>{editing ? 'No lines yet.' : canEdit ? 'Add the lines of the sales report and where each posts in the books.' : 'Not set up yet.'}</Empty>}
      {editing && !follows && <button type="button" className="kit-link mt-2 text-[13px]" onClick={() => add()}>+ Add line</button>}
    </SettingsCard>

    {!editing && holds.length > 0 && <SettingsCard title={`Held days · ${holds.length}`}>
      <div className="kit sales-table-scroll" tabIndex={0} role="region" aria-label="Held days table"><table className="sales-table" aria-label="Held days">
        <thead><tr>{['Date', 'Venue', 'Why'].map((h) => <th key={h} scope="col" className="sales-cell-left">{h}</th>)}</tr></thead>
        <tbody>{holds.map((h) => <tr key={`${h.day}-${h.venue}`} className="sales-record-row">
          <td className="sales-cell-left whitespace-nowrap">{dayLabel(h.day)}</td><td className="sales-cell-left whitespace-nowrap">{h.venue}</td>
          <td className="sales-cell-left whitespace-nowrap text-[#B45309]">{h.reasons.join(' · ')}</td></tr>)}</tbody>
      </table></div>
    </SettingsCard>}
  </>;
}

/** Other printed names for a line: small removable names and an Add field. */
function Aliases({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('');
  const add = () => { const t = text.trim(); if (t && !values.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...values, t]); setText(''); };
  return <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
    {values.map((v) => <span key={v} className="inline-flex items-center gap-1 text-[13px] whitespace-nowrap">{v}
      <button type="button" aria-label={`Remove ${v}`} className="text-muted-foreground hover:text-foreground" onClick={() => onChange(values.filter((x) => x !== v))}>×</button></span>)}
    <span className="inline-flex items-center gap-2"><Input aria-label="Another printed name" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="Another name" className="h-8 w-[160px] text-[13px]" />
      <button type="button" className="kit-link text-[13px]" disabled={!text.trim()} onClick={add}>Add</button></span>
  </div>;
}
