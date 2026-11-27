import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSupplierDirectory } from '@/hooks/useSupplierDirectory';
import { useCanEditItemList } from '@/hooks/useCanEditItemList';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import { useAuth } from '@/hooks/useAuth';
import { PageTop } from '@/components/kit/PageTop';
import { Toolbar } from '@/components/kit/Toolbar';
import { PhoneRow } from '@/components/finance/accounting/AccountingKit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { hongKongDate } from '@/utils/purchasingOverview';
import { formatTableInteger } from '@/utils/format';
import { rangeLabel, rebateProgress, type Rebate } from '@/utils/supplierRebates';
import '@/components/kit/kit.css';

// Purchasing › Deals: every supplier rebate and item deal in one list. Deals are set up only in Settings › Master data
// (Rebate column on Suppliers & vendors, Deal column on Products); this page tracks them and records a rebate received,
// as a credit note (an approved supplier credit note) or a payment (record_rebate_received).

type ItemDeal = { id: string; product_id: string; supplier_id: string; deal_type: string; buy_qty: number | null; free_qty: number | null; discount_percent: number | null; special_price: number | null; valid_from: string | null; valid_until: string | null; is_active: boolean };
type Receipt = { rebate_id: string; period_from: string; amount: number };
type Row = { key: string; kind: 'rebate' | 'buy' | 'discount'; supplier: string; deal: string; target: string; value: string; period: string; pct: number | null; live: boolean;
  status: 'progress' | 'earned' | 'received' | 'ending' | 'none'; note: string; rebate?: Rebate; earned?: number; from?: string; to?: string; spent?: number };

const money = (n: number) => `HK$${Math.round(n).toLocaleString('en-HK')}`;
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export default function Deals() {
  const dir = useSupplierDirectory();
  const tenantId = dir.tenantId;
  const { isAdmin } = useAuth();
  const { isPreviewActive } = usePreviewMode();
  const canEdit = useCanEditItemList() === true;
  const canRecord = (isAdmin || canEdit) && !isPreviewActive;
  const today = hongKongDate();
  const [search, setSearch] = useState(''), [status, setStatus] = useState('active'), [type, setType] = useState('all'), [supplier, setSupplier] = useState('all');
  const [earnedOnly, setEarnedOnly] = useState(false);
  const [rec, setRec] = useState<{ row: Row; as: 'credit_note' | 'payment'; amount: string; date: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const q = useQuery({ queryKey: ['deals-page', tenantId], enabled: !!tenantId, queryFn: async () => {
    const db = supabase as any;
    const [r, d, x] = await Promise.all([
      db.from('supplier_rebates').select('*').eq('tenant_id', tenantId),
      db.from('item_supplier_deals').select('id, product_id, supplier_id, deal_type, buy_qty, free_qty, discount_percent, special_price, valid_from, valid_until, is_active').eq('tenant_id', tenantId),
      db.from('supplier_rebate_receipts').select('rebate_id, period_from, amount').eq('tenant_id', tenantId),
    ]);
    if (r.error || d.error || x.error) throw r.error || d.error || x.error;
    return { rebates: (r.data ?? []) as Rebate[], deals: (d.data ?? []) as ItemDeal[], receipts: (x.data ?? []) as Receipt[] };
  } });

  const rows = useMemo<Row[]>(() => {
    const dirRows: any[] = dir.data?.rows ?? [];
    const nameOf = (id: string) => dirRows.find((r) => r.id === id || r.ids?.has?.(id))?.name ?? dir.data?.suppliers.find((s) => s.id === id)?.name ?? '—';
    const idsOf = (id: string) => { const r = dirRows.find((x) => x.id === id || x.ids?.has?.(id)); return r?.ids instanceof Set ? r.ids : new Set([id]); };
    const spend = ((dir.data?.invoices ?? []) as any[]).filter((i) => i.review_status === 'Approved' || i.review_status === 'Disputed').map((i) => ({ supplier_id: i.supplier_id, date: String(i.invoice_date), total: Number(i.total_amount ?? 0) }));
    const products = dir.data?.products;
    const out: Row[] = [];
    for (const rb of q.data?.rebates ?? []) {
      const p = rebateProgress(rb, spend, idsOf(rb.supplier_id), today);
      const got = (q.data?.receipts ?? []).filter((x) => x.rebate_id === rb.id && x.period_from === p.from).reduce((n, x) => n + Number(x.amount), 0);
      const live = rb.is_active && rb.starts_on <= today;
      const received = got > 0 && got >= p.amount - 0.005 && p.earned;
      out.push({ key: `r${rb.id}`, kind: 'rebate', supplier: nameOf(rb.supplier_id), deal: 'Rebate', target: `${money(rb.threshold)} spend`,
        value: rb.basis === 'percent' ? `${rb.value}% · ${money((p.earned ? p.spent : rb.threshold) * rb.value / 100)}` : money(rb.value),
        period: rangeLabel(p.from, p.to), pct: p.pct, live, status: received ? 'received' : p.earned ? 'earned' : 'progress',
        note: `${money(p.spent)} of ${money(rb.threshold)}`, rebate: rb, earned: Math.round((p.amount - got) * 100) / 100, from: p.from, to: p.to, spent: p.spent });
    }
    for (const d of q.data?.deals ?? []) {
      const live = d.is_active && (!d.valid_from || d.valid_from <= today) && (!d.valid_until || d.valid_until >= today);
      const left = d.valid_until ? days(today, d.valid_until) : null;
      const buy = d.deal_type !== 'discount';
      const free = Number(d.free_qty ?? 0);
      out.push({ key: `d${d.id}`, kind: buy ? 'buy' : 'discount', supplier: nameOf(d.supplier_id), deal: buy ? `Buy ${Number(d.buy_qty)} get ${free}` : 'Discount',
        target: products?.get(d.product_id)?.internal_product_name ?? '—',
        value: buy ? `${free} free unit${free === 1 ? '' : 's'}` : d.special_price != null ? `Special price ${money(d.special_price)}` : `${Number(d.discount_percent)}% off`,
        period: d.valid_from && d.valid_until ? rangeLabel(d.valid_from, d.valid_until) : d.valid_until ? `To ${rangeLabel(d.valid_until, d.valid_until).split(' – ')[1]}` : d.valid_from ? `From ${rangeLabel(d.valid_from, d.valid_from).split(' – ')[1]}` : 'No end date',
        pct: null, live, status: live && left != null && left <= 7 ? 'ending' : 'none', note: left === 0 ? 'Ends today' : left != null ? `Ends in ${left} day${left === 1 ? '' : 's'}` : '' });
    }
    const order = { earned: 0, progress: 1, ending: 1, none: 2, received: 3 };
    return out.sort((a, b) => Number(b.live) - Number(a.live) || order[a.status] - order[b.status] || a.supplier.localeCompare(b.supplier));
  }, [q.data, dir.data, today]);

  const suppliers = [...new Set(rows.map((r) => r.supplier))].sort();
  const s = search.trim().toLowerCase();
  const shown = rows.filter((r) => (status === 'all' || (status === 'active' ? r.live : !r.live)) && (type === 'all' || r.kind === type) && (supplier === 'all' || r.supplier === supplier)
    && (!earnedOnly || r.status === 'earned') && (!s || `${r.supplier} ${r.deal} ${r.target}`.toLowerCase().includes(s)));
  const live = rows.filter((r) => r.live);
  const n = (k: Row['kind']) => live.filter((r) => r.kind === k).length;
  const earnedN = rows.filter((r) => r.status === 'earned').length;

  const open = (row: Row) => setRec({ row, as: 'credit_note', amount: String(row.earned ?? ''), date: today });
  async function record() {
    if (!rec?.row.rebate) return;
    const amt = Number(rec.amount);
    if (!(amt > 0)) { toast.error('Enter the amount'); return; }
    if (!rec.date) { toast.error('Enter the date'); return; }
    setBusy(true);
    const { error } = await (supabase as any).rpc('record_rebate_received', { p_rebate: rec.row.rebate.id, p_as: rec.as, p_amount: amt, p_date: rec.date, p_from: rec.row.from, p_to: rec.row.to });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(rec.as === 'credit_note' ? 'Rebate recorded · credit note added' : 'Rebate recorded');
    setRec(null); void q.refetch();
  }

  const last = (r: Row) => r.status === 'earned' ? (canRecord ? <button type="button" className="kit-link" onClick={() => open(r)}>Record received</button> : <span className="text-[#2F7A5E]">Earned</span>)
    : r.status === 'received' ? <span className="text-muted-foreground">Received</span>
    : r.status === 'ending' ? <span className="text-[#B45309]">{r.note}</span>
    : r.kind === 'rebate' ? r.note : '';
  const bar = (p: number) => <span className="inline-flex items-center gap-2"><span className="relative inline-block h-1.5 w-[90px] rounded-full bg-[#E3E8E5]"><span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(p, 100)}%`, background: p >= 100 ? '#2F7A5E' : '#7FB49E' }} /></span>{p}%</span>;
  const field = (label: string, el: React.ReactNode) => <div><label className="mb-1.5 block text-[13px] text-muted-foreground">{label}</label>{el}</div>;
  const pick = (on: boolean) => `text-left rounded-lg border px-3 py-2 text-[13px] font-medium ${on ? 'border-[rgba(31,107,94,0.35)] bg-[rgba(31,107,94,0.08)]' : 'border-border bg-white'}`;

  return <div className="w-full mx-auto space-y-4">
    <PageTop tabsAbove title="Deals" actions={<span className="text-[13px] text-muted-foreground whitespace-nowrap">Set up in Settings › Master data</span>} />
    <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Deals">
      <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5"><span>{formatTableInteger(live.length)} {live.length === 1 ? 'deal' : 'deals'}</span>
        <span className="text-[13px] text-muted-foreground font-normal whitespace-nowrap">· {n('rebate')} rebate{n('rebate') === 1 ? '' : 's'} · {n('buy')} Buy X get Y · {n('discount')} discount{n('discount') === 1 ? '' : 's'}</span></h2>
      <Toolbar search={search} onSearch={setSearch} placeholder="Search deals" searchAfterControls mobileSearchBelow filter={<div className="flex gap-2">
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-9 w-28 rounded-full" aria-label="Status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="ended">Ended</SelectItem><SelectItem value="all">All</SelectItem></SelectContent></Select>
        <Select value={type} onValueChange={setType}><SelectTrigger className="h-9 w-36 rounded-full" aria-label="Type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem><SelectItem value="rebate">Rebates</SelectItem><SelectItem value="buy">Buy X get Y</SelectItem><SelectItem value="discount">Discounts</SelectItem></SelectContent></Select>
        <Select value={supplier} onValueChange={setSupplier}><SelectTrigger className="h-9 w-44 rounded-full" aria-label="Supplier"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All suppliers</SelectItem>{suppliers.map((x) => <SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>
      </div>} />
      {q.isError && <p className="px-1 text-sm text-destructive">Could not load deals.</p>}
      {earnedN > 0 && <p className="px-1 text-[13px] whitespace-nowrap"><b className="font-semibold">{earnedN} rebate{earnedN === 1 ? '' : 's'} earned, not received</b> · <button type="button" className="kit-link" onClick={() => setEarnedOnly((v) => !v)}>{earnedOnly ? 'Show all' : 'Show'}</button></p>}
      <ul className="min-[768px]:hidden kit">{shown.map((r) => <PhoneRow key={r.key} title={`${r.supplier} · ${r.deal}`} amount={r.value} sub={r.status === 'earned' ? 'Earned · tap to record' : `${r.target} · ${r.period}`} tone={r.status === 'earned' ? 'ok' : r.status === 'ending' ? 'amber' : 'mut'} onOpen={r.status === 'earned' && canRecord ? () => open(r) : undefined} />)}</ul>
      <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Deals table"><table className="sales-table" aria-label="Deals">
        <thead><tr>{['Supplier', 'Deal', 'Target / Item', 'Value', 'Period', 'Progress'].map((h) => <th key={h} scope="col" className="sales-cell-left">{h}</th>)}<th scope="col" className="sales-cell-right"><span className="sr-only">Status</span></th></tr></thead>
        <tbody>{shown.map((r) => <tr key={r.key} className={`sales-record-row ${r.live ? '' : 'sales-closed-row'}`}>
          <td className="sales-cell-left font-medium" title={r.supplier}>{r.supplier}</td>
          <td className="sales-cell-left whitespace-nowrap">{r.deal}</td>
          <td className="sales-cell-left" title={r.target}>{r.target}</td>
          <td className="sales-cell-left whitespace-nowrap">{r.value}</td>
          <td className="sales-cell-left whitespace-nowrap">{r.period}</td>
          <td className="sales-cell-left whitespace-nowrap">{r.pct == null ? '—' : bar(r.pct)}</td>
          <td className="sales-cell-right whitespace-nowrap">{last(r)}</td>
        </tr>)}</tbody></table></div>
      {!shown.length && <p className="p-10 text-center text-sm text-muted-foreground">{q.isPending || dir.isPending ? 'Loading deals…' : rows.length ? 'Nothing matches your search or filters.' : 'No deals yet. Set them up in Settings › Master data.'}</p>}
    </section>

    <Dialog open={!!rec} onOpenChange={(o) => !o && !busy && setRec(null)}>
      <DialogContent className="!bg-card !backdrop-blur-none">
        <DialogHeader><DialogTitle>Rebate received · {rec?.row.supplier}</DialogTitle>
          <DialogDescription>Earned {money(rec?.row.earned ?? 0)} · Spend {money(rec?.row.spent ?? 0)} of {money(rec?.row.rebate?.threshold ?? 0)}</DialogDescription></DialogHeader>
        {rec && <div className="space-y-3.5">
          {field('Received as', <div className="grid grid-cols-2 gap-2">{([['credit_note', 'Credit note'], ['payment', 'Payment']] as const).map(([k, t]) => <button key={k} type="button" aria-pressed={rec.as === k} className={pick(rec.as === k)} onClick={() => setRec({ ...rec, as: k })}>{t}</button>)}</div>)}
          <div className="grid grid-cols-2 gap-3">
            {field('Amount', <Input className="h-10 text-[14px]" inputMode="decimal" value={rec.amount} onChange={(e) => setRec({ ...rec, amount: e.target.value })} />)}
            {field('Date', <Input type="date" className="h-10 text-[14px]" value={rec.date} onChange={(e) => setRec({ ...rec, date: e.target.value })} />)}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button variant="outline" className="ml-auto rounded-full" disabled={busy} onClick={() => setRec(null)}>Cancel</Button>
            <Button className="rounded-full bg-[#1F6B5E] text-white hover:bg-[#1A5C51]" disabled={busy} onClick={() => void record()}>{busy ? 'Saving…' : 'Record'}</Button>
          </div>
        </div>}
      </DialogContent>
    </Dialog>
  </div>;
}
