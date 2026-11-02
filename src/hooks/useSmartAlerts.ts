import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useAuth} from './useAuth';
import {useActiveTenant} from './useActiveTenant';
import {usePreviewMode} from './usePreviewMode';
import {useUserPermissions} from './useUserPermissions';
import {useVenueScope} from './useVenueScope';
import {supabase} from '@/integrations/supabase/client';
import {fetchAllRows} from '@/utils/fetchAllRows';
import {areaPage,sortAlerts,type SmartAlert,type AlertMute} from '@/utils/smartAlerts';
import type {Json} from '@/integrations/supabase/types';
export function useSmartAlerts(){
 const {user}=useAuth(),{tenantId}=useActiveTenant(),preview=usePreviewMode(),scope=useVenueScope(),qc=useQueryClient();
 const permissions=useUserPermissions(preview.previewUserId??user?.id);const key=['smart-alerts',user?.id,tenantId,preview.previewUserId];
 const query=useQuery({queryKey:key,enabled:!!tenantId&&!!user,staleTime:60_000,retry:1,queryFn:async()=>{if(!tenantId)throw new Error('Choose a business');const [events,mutes,tenant,members]=await Promise.all([fetchAllRows('alert_events','*',{col:'created_at',asc:false},tenantId,true),fetchAllRows('alert_mutes','*',undefined,tenantId,true),supabase.from('tenants').select('base_currency,timezone').eq('id',tenantId).single(),supabase.from('tenant_members').select('role,user_id').eq('tenant_id',tenantId)]);if(tenant.error)throw tenant.error;if(members.error)throw members.error;return {events:events.filter(a=>a.kind) as SmartAlert[],mutes:mutes.filter(m=>m.active) as AlertMute[],currency:tenant.data.base_currency??'HKD',roles:[...new Set(members.data.filter(m=>m.user_id!==user?.id).map(m=>m.role))]};}});
 const events=scope.ready&&!permissions.loading?sortAlerts((query.data?.events??[]).filter(a=>(!a.venue_id||scope.includesId(a.venue_id))&&permissions.canAccessPage(areaPage(a.area))).map(a=>a.kind==='learning'?{...a,payload:{...a.payload,progress:(a.payload.progress??[]).filter((v:any)=>scope.includesId(v.venue_id))}}:a)):[];
 const mutes=(query.data?.mutes??[]).filter(m=>!m.venue_id||scope.includesId(m.venue_id));
 const refresh=()=>qc.invalidateQueries({queryKey:key});
 const action=async(id:string,decision:string,options:Record<string,unknown>={})=>{if(!tenantId||preview.isPreviewActive)throw new Error('Leave preview to change alerts');const {error}=await supabase.rpc('smart_alert_action',{t:tenantId,ident:id,decision,options:options as Json});if(error)throw error;await refresh();};
 const unmute=async(id:string)=>{if(!tenantId||preview.isPreviewActive)throw new Error('Leave preview to change alerts');const {error}=await supabase.rpc('smart_alert_unmute',{t:tenantId,ident:id});if(error)throw error;await refresh();};
 const editMute=async(id:string,options:Record<string,unknown>)=>{if(!tenantId||preview.isPreviewActive)throw new Error('Leave preview to change alerts');const {error}=await supabase.rpc('smart_alert_edit_mute',{t:tenantId,ident:id,options:options as Json});if(error)throw error;await refresh();};
 return {...query,events,mutes,action,unmute,editMute,currency:query.data?.currency??'HKD',roles:query.data?.roles??[],readOnly:preview.isPreviewActive,refresh};
}
