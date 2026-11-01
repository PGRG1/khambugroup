import {useState} from 'react';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import {useFinanceSchedules} from '@/hooks/useFinanceSchedules';
import type {ChartAccount} from '@/hooks/useChartOfAccounts';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Label} from '@/components/ui/label';
import {Input} from '@/components/ui/input';
import {Checkbox} from '@/components/ui/checkbox';
import {tenantToday} from '@/utils/salesRecordChecks';
import {supabase} from '@/integrations/supabase/client';
import {toast} from 'sonner';
export function AccountMerge({accounts,onSaved}:{accounts:ChartAccount[];onSaved:()=>void}){
 const {tenantId}=useActiveTenant(),q=useFinanceSchedules(),preview=usePreviewMode();const [open,setOpen]=useState(false),[source,setSource]=useState('none'),[target,setTarget]=useState('none'),[date,setDate]=useState(tenantToday()),[reclass,setReclass]=useState(false),[busy,setBusy]=useState(false);const from=accounts.find(a=>a.id===source),targets=accounts.filter(a=>a.is_active&&a.id!==source&&a.account_type===from?.account_type&&a.normal_side===from?.normal_side);
 if(!q.canManage||preview.isPreviewActive)return null;
 return <><Button variant="outline" size="sm" onClick={()=>setOpen(true)}>Merge accounts</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Merge accounts</DialogTitle></DialogHeader><Label>From</Label><Select value={source} onValueChange={v=>{setSource(v);setTarget('none');}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Choose account</SelectItem>{accounts.filter(a=>a.is_active).map(a=><SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent></Select><Label>Future postings to</Label><Select value={target} onValueChange={setTarget}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Choose same-type account</SelectItem>{targets.map(a=><SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent></Select><Label htmlFor="merge-date">Date</Label><Input id="merge-date" type="date" value={date} onChange={e=>setDate(e.target.value)}/><label className="flex items-center gap-2 text-sm"><Checkbox checked={reclass} onCheckedChange={v=>setReclass(v===true)}/>Propose balance reclassification for monthly approval</label><p className="text-xs text-muted-foreground">Existing posted entries remain unchanged.</p><Button disabled={busy||!tenantId||source==='none'||target==='none'||!date} onClick={async()=>{if(!tenantId)return;setBusy(true);try{const {error}=await supabase.rpc('finance_account_merge',{t:tenantId,source,target,d:date,reclass});if(error)throw error;toast.success('Future postings redirected; any balance adjustment awaits approval');onSaved();setOpen(false);}catch(e){toast.error(e instanceof Error?e.message:'Merge failed');}finally{setBusy(false);}}}>Confirm merge</Button></DialogContent></Dialog></>;
}