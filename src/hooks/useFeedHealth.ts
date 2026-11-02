import {useQuery} from '@tanstack/react-query';
import {supabase} from '@/integrations/supabase/client';
import {useActiveTenant} from './useActiveTenant';
import {useAuth} from './useAuth';
import {usePreviewMode} from './usePreviewMode';
import {useVenueScope} from './useVenueScope';
import {feedState} from '../../supabase/functions/_shared/smartAlerts/followUp';
import {formatDate} from '@/utils/format';
export function useFeedHealth(areas:string[]){
 const {tenantId}=useActiveTenant(),{user}=useAuth(),preview=usePreviewMode(),scope=useVenueScope();
 const query=useQuery({queryKey:['feed-health',tenantId,user?.id,preview.previewUserId],enabled:areas.length>0&&!!tenantId&&!!user&&!preview.isPreviewActive,staleTime:120000,retry:1,queryFn:async()=>{const {data,error}=await supabase.from('alert_feed_health').select('*').eq('tenant_id',tenantId??'');if(error)throw error;return data;}});
 const affected=(query.data??[]).filter(f=>areas.includes(f.area)&&scope.ready&&(!f.venue_id||scope.includesId(f.venue_id)));
 const broken=affected.filter(f=>feedState(f)==='broken');
 if(broken.length){const f=broken[0];return `Data stops on ${f.complete_up_to?formatDate(f.complete_up_to):'the last successful import'} — ${f.name} connection down${broken.length>1?` · ${broken.length-1} more`:''}`;}
 return affected.some(f=>feedState(f)==='bani unavailable')?'Bani is having trouble reading this data; nothing for you to fix.':null;
}