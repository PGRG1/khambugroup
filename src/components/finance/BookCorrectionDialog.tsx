import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { formatDate, formatMenuCurrency } from '@/utils/format';
import { dateEvidence } from '@/utils/booksReview';
import { toast } from 'sonner';

export function BookCorrectionDialog({entry,lines,line,kind,accounts,review,onClose,onSaved}: {entry:any;lines:any[];line?:any;kind:'date'|'account'|'reverse';accounts:any[];review:any;onClose:()=>void;onSaved:()=>void}) {
  const source = entry.source_type==='invoice' ? review.invoices.find((i:any)=>i.id===entry.source_id) : entry.source_type==='expense_bill' ? review.bills.find((b:any)=>b.id===entry.source_id) : review.sales.find((s:any)=>s.id===entry.source_id || `${s.date}__${s.venue}`===entry.source_id);
  const evidence = dateEvidence(source);
  const [date,setDate] = useState('');
  const [account,setAccount] = useState('');
  const [reason,setReason] = useState('');
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('');
  const blocked = review.closed.some((c:any)=>!c.reopened_at && [entry.entry_date.slice(0,7),date.slice(0,7)].includes(c.month_start.slice(0,7)));
  async function propose() {
    setBusy(true);setNotice('');
    try {
      const {data,error}=await supabase.functions.invoke('finance-review',{body:{tenant_id:review.tenantId,year:Number(new Date().getFullYear()),mode:'book_correction',entry_id:entry.id,line_id:line?.id??null,instruction:`Review ${kind}; propose only, never save.`}});
      if(error){const detail=await error.context?.json?.();throw new Error(detail?.error??error.message);} if(data.error)throw new Error(data.error);
      if(kind==='date')setDate(data.date??''); if(kind==='account')setAccount(data.account_id??''); setReason(data.reason??'');setNotice(data.reason??'No supported suggestion');
    } catch(e) {setNotice(`Bani couldn't check this (AI unavailable). ${(e as Error).message}`);} finally {setBusy(false);}
  }
  async function confirm() {
    if(review.isPreviewActive || blocked || !reason.trim())return;
    setBusy(true);
    const snapshot={date:entry.entry_date,lines:[...lines].sort((a,b)=>a.id.localeCompare(b.id)).map(l=>({id:l.id,account_id:l.account_id,debit:Number(l.debit),credit:Number(l.credit),mapping_status:l.mapping_status??null}))};
    const {data,error}=await supabase.rpc('finance_correct_book',{p_entry:entry.id,p_kind:kind,p_reason:reason,p_date:kind==='date'?date:null,p_line:kind==='account'?line?.id:null,p_account:kind==='account'?account:null,p_expected:snapshot});
    setBusy(false); if(error){toast.error(error.message);return;}toast.success('Confirmed correction posted');onSaved();onClose();
  }
  return <Dialog open onOpenChange={o=>!o&&onClose()}><DialogContent className="max-w-2xl max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{kind==='date'?'Confirm date correction':kind==='account'?'Confirm account correction':'Confirm reversal'}</DialogTitle><DialogDescription>{entry.memo} · {formatDate(entry.entry_date)}</DialogDescription></DialogHeader>
    {kind==='date'&&<><p className="text-sm">Original date: {formatDate(entry.entry_date)}</p>{evidence.map((e,i)=><p key={i} className="text-sm text-muted-foreground">{e.reason}: {formatDate(e.date)} · background only</p>)}<Input aria-label="Corrected date" type="date" value={date} onChange={e=>setDate(e.target.value)}/><p className="text-sm text-muted-foreground">Reverse on the original date, then re-post the same amounts on the confirmed date. The source document and original entry stay unchanged.</p></>}
    {kind==='account'&&<><p className="text-sm">{line?.memo} · {formatMenuCurrency(Number(line?.debit)||Number(line?.credit))}</p><p className="text-sm text-muted-foreground">Current account: {accounts.find(a=>a.id===line?.account_id)?.name??'No account'}. Reclassify this amount with a balanced correcting entry.</p><Select value={account||'none'} onValueChange={v=>setAccount(v==='none'?'':v)}><SelectTrigger aria-label="Correcting account"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Pick an account</SelectItem>{accounts.filter(a=>a.is_active&&a.id!==line?.account_id&&!/suspense/i.test(a.name)).map(a=><SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent></Select></>}
    {kind==='reverse'&&<p className="text-sm">Create an equal and opposite entry on the original date. No source records or posted entries are deleted.</p>}
    {kind!=='reverse'&&<Button variant="outline" disabled={busy} onClick={propose}>Ask Bani to check evidence</Button>}
    {notice&&<p role="status" className="text-sm text-warning whitespace-pre-wrap">{notice}</p>}
    <Textarea aria-label="Correction reason" placeholder="Reason for the confirmed change" value={reason} onChange={e=>setReason(e.target.value)}/>
    {blocked&&<p className="text-sm text-warning">An affected month is closed. The owner must <Link className="underline" to="/finance">reopen it in Overview</Link> first.</p>}
    <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={confirm} disabled={busy||blocked||review.isPreviewActive||!reason.trim()||(kind==='date'&&(!date||date===entry.entry_date))||(kind==='account'&&!account)}>Confirm</Button></DialogFooter>
  </DialogContent></Dialog>;
}