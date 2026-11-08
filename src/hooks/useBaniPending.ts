import {useQuery} from '@tanstack/react-query';
import {invokeAlertCheck} from '@/utils/invokeAlertCheck';
import {useActiveTenant} from './useActiveTenant';
import {useAuth} from './useAuth';
import {usePreviewMode} from './usePreviewMode';
import {useVenueScope} from './useVenueScope';
import type {Candidate} from '../../supabase/functions/_shared/smartAlerts/rules';
export type PendingItem=Candidate & {id:string|null};
export function useBaniPending(enabled:boolean){
 const {tenantId}=useActiveTenant(),{user,session,loading}=useAuth(),preview=usePreviewMode(),scope=useVenueScope();
 const query=useQuery({queryKey:['bani-pending',tenantId,user?.id,preview.previewUserId],enabled:enabled&&!!tenantId&&!!user&&!!session&&!loading&&!preview.isPreviewActive,staleTime:120_000,retry:1,queryFn:async()=>{
  const {data,error}=await invokeAlertCheck({tenant_id:tenantId,inbox:true});
  // No inbox access for this person/business (e.g. stale or unshared business): show nothing instead of failing the page.
  const status=(error as {context?:{status?:number}}|null)?.context?.status;
  if(status===403||status===400)return {work:[],notifications:[],role:'',greeting:null,team:[],due_soon:false,feed_health:[]};
  if(error)throw error;if(data.error)throw new Error(data.error);return data.per_tenant[0] as {work:PendingItem[];notifications:PendingItem[];role:string;greeting:string|null;team:{user_id:string;name:string;role:string;pending:number}[];due_soon:boolean;feed_health:{name:string;area:string;venue_id:string|null;complete_up_to:string|null;state:string;line:string|null}[]};
 }});
 return {...query,items:(query.data?.work??[]).filter(a=>scope.ready&&(!a.venue_id||scope.includesId(a.venue_id)))};
}