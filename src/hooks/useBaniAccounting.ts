import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { fetchAllRows } from '@/utils/fetchAllRows';
import { toast } from 'sonner';
export function useBaniAccounting(){
  const {tenantId}=useActiveTenant();
  const [reviews,setReviews]=useState<any[]>([]),[examples,setExamples]=useState<any[]>([]);
  const [settings,setSettings]=useState({enabled:true,ask_above:null as number|null,paused_reason:null as string|null});
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>{if(!tenantId){setReviews([]);setExamples([]);setLoading(false);return;}try{const [r,e,s]=await Promise.all([fetchAllRows('bani_accounting_reviews','*',{col:'created_at',asc:false},tenantId),fetchAllRows('bani_accounting_examples','*',{col:'created_at',asc:false},tenantId),supabase.from('bani_accounting_settings').select('enabled,ask_above,paused_reason').eq('tenant_id',tenantId).maybeSingle()]);if(s.error)throw s.error;setReviews(r);setExamples(e);setSettings(s.data??{enabled:true,ask_above:null,paused_reason:null});}catch(e){toast.error(e instanceof Error?e.message:'Could not load Bani accounting');}finally{setLoading(false);}},[tenantId]);
  useEffect(()=>{void refresh();},[refresh]);
  async function run(mode:'run'|'resume'='run'){if(!tenantId||busy)return;setBusy(true);try{const {data,error}=await supabase.functions.invoke('bani-accounting',{body:{tenant_id:tenantId,mode}});if(error){const detail=await error.context?.json?.();throw new Error(detail?.error??error.message);}if(data.error)throw new Error(data.error);toast.success(`Bani posted ${data.posted??0} · asked about ${data.asked??0}`);await refresh();return data;}catch(e){toast.error(e instanceof Error?e.message:'Bani could not check these items');}finally{setBusy(false);}}
  async function reverse(id:string,reason?:string){setBusy(true);try{const {error}=await supabase.rpc('bani_accounting_reverse',{p_review:id,p_reason:reason??null});if(error)throw error;toast.success('Reversing entry posted');await refresh();}catch(e){toast.error((e as any)?.message??'Could not reverse');}finally{setBusy(false);}}
  return {tenantId,reviews,examples,settings,loading,busy,refresh,run,reverse};
}