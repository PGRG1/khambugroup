import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { useAuth } from '@/hooks/useAuth';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SettingsCard, Field } from '@/components/settings/SettingsForm';
import { GROUPS } from '@/utils/purchasingSetup';
import { childrenOf, isOwn, missingLevels, pathOf, productCounts, toTidy, type CatRow, type ProductCats, type Tidy } from '@/utils/categoryTree';

// Settings › Categories: Bani's master list plus the client's own (master_id null, marked Yours). Products choose
// from here. Anyone who manages Settings adds a Level 2 or 3; a new Level 1 needs a group and an account, so only
// Bani or Approve on Finance adds one (add_client_level1). To tidy merges a category into another (merge_product_category).

const amber = 'text-[#B45309]';

export function ClientCategories() {
  const { tenantId } = useActiveTenant();
  const { isAdmin } = useAuth();
  const { isPreviewActive } = usePreviewMode();
  const { isPlatformAdmin: bani } = usePlatformAdmin();
  const [rows, setRows] = useState<CatRow[]>([]);
  const [products, setProducts] = useState<ProductCats[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [finance, setFinance] = useState(0);
  const [buying, setBuying] = useState(0);
  const [loading, setLoading] = useState(true);
  const [l1, setL1] = useState<string | null>(null);
  const [l2, setL2] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ level: 1 | 2 | 3; parent: string | null } | null>(null);
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [account, setAccount] = useState('');
  const [merge, setMerge] = useState<Tidy | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const db = supabase as any;
    const prods: ProductCats[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from('product_master').select('level1_category,level2_category,level3_category').eq('tenant_id', tenantId).range(from, from + 999);
      prods.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const [cats, coa, fin, buy] = await Promise.all([
      db.from('product_categories').select('id,name,level,parent_id,master_id,is_active').eq('tenant_id', tenantId),
      db.from('chart_of_accounts').select('id,code,name').eq('tenant_id', tenantId).eq('is_active', true).order('code'),
      bani ? Promise.resolve({ data: 3 }) : db.rpc('access_level', { t: tenantId, area: 'finance' }),
      bani ? Promise.resolve({ data: 3 }) : db.rpc('access_level', { t: tenantId, area: 'purchasing' }),
    ]);
    setRows(cats.data ?? []); setProducts(prods); setAccounts(coa.data ?? []);
    setFinance(Number(fin.data ?? 0)); setBuying(Number(buy.data ?? 0));
    setLoading(false);
  }, [tenantId, bani]);
  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => productCounts(rows, products), [rows, products]);
  const tidy = useMemo(() => toTidy(rows, counts), [rows, counts]);
  const missing = useMemo(() => missingLevels(products), [products]);
  const level1 = childrenOf(rows, null, 1);
  const pick1 = level1.find((r) => r.id === l1) ?? level1[0];
  const level2 = pick1 ? childrenOf(rows, pick1.id, 2) : [];
  const pick2 = level2.find((r) => r.id === l2) ?? level2[0];
  const level3 = pick2 ? childrenOf(rows, pick2.id, 3) : [];

  const live = !isPreviewActive;
  const canAdd = live && (bani || isAdmin);
  const canAddL1 = live && (bani || finance >= 3);
  const canTidy = live && (bani || finance >= 3 || buying >= 3);

  const openAdd = (level: 1 | 2 | 3, parent: string | null) => { setName(''); setGroup(''); setAccount(''); setAdding({ level, parent }); };
  const add = async () => {
    if (!tenantId || !adding || !name.trim()) return;
    setBusy(true);
    const db = supabase as any;
    const { error } = adding.level === 1
      ? await db.rpc('add_client_level1', { p_tenant: tenantId, p_name: name.trim(), p_group: group, p_account: account || null })
      : await db.from('product_categories').insert({ tenant_id: tenantId, name: name.trim(), level: adding.level, parent_id: adding.parent, is_active: true });
    setBusy(false);
    if (error) { toast.error(error.code === '23505' ? `${name.trim()} already exists` : error.message); return; }
    toast.success(`${name.trim()} added`);
    setAdding(null); void load();
  };
  const doMerge = async () => {
    if (!tenantId || !merge) return;
    setBusy(true);
    const { data, error } = await (supabase as any).rpc('merge_product_category', { p_tenant: tenantId, p_from: merge.from.id, p_into: merge.into.id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${merge.from.name} merged into ${merge.into.name} · ${data ?? 0} products moved`);
    setMerge(null); void load();
  };

  const column = (title: string, list: CatRow[], on: CatRow | undefined, pick: ((id: string) => void) | null, level: 1 | 2 | 3, parent: string | null, allowed: boolean) =>
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis pb-2">{title}</p>
      <ul className="divide-y divide-border border-y border-border">
        {list.map((r) => <li key={r.id}>
          <button type="button" disabled={!pick} onClick={() => pick?.(r.id)} aria-current={pick && on?.id === r.id ? 'true' : undefined}
            className={`w-full h-11 px-2 flex items-center gap-2 text-left text-[13px] ${pick && on?.id === r.id ? 'bg-muted/60 font-medium' : ''}`}>
            <span className="min-w-0 flex-1 truncate" title={r.name}>{r.name}</span>
            {isOwn(r) && <span className="text-[12px] text-muted-foreground whitespace-nowrap">Yours</span>}
            <span className="text-[12px] text-muted-foreground tabular-nums whitespace-nowrap">{counts.get(r.id) ?? 0}</span>
          </button>
        </li>)}
        {!list.length && <li className="h-11 px-2 flex items-center text-[13px] text-muted-foreground">None yet</li>}
      </ul>
      {allowed && <button type="button" className="settings-edit mt-2" onClick={() => openAdd(level, parent)}>Add</button>}
    </div>;

  const pathText = (r: CatRow) => pathOf(rows, r).join(' › ');

  return <>
    <SettingsCard title="Categories">
      <p className="pb-3 text-[13px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">Bani's master list plus your own · products choose from here</p>
      {loading ? <p className="text-[13px] text-muted-foreground">Loading categories…</p>
        : <div className="grid gap-4 sm:grid-cols-3">
          {column('Level 1', level1, pick1, (id) => { setL1(id); setL2(null); }, 1, null, canAddL1)}
          {column(pick1 ? `Level 2 · ${pick1.name}` : 'Level 2', level2, pick2, setL2, 2, pick1?.id ?? null, canAdd && !!pick1)}
          {column(pick2 ? `Level 3 · ${pick2.name}` : 'Level 3', level3, undefined, null, 3, pick2?.id ?? null, canAdd && !!pick2)}
        </div>}
    </SettingsCard>

    {!loading && (tidy.length > 0 || missing.noLevel1 + missing.noLevel2 > 0) && <SettingsCard title={`To tidy · ${tidy.length + (missing.noLevel1 ? 1 : 0) + (missing.noLevel2 ? 1 : 0)}`}>
      {tidy.length > 0 && <div className="kit sales-table-scroll" tabIndex={0} role="region" aria-label="Categories to merge"><table className="sales-table" aria-label="Categories to merge">
        <thead><tr>{['Category', 'Same as', 'Products', ''].map((h, i) => <th key={i} scope="col" className={i === 2 ? 'sales-cell-right' : 'sales-cell-left'}>{h}</th>)}</tr></thead>
        <tbody>{tidy.map((t) => <tr key={t.from.id + t.into.id} className="sales-record-row">
          <td className="sales-cell-left font-medium whitespace-nowrap">{pathText(t.from)}</td>
          <td className="sales-cell-left whitespace-nowrap">{pathText(t.into)}</td>
          <td className="kit-num">{t.products}</td>
          <td className="sales-cell-left whitespace-nowrap">{canTidy && <button type="button" className="settings-edit" onClick={() => setMerge(t)}>Merge</button>}</td>
        </tr>)}</tbody></table></div>}
      {missing.noLevel1 > 0 && <p className={`pt-3 text-[13px] whitespace-nowrap ${amber}`}>{missing.noLevel1} {missing.noLevel1 === 1 ? 'product has' : 'products have'} no category · set it in Products</p>}
      {missing.noLevel2 > 0 && <p className={`pt-2 text-[13px] whitespace-nowrap ${amber}`}>{missing.noLevel2} {missing.noLevel2 === 1 ? 'product has' : 'products have'} no Level 2 · set it in Products</p>}
    </SettingsCard>}

    <Dialog open={!!adding} onOpenChange={(o) => !o && setAdding(null)}>
      <DialogContent className="!bg-card !backdrop-blur-none">
        <DialogHeader><DialogTitle>New Level {adding?.level}</DialogTitle>
          <DialogDescription>{adding?.level === 1 ? 'A Level 1 needs a group and the account it posts to.' : `Under ${rows.find((r) => r.id === adding?.parent)?.name ?? ''}`}</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Field label="Name" htmlFor="cat-name"><Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} className="h-10 text-[13px]" /></Field>
          {adding?.level === 1 && <>
            <Field label="Group"><Select value={group} onValueChange={setGroup}><SelectTrigger className="h-10 text-[13px]"><SelectValue placeholder="Select group" /></SelectTrigger>
              <SelectContent>{GROUPS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Account"><Select value={account} onValueChange={setAccount}><SelectTrigger className="h-10 text-[13px]"><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} {a.name}</SelectItem>)}</SelectContent></Select></Field>
          </>}
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setAdding(null)}>Cancel</Button>
          <Button disabled={busy || !name.trim() || (adding?.level === 1 && (!group || !account))} onClick={() => void add()}>{busy ? 'Adding…' : 'Add'}</Button>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={!!merge} onOpenChange={(o) => !o && setMerge(null)}>
      <DialogContent className="!bg-card !backdrop-blur-none">
        <DialogHeader><DialogTitle>Merge categories?</DialogTitle><DialogDescription>{merge && `${pathText(merge.from)} → ${pathText(merge.into)}`}</DialogDescription></DialogHeader>
        <p className="text-[13px]">{merge?.products ?? 0} products and any categories under it move to {merge?.into.name}. Invoices already in the books do not change. The change is recorded in the Activity log.</p>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setMerge(null)}>Cancel</Button>
          <Button disabled={busy} onClick={() => void doMerge()}>{busy ? 'Merging…' : 'Merge'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
