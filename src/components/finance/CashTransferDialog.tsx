import {useEffect,useMemo,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import type {useBankModule} from '@/hooks/useBankModule';
import type {usePettyCash,PettyReplenishment} from '@/hooks/usePettyCash';
import {supabase} from '@/integrations/supabase/client';
import {formatDate} from '@/utils/format';
import {formatMoney,getBaseCurrency} from '@/utils/money';
import {suggestTransferPair,transferCandidates} from '@/utils/transferPairs';
import {toast} from 'sonner';

const NOT_YET='__not_yet__';

/** Records a transfer by pairing the real statement lines on both sides; never creates bank lines itself. */
export function CashTransferDialog({open,onClose,bank,pc}:{open:boolean;onClose:()=>void;bank:ReturnType<typeof useBankModule>;pc:ReturnType<typeof usePettyCash>}){
 const [from,setFrom]=useState('none'),[to,setTo]=useState('none'),[amount,setAmount]=useState(''),[date,setDate]=useState(new Date().toISOString().slice(0,10)),[ref,setRef]=useState(''),[busy,setBusy]=useState(false),[amountIn,setAmountIn]=useState('');
 const [outLine,setOutLine]=useState('none'),[inLine,setInLine]=useState('none'),[refRate,setRefRate]=useState<number|null>(null);
 const toCash=to.startsWith('cash:');
 const src=bank.accounts.find(a=>a.id===from),dst=bank.accounts.find(a=>a.id===to);
 const base=getBaseCurrency(),cf=(src?.currency||base).toUpperCase(),ct=(dst?.currency||base).toUpperCase(),cross=!!src&&!!dst&&cf!==ct;
 const outs=useMemo(()=>src?transferCandidates(bank.transactions as never,src.id,'out',date):[],[bank.transactions,src,date]);
 const ins=useMemo(()=>dst?transferCandidates(bank.transactions as never,dst.id,'in',date):[],[bank.transactions,dst,date]);
 useEffect(()=>{setOutLine('none');setInLine('none');},[from,to]);
 useEffect(()=>{let live=true;setRefRate(null);if(!cross||!bank.tenantId)return;(async()=>{const r=async(c:string)=>c===base?1:Number(((await supabase.rpc('fx_rate',{p_tenant:bank.tenantId!,p_date:date,p_currency:c})).data as {rate?:number}|null)?.rate??0);const a=await r(cf),b=await r(ct);if(live&&a>0&&b>0)setRefRate(a/b);})();return()=>{live=false;};},[cross,cf,ct,date,bank.tenantId,base]);
 useEffect(()=>{if(outLine!=='none'||inLine!=='none'||!outs.length||!ins.length)return;const p=suggestTransferPair(outs as never,ins as never,cross?refRate:null);if(p){setOutLine(p.out.id);setInLine(p.in.id);}},[outs,ins,refRate,cross,outLine,inLine]);
 const o=outs.find(l=>l.id===outLine),i=ins.find(l=>l.id===inLine);
 const out=o?Number(o.money_out):Number(amount),inn=i?Number(i.money_in):cross?Number(amountIn):out;
 const pending=outLine===NOT_YET||inLine===NOT_YET;
 const ready=toCash?from!=='none'&&Number(amount)>0:from!=='none'&&to!=='none'&&outLine!=='none'&&inLine!=='none'&&!(outLine===NOT_YET&&inLine===NOT_YET)&&out>0&&inn>0;
 const line=(l:{txn_date:string;money_in:number;money_out:number},c:string)=>`${formatDate(l.txn_date)} · ${formatMoney(Number(l.money_out)||Number(l.money_in),c)}`;
 async function save(){if(!bank.tenantId)return;setBusy(true);try{
  if(toCash){const {data:user}=await supabase.auth.getUser();const {data,error}=await supabase.from('petty_cash_replenishments').insert({tenant_id:bank.tenantId,float_id:to.slice(5),replenishment_date:date,amount:Number(amount),from_bank_account_id:from,reference:ref,created_by:user.user?.id}).select('*').single();if(error)throw error;await pc.postReplenishment(data as PettyReplenishment);toast.success('Transfer recorded');}
  else if(pending){await bank.pendingTransfer({fromId:from,toId:to,outTxn:outLine===NOT_YET?null:outLine,inTxn:inLine===NOT_YET?null:inLine,date,amountOut:out,amountIn:inn,note:ref});toast.success('Saved — it will pair when the other statement line arrives');}
  else{await bank.pairTransfer(outLine,inLine,ref);toast.success('Transfer recorded');}
  onClose();await bank.reload();}catch(e){toast.error(e instanceof Error?e.message:(e as {message?:string}).message??'Could not record transfer');}finally{setBusy(false);}}
 return <Dialog open={open} onOpenChange={v=>!v&&onClose()}><DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Record transfer</DialogTitle><DialogDescription>Pick the money leaving one account and arriving in the other from your statements.</DialogDescription></DialogHeader><div className="space-y-3">
  <Label>From bank</Label><Select value={from} onValueChange={setFrom}><SelectTrigger aria-label="Transfer from"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Choose account</SelectItem>{bank.accounts.filter(a=>a.is_active).map(a=><SelectItem key={a.id} value={a.id}>{a.account_name}{a.currency&&a.currency!==base?` · ${a.currency}`:''}</SelectItem>)}</SelectContent></Select>
  <Label>To account or cash box</Label><Select value={to} onValueChange={setTo}><SelectTrigger aria-label="Transfer to"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Choose account</SelectItem>{bank.accounts.filter(a=>a.is_active&&a.id!==from).map(a=><SelectItem key={a.id} value={a.id}>{a.account_name}{a.currency&&a.currency!==base?` · ${a.currency}`:''}</SelectItem>)}{pc.floats.filter(f=>f.is_active).map(f=><SelectItem key={f.id} value={`cash:${f.id}`}>Cash box · {f.venue}</SelectItem>)}</SelectContent></Select>
  <Label htmlFor="transfer-date">Date</Label><Input id="transfer-date" type="date" value={date} onChange={e=>setDate(e.target.value)}/>
  {toCash?<><Label htmlFor="transfer-amount">Amount</Label><Input id="transfer-amount" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></>:src&&dst&&<>
   <Label>Money out of {src.account_name}</Label><Select value={outLine} onValueChange={setOutLine}><SelectTrigger aria-label="Statement line out"><SelectValue placeholder="Choose statement line"/></SelectTrigger><SelectContent><SelectItem value="none">Choose statement line</SelectItem>{outs.map(l=><SelectItem key={l.id} value={l.id}>{line(l,cf)}</SelectItem>)}<SelectItem value={NOT_YET}>Statement not uploaded yet</SelectItem></SelectContent></Select>
   <Label>Money into {dst.account_name}</Label><Select value={inLine} onValueChange={setInLine}><SelectTrigger aria-label="Statement line in"><SelectValue placeholder="Choose statement line"/></SelectTrigger><SelectContent><SelectItem value="none">Choose statement line</SelectItem>{ins.map(l=><SelectItem key={l.id} value={l.id}>{line(l,ct)}</SelectItem>)}<SelectItem value={NOT_YET}>Statement not uploaded yet</SelectItem></SelectContent></Select>
   {!outs.length&&!ins.length&&<p className="text-xs text-muted-foreground">No unmatched statement lines within 3 days of this date. Upload the statement, or choose "not uploaded yet".</p>}
   {outLine===NOT_YET&&<><Label htmlFor="transfer-amount">Amount out ({cf})</Label><Input id="transfer-amount" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></>}
   {inLine===NOT_YET&&cross&&<><Label htmlFor="transfer-in">Amount in ({ct})</Label><Input id="transfer-in" inputMode="decimal" value={amountIn} onChange={e=>setAmountIn(e.target.value)}/></>}
   {cross&&out>0&&inn>0&&<p className="text-xs text-muted-foreground" data-testid="transfer-rate">{formatMoney(out,cf)} → {formatMoney(inn,ct)} · rate {(inn/out).toFixed(6)}{refRate?` (reference ${refRate.toFixed(6)})`:''}. Any difference from the reference rate is booked as realised FX.</p>}
  </>}
  <Label htmlFor="transfer-ref">Reference</Label><Input id="transfer-ref" value={ref} onChange={e=>setRef(e.target.value)}/>
 </div><DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy||!ready||!date} onClick={save}>{pending?'Save until it arrives':'Record transfer'}</Button></DialogFooter></DialogContent></Dialog>;
}
