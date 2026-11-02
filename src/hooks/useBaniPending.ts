import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {useActiveTenant} from './useActiveTenant';
import {useAuth} from './useAuth';
import {usePreviewMode} from './usePreviewMode';
import {useVenueScope} from './useVenueScope';
import type {Candidate} from '../../supabase/functions/_shared/smartAlerts/rules';
export type PendingItem=Candidate & {id:string|null};
export function useBaniPending(enabled:boolean){
 const {tenantId}=useActiveTenant(),{user}=useAuth(),preview=usePreviewMode(),scope=useVenueScope();
 const query=useQuery({queryKey:['bani-pending',tenantId,user?.id,preview.previewUserId],enabled:enabled&&!!tenantId&&!!user&&!preview.isPreviewActive,staleTime:120_000,retry:1,queryFn:async()=>{
  const {data,error}=await supabase.functions.invoke('evaluate-alerts',{body:{tenant_id:tenantId,inbox:true}});if(error)throw error;if(data.error)throw new Error(data.error);return data.per_tenant[0] as {work:PendingItem[];notifications:PendingItem[];role:string;greeting:string|null;team:{user_id:string;name:string;role:string;pending:number}[]};
 }});
 return {...query,items:(query.data?.work??[]).filter(a=>scope.ready&&(!a.venue_id||scope.includesId(a.venue_id)))};
}