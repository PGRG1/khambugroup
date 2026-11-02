import {useEffect,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {DeferredSalesFields} from './DeferredSalesFields';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {useFinanceSchedules} from '@/hooks/useFinanceSchedules';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import type {SalesRecord} from '@/types/sales';
import {deferredSalesAmounts,deferredSalesFields} from '@/utils/deferredSales';
import {tenantToday} from '@/utils/salesRecordChecks';
import {supabase} from '@/integrations/supabase/client';
import {toast} from 'sonner';
export function ExistingDeferredSales({record,canWrite}:{record:SalesRecord;canWrite:boolean}){
 const q=useFinanceSchedules(),preview=usePreviewMode(),cache=useQueryClient(),[draft,setDraft]=useState<Partial<SalesRecord>|null>(null),[date,setDate]=useState(tenantToday()),[busy,setBusy]=useState(false);
 useEffect(()=>setDraft(null),[record.id]);
 const pending=q.rows('finance_entry_drafts').find(d=>['waiting','approved'].includes(d.status)&&(d.source_data?.existing_sales_id===record.id||d.source_data?.sales_id===record.id));
 if(!q.settings.voucher_enabled&&!q.settings.deposit_enabled)return null;
 return <div className="space-y-3"><DeferredSalesFields record={draft??record} onChange={draft?(key,value)=>setDraft(d=>({...d,[key]:value})):undefined}/>{pending?<p className="text-xs text-muted-foreground">Deferred proposal · {pending.status}</p>:draft?<><Label htmlFor="deferred-correction-date">Correction date (posted days)</Label><Input id="deferred-correction-date" type="date" value={date} onChange={e=>setDate(e.target.value)}/><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={()=>setDraft(null)}>Cancel</Button><Button disabled={busy||!date} onClick={async()=>{if(!q.tenantId||!record.id)return;setBusy(true);try{deferredSalesAmounts(draft);const values=Object.fromEntries(deferredSalesFields.map(([key])=>[key,Number(draft[key]??0)]));const {error}=await supabase.rpc('finance_sales_deferred_edit',{t:q.tenantId,p:{sales_id:record.id,date,values}});if(error)throw error;await cache.invalidateQueries({queryKey:['finance-schedules']});setDraft(null);toast.success('Deferred draft saved for monthly approval; posted source retained');}catch(e){toast.error((e as {message?:string}).message??'Could not prepare deferred draft');}finally{setBusy(false);}}}>Save deferred draft</Button></div></>:<Button variant="outline" disabled={!canWrite||preview.isPreviewActive} onClick={()=>setDraft({...record})}>Edit deferred fields</Button>}</div>;
}