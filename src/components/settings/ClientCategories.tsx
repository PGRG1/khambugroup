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
import { GROUPS, groupLabel } from '@/utils/purchasingSetup';
import { useIsMobile } from '@/hooks/use-mobile';
import { ChevronDown, ChevronRight } from 'lucide-react';
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
  const [products, setProducts] = useState<(ProductCats & { financial_treatment?: string | null })[]>([]);
  const [rules, setRules] = useState<{ rule_type: string; match_key: string; account_id: string }[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<CatRow | null>(null);
  const isMobile = useIsMobile();
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
      const { data } = await db.from('product_master').select('level1_category,level2_category,level3_category,financial_treatment').eq('tenant_id', tenantId).range(from, from + 999);
      prods.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const [cats, coa, fin, buy, rl] = await Promise.all([
      db.from('product_categories').select('id,name,level,parent_id,master_id,is_active').eq('tenant_id', tenantId),
      db.from('chart_of_accounts').select('id,code,name').eq('tenant_id', tenantId).eq('is_active', true).order('code'),
      bani ? Promise.resolve({ data: 3 }) : db.rpc('access_level', { t: tenantId, area: 'finance' }),
      bani ? Promise.resolve({ data: 3 }) : db.rpc('access_level', { t: tenantId, area: 'purchasing' }),
      db.from('account_mapping_rules').select('rule_type,match_key,account_id').eq('tenant_id', tenantId).in('rule_type', ['procurement_category', 'procurement_category_venue']),
    ]);
    setRules(rl.data ?? []);
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

  // One table that opens like folders: top categories first; a row's arrow shows what is under it.
  const tidyFrom = useMemo(() => new Map(tidy.map((t) => [t.from.id, t])), [tidy]);
  const groupAndAccount = useMemo(() => {
    const out = new Map<string, { group: string | null; account: string | null }>();
    const label = (id: string) => { const a = accounts.find((x) => x.id === id); return a ? `${a.code} ${a.name}` : null; };
    for (const c of level1) {
      const rule = rules.find((x) => x.rule_type === 'procurement_category' && x.match_key.split('__').slice(1).join('__') === c.name);
      const venue = rules.find((x) => x.rule_type === 'procurement_category_venue' && x.match_key.split('__')[1] === c.name);
      const used = new Map<string, number>();
      for (const p of products) if ((p.level1_category ?? '').trim() === c.name && p.financial_treatment) used.set(p.financial_treatment, (used.get(p.financial_treatment) ?? 0) + 1);
      const g = rule?.match_key.split('__')[0] ?? venue?.match_key.split('__')[0] ?? [...used.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      out.set(c.id, { group: g ? groupLabel(g) ?? g : null, account: rule ? label(rule.account_id) : venue ? 'By venue' : null });
    }
    return out;
  }, [level1, rules, products, accounts]);
  const under = (id: string): CatRow[] => { const kids = rows.filter((r) => r.parent_id === id && r.is_active !== false); return kids.flatMap((k) => [k, ...under(k.id)]); };
  const tidyBelow = (id: string) => [rows.find((r) => r.id === id)!, ...under(id)].filter((r) => r && tidyFrom.has(r.id)).length;
  const needle = q.trim().toLowerCase();
  const visible = useMemo(() => {
    const out: CatRow[] = [];
    const matches = (c: CatRow): boolean => c.name.toLowerCase().includes(needle) || under(c.id).some((k) => k.name.toLowerCase().includes(needle));
    const walk = (parent: string | null, level: 1 | 2 | 3) => {
      for (const c of childrenOf(rows, parent, level)) {
        if (needle && !matches(c)) continue;
        out.push(c);
        if (level < 3 && (needle || open.has(c.id))) walk(c.id, (level + 1) as 2 | 3);
      }
    };
    walk(null, 1);
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, open, needle]);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOpen = open.size > 0;
  const toggleAll = () => setOpen(allOpen ? new Set() : new Set(rows.filter((r) => r.level < 3).map((r) => r.id)));

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
      {loading ? <p className="text-[13px] text-muted-foreground">Loading categories…</p> : <>
        <p className="pb-3 text-[13px] text-muted-foreground tabular-nums whitespace-nowrap overflow-hidden text-ellipsis">
          {level1.length} categories · {rows.filter((r) => r.is_active !== false).length} with sub-categories
          {tidy.length > 0 && <> · <span className={amber}>{tidy.length} to tidy</span></>}
          {missing.noLevel1 > 0 && <> · <span className={amber}>{missing.noLevel1} {missing.noLevel1 === 1 ? 'product has' : 'products have'} no category</span></>}
        </p>
        <div className="flex items-center gap-2 pb-3">
          <button type="button" className="text-[13px] text-[#2F5E5A] whitespace-nowrap" onClick={toggleAll}>{allOpen ? 'Close all' : 'Expand all'}</button>
          <span className="flex-1" />
          <Input aria-label="Search categories" placeholder="Search categories" value={q} onChange={(e) => setQ(e.target.value)} className={`h-9 text-[13px] ${isMobile ? 'w-[160px]' : 'w-[260px]'}`} />
          {canAddL1 && <Button size="sm" className="h-9 whitespace-nowrap" onClick={() => openAdd(1, null)}>{isMobile ? 'Add' : 'Add category'}</Button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]" aria-label="Categories">
            <thead className="border-y border-border text-[12px] text-muted-foreground">
              <tr>
                <th className="h-10 pr-3 text-left font-normal">Category</th>
                {!isMobile && <th className="pr-3 text-left font-normal">Level</th>}
                {!isMobile && <th className="pr-3 text-left font-normal">Group</th>}
                {!isMobile && <th className="pr-3 text-left font-normal">Account</th>}
                <th className="pr-3 text-right font-normal">Products</th>
                {!isMobile && <th className="text-left font-normal">Tidy</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const ga = c.level === 1 ? groupAndAccount.get(c.id) : undefined;
                const hasKids = c.level < 3 && rows.some((r) => r.parent_id === c.id && r.is_active !== false);
                const t = tidyFrom.get(c.id);
                const below = c.level < 3 && !open.has(c.id) && !needle ? tidyBelow(c.id) - (t ? 1 : 0) : 0;
                const tidyText = t ? `Same as ${t.into.name}` : below > 0 ? `${below} to tidy` : '';
                const n = counts.get(c.id) ?? 0;
                return <tr key={c.id} className="h-11 cursor-pointer whitespace-nowrap border-b border-border/50 hover:bg-muted/40" onClick={() => setPicked(c)}>
                  <td className="pr-3">
                    <span className="flex items-center" style={{ paddingLeft: (c.level - 1) * 24 }}>
                      {hasKids
                        ? <button type="button" aria-label={open.has(c.id) ? `Close ${c.name}` : `Open ${c.name}`} aria-expanded={open.has(c.id) || !!needle} className="mr-1 grid h-6 w-5 place-items-center text-muted-foreground" onClick={(e) => { e.stopPropagation(); toggle(c.id); }}>
                            {open.has(c.id) || needle ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          </button>
                        : <span className="mr-1 w-5" />}
                      <span className={`truncate ${c.level === 1 ? 'font-medium' : ''}`} style={{ maxWidth: 'var(--bani-name-max)' }} title={pathText(c)}>{c.name}</span>
                      {isOwn(c) && <span className="ml-1.5 text-[12px] text-muted-foreground">Yours</span>}
                      {isMobile && (tidyText || (ga && !ga.account)) && <span className={`ml-2 text-[12px] ${amber}`}>{tidyText || 'No account'}</span>}
                    </span>
                  </td>
                  {!isMobile && <td className="pr-3 text-[12px] text-muted-foreground tabular-nums">{c.level}</td>}
                  {!isMobile && <td className="pr-3 text-muted-foreground">{ga ? ga.group ?? '—' : ''}</td>}
                  {!isMobile && <td className={`pr-3 ${ga && !ga.account ? amber : 'text-muted-foreground'}`}>{ga ? ga.account ?? 'No account' : ''}</td>}
                  <td className={`td-num pr-3 text-right ${n === 0 ? 'text-muted-foreground' : ''}`}>{n}</td>
                  {!isMobile && <td className={amber}>{tidyText}</td>}
                </tr>;
              })}
              {!visible.length && <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">No categories found.</td></tr>}
            </tbody>
          </table>
        </div>
      </>}
    </SettingsCard>

    <Dialog open={!!picked} onOpenChange={(o) => !o && setPicked(null)}>
      <DialogContent className="!bg-card !backdrop-blur-none">
        <DialogHeader><DialogTitle>{picked?.name}</DialogTitle>
          <DialogDescription>{picked && `${pathText(picked)} · Level ${picked.level} · ${counts.get(picked.id) ?? 0} products${isOwn(picked) ? ' · Yours' : ''}`}</DialogDescription></DialogHeader>
        {picked?.level === 1 && <p className="text-[13px]">{groupAndAccount.get(picked.id)?.group ?? 'No group'} · {groupAndAccount.get(picked.id)?.account ?? <span className={amber}>No account</span>}. Group and account are set in Purchasing setup.</p>}
        {picked && tidyFrom.has(picked.id) && <p className={`text-[13px] ${amber}`}>Looks the same as {pathText(tidyFrom.get(picked.id)!.into)}.</p>}
        <div className="flex flex-wrap gap-2 justify-end">
          {picked && tidyFrom.has(picked.id) && canTidy && <Button variant="outline" onClick={() => { setMerge(tidyFrom.get(picked.id)!); setPicked(null); }}>Merge into {tidyFrom.get(picked.id)!.into.name}</Button>}
          {picked && picked.level < 3 && canAdd && <Button variant="outline" onClick={() => { const p = picked; setPicked(null); openAdd((p.level + 1) as 2 | 3, p.id); }}>Add Level {picked.level + 1} under it</Button>}
          <Button onClick={() => setPicked(null)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>

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
