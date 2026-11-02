import {useQuery} from '@tanstack/react-query';
import {useActiveTenant} from './useActiveTenant';
import {useAuth} from './useAuth';
import {usePreviewMode} from './usePreviewMode';
import {supabase} from '@/integrations/supabase/client';
export function useCentralSharing(){const {tenantId}=useActiveTenant(),{user}=useAuth(),preview=usePreviewMode();return useQuery({queryKey:['central-sharing',user?.id,tenantId,preview.previewUserId],enabled:!!tenantId,queryFn:async()=>{if(!tenantId)return {rule:'sales' as const,configured:false};const {data,error}=await supabase.from('app_config').select('value').eq('tenant_id',tenantId).eq('key','central_cost_sharing').maybeSingle();if(error)throw error;return {rule:data?.value==='equal'?'equal' as const:'sales' as const,configured:data?.value==='equal'||data?.value==='sales'};}});}