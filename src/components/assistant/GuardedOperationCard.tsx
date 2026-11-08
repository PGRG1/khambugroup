import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { formatTenantCurrency } from '@/utils/format';
import type { BaniActionCard } from './FloatingBaniContext';
export function GuardedOperationCard({card,outcome,undoAvailable,onDecision}:{card:BaniActionCard;outcome?:string;undoAvailable?:boolean;onDecision:(decision:'confirm'|'cancel'|'undo',confirmation?:string)=>void}) {
 const [review,setReview]=useState(false),[checked,setChecked]=useState(false),[typed,setTyped]=useState('');
 const financial=card.kind==='approve_bill';
 return <div className="floating-bani-change" dir="auto">
  <p className="floating-bani-change-target">{card.title}</p>
  {typeof card.amount==='number'&&<p className="td-num">{formatTenantCurrency(card.amount,card.currency??'HKD')}</p>}
  <p className="floating-bani-change-reason whitespace-pre-line">{card.detail}</p>
  {outcome?<><p role="status" className="text-sm">{outcome}</p>{undoAvailable&&<Button variant="outline" onClick={()=>onDecision('undo')}>Undo clear</Button>}</>:financial&&!review?<div className="mt-3 flex gap-3"><Button variant="outline" onClick={()=>setReview(true)}>Review posting</Button><Button variant="ghost" onClick={()=>onDecision('cancel')}>Cancel</Button></div>:<div className="mt-3 space-y-3">
   {financial&&<><label className="flex items-start gap-2 text-sm"><Checkbox checked={checked} onCheckedChange={v=>setChecked(v===true)}/>I reviewed the bill and want it posted to the books. It cannot be instantly undone.</label><label className="block text-sm">Type {card.challenge}<Input aria-label="Posting confirmation" value={typed} onChange={e=>setTyped(e.target.value)} autoComplete="off"/></label></>}
   <div className="flex flex-wrap gap-3"><Button disabled={financial&&(!checked||!card.challenge||typed!==card.challenge)} onClick={()=>onDecision('confirm',financial?typed:undefined)}>{financial?'Approve and post':'Clear review'}</Button><Button variant="ghost" onClick={()=>onDecision('cancel')}>Cancel</Button></div>
  </div>}
 </div>;
}