import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useFinanceSchedules} from '@/hooks/useFinanceSchedules';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import {equipmentCandidate} from '@/utils/scheduleDrafts';
import {assetLives} from '@/utils/financeSchedules';
import {tenantToday} from '@/utils/salesRecordChecks';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {supabase} from '@/integrations/supabase/client';
import {toast} from 'sonner';
import type {ExpenseBill,ExpenseBillAllocation} from '@/hooks/useExpenseBills';
export function BillScheduleProposal({header,line,canWrite}:{header:Partial<ExpenseBill>;line:ExpenseBillAllocation;canWrite:boolean}){
 const q=useFinanceSchedules(),preview=usePreviewMode(),cache=useQueryClient(),[kind,setKind]=useState<'asset_reclassification'|'prepayment_funding'|null>(null),[busy,setBusy]=useState(false),[date,setDate]=useState(tenantToday()),[name,setName]=useState(line.notes||line.expense_category||'Equipment'),[category,setCategory]=useState('kitchen_equipment'),[life,setLife]=useState(60);
 const candidate=equipmentCandidate(line.amount,line.notes||line.expense_category||'',q.settings.capitalisation_limit),future=(header.service_period_end||header.period_end||'').slice(0,7)>(header.bill_date||'').slice(0,7);
 if(!line.id||header.approval_status!=='posted'||!candidate&&!future)return null;
 const pending=q.rows('finance_entry_drafts').some(d=>['waiting','approved'].includes(d.status)&&d.source_data?.check_id===line.id);
 return <div className="text-xs text-muted-foreground space-y-1">{pending?<p>Schedule proposal recorded · monthly approval</p>:<>{candidate&&<div className="flex flex-wrap items-center gap-1">Looks like equipment · <Button variant="link" size="sm" className="h-auto p-0 text-xs" disabled={!canWrite||preview.isPreviewActive} onClick={()=>setKind('asset_reclassification')}>Treat as an asset?</Button></div>}{future&&<Button variant="link" size="sm" className="h-auto p-0 text-xs" disabled={!canWrite||preview.isPreviewActive} onClick={()=>setKind('prepayment_funding')}>Future coverage · Prepare prepayment</Button>}</>}
 <Dialog open={!!kind} onOpenChange={v=>!v&&setKind(null)}><DialogContent><DialogHeader><DialogTitle>{kind==='prepayment_funding'?'Advance bill · prepayment draft':'Equipment · asset draft'}</DialogTitle></DialogHeader><Label htmlFor={'schedule-date-'+line.id}>Draft date</Label><Input id={'schedule-date-'+line.id} type="date" value={date} onChange={e=>setDate(e.target.value)}/>{kind==='asset_reclassification'&&<><Label htmlFor={'schedule-name-'+line.id}>Asset name</Label><Input id={'schedule-name-'+line.id} value={name} onChange={e=>setName(e.target.value)}/><Label>Category</Label><Select value={category} onValueChange={v=>{setCategory(v);setLife(assetLives[v as keyof typeof assetLives]);}}><SelectTrigger aria-label="Capitalisation category"><SelectValue/></SelectTrigger><SelectContent>{Object.keys(assetLives).map(k=><SelectItem key={k} value={k}>{k.replaceAll('_',' ')}</SelectItem>)}</SelectContent></Select><Label htmlFor={'schedule-life-'+line.id}>Life (months)</Label><Input id={'schedule-life-'+line.id} type="number" min="1" value={life} onChange={e=>setLife(Number(e.target.value))}/></>}<Button disabled={busy||!q.tenantId||!date||kind==='asset_reclassification'&&(!name.trim()||!Number.isInteger(life)||life<=0)} onClick={async()=>{if(!q.tenantId||!kind)return;setBusy(true);try{const {error}=await supabase.rpc('finance_bill_schedule_propose',{t:q.tenantId,p:{kind,line:line.id,date,name,category,life_months:life}});if(error)throw error;await cache.invalidateQueries({queryKey:['finance-schedules']});setKind(null);toast.success('Schedule draft created; source bill retained');}catch(e){toast.error(e instanceof Error?e.message:'Schedule draft could not be created');}finally{setBusy(false);}}}>Create draft</Button></DialogContent></Dialog></div>;
}