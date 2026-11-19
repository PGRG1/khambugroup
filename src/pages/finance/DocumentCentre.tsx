import { shortMoney } from '@/utils/revenueOverview';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFinancialDocuments } from '@/hooks/useFinancialDocuments';
import { usePagePeriod } from '@/hooks/usePagePeriod';
import { useVenueScope } from '@/hooks/useVenueScope';
import { useFloatingBaniAttach } from '@/components/assistant/FloatingBaniContext';
import { PageTop } from '@/components/kit/PageTop';
import { Toolbar } from '@/components/kit/Toolbar';
import { QuickFilter } from '@/components/kit/QuickFilter';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { formatTableInteger } from '@/utils/format';
import { shortDay } from '@/utils/salesRecordChecks';
import { supabase } from '@/integrations/supabase/client';
import { storedPath, type FinancialDocument } from '@/utils/financialDocuments';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { downloadCSV } from '@/utils/csvDownload';
import { toast } from 'sonner';
import { Hero, Section, PhoneRow, Note, Empty, Pager, keyOpen } from '@/components/finance/accounting/AccountingKit';

const PAGE = 25;

// Documents: every stored file behind the books (invoices, bills, statements, Z reports, receipts),
// newest first, each with what it belongs to. Upload hands files to Bani, who reads and files them.
export default function DocumentCentre() {
  const data = useFinancialDocuments(), period = usePagePeriod(data.documents.map(d => d.date), 'mtd'), scope = useVenueScope(), attach = useFloatingBaniAttach();
  const file = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState(''), [type, setType] = useState('all'), [page, setPage] = useState(1);
  const [viewer, setViewer] = useState<{ name: string; url: string; pdf: boolean } | null>(null);
  const inScope = data.documents.filter(d => period.inPeriod(d.date) && ((!d.venue && !d.venueId) || scope.includesId(d.venueId) || scope.includesName(d.venue)));
  const types = [...new Set(inScope.map(d => d.type))].map(t => ({ t, n: inScope.filter(d => d.type === t).length })).sort((a, b) => b.n - a.n);
  const filtered = inScope.filter(d => (type === 'all' || d.type === type) && `${d.name} ${d.type} ${d.record}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE)), current = Math.min(page, pages), rows = filtered.slice((current - 1) * PAGE, current * PAGE);

  async function open(d: FinancialDocument) {
    const path = storedPath(d.path, d.bucket);
    if (!path) { toast.error('This older file link needs checking in its source record'); return; }
    const { data: s, error } = await supabase.storage.from(d.bucket).createSignedUrl(path, 60);
    if (error || !s?.signedUrl) { toast.error(error?.message ?? 'Document unavailable'); return; }
    setViewer({ name: d.name, url: s.signedUrl, pdf: /\.pdf(?:$|\?)/i.test(path) });
  }
  const download = () => downloadCSV(filtered.map(d => ({ date: d.date?.slice(0, 10) ?? '', file: d.name, kind: d.type, record: d.record })), [{ key: 'date', label: 'Date' }, { key: 'file', label: 'File' }, { key: 'kind', label: 'Kind' }, { key: 'record', label: 'Belongs to' }], 'documents');
  const upload = <Button size="sm" className="h-10" onClick={() => file.current?.click()}><Upload className="h-4 w-4" />Upload</Button>;

  return <div className="min-w-0 space-y-5 max-sm:space-y-3">
    <PageTop tabsAbove title="Documents" period={period.control} actions={upload} />
    <input ref={file} type="file" className="hidden" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e => { const files = Array.from(e.target.files ?? []); if (files.some(f => f.size > 10 * 1024 * 1024)) { toast.error('Use files under 10 MB'); return; } attach(files); e.target.value = ''; }} />
    <Hero aria="Documents summary" busy={data.loading} label={period.label} check={data.errors.length ? 'Some missing' : undefined} checkTone="amber"
      stats={[{ label: 'Documents', value: formatTableInteger(inScope.length) }, ...types.slice(0, 3).map(x => ({ label: x.t, value: formatTableInteger(x.n) }))]} />
    <Section title="Documents" detail={formatTableInteger(filtered.length)} busy={data.loading}>
      {data.errors.length > 0 && <p className="kit-explain">Some documents could not be loaded: {data.errors.join(', ')}.</p>}
      {types.length > 1 && <div className="overflow-x-auto"><QuickFilter label="Kind" value={type} onChange={k => { setType(k); setPage(1); }} options={[{ key: 'all', label: 'All' }, ...types.map(x => ({ key: x.t, label: x.t }))]} /></div>}
      <Toolbar search={search} onSearch={v => { setSearch(v); setPage(1); }} placeholder="Search documents" mobileSearchBelow onDownload={download} downloadLabel="Download list" />
      <ul className="min-[768px]:hidden kit divide-y divide-border/60">{rows.map(d => <PhoneRow key={d.id} title={d.name} sub={`${d.date ? shortDay(d.date.slice(0, 10)) : '—'} · ${d.type} · ${d.record}`} onOpen={() => void open(d)} />)}</ul>
      <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Documents table"><table className="sales-table" aria-label="Documents">
        <thead><tr><th scope="col" className="sales-cell-left">Date</th><th scope="col" className="sales-cell-left">File</th><th scope="col" className="sales-cell-left">Kind</th><th scope="col" className="sales-cell-left">Belongs to</th><th scope="col" className="sales-cell-right"><span className="sr-only">View</span></th></tr></thead>
        <tbody>{rows.map(d => <tr key={d.id} className="sales-record-row" {...keyOpen(() => void open(d))}>
          <td className="sales-cell-left">{d.date ? shortDay(d.date.slice(0, 10)) : '—'}</td>
          <td className="sales-cell-left" title={d.name}>{d.name}</td>
          <td className="sales-cell-left text-muted-foreground">{d.type}</td>
          <td className="sales-cell-left" title={d.record}><Link className="kit-link" to={d.link} onClick={e => e.stopPropagation()}>{d.record}</Link></td>
          <td className="kit-num"><span className="kit-link">View</span></td>
        </tr>)}</tbody></table></div>
      {!rows.length && <Empty>{data.loading ? 'Loading documents…' : 'No documents found.'}</Empty>}
      <Pager page={current} pages={pages} onPage={setPage} />
      <Note>Tap a document to view it; its record opens from Belongs to. Upload hands files to Bani, who reads them and files each one in the right place.</Note>
    </Section>
    <Dialog open={!!viewer} onOpenChange={o => !o && setViewer(null)}><DialogContent className="max-w-4xl h-[85dvh] flex flex-col"><DialogHeader><DialogTitle className="break-words">{viewer?.name}</DialogTitle></DialogHeader>{viewer && (viewer.pdf ? <iframe title={viewer.name} src={viewer.url} className="w-full flex-1 min-h-0" /> : <div className="overflow-auto"><img alt={viewer.name} src={viewer.url} className="w-full" /></div>)}</DialogContent></Dialog>
  </div>;
}
