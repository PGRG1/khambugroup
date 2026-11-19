import {Choice} from './SettingsForm';
import {useQueryClient} from '@tanstack/react-query';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {useCentralSharing} from '@/hooks/useCentralSharing';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import {supabase} from '@/integrations/supabase/client';
import {toast} from 'sonner';
export function CentralSharingSetting(){const q=useCentralSharing(),{tenantId}=useActiveTenant(),cache=useQueryClient(),preview=usePreviewMode();const save=async(value:string)=>{if(!tenantId)return;const {error}=await supabase.from('app_config').upsert({tenant_id:tenantId,key:'central_cost_sharing',value},{onConflict:'tenant_id,key'});if(error)toast.error(error.message);else await cache.invalidateQueries({queryKey:['central-sharing']});};
 return <Choice label="Share central costs by" disabled={preview.isPreviewActive||q.isPending||!tenantId} value={(q.data?.rule??'sales') as 'sales'|'equal'} onChange={k=>void save(k)} options={[{key:'sales',title:'Sales',line:'Bigger venues carry more'},{key:'equal',title:'Equal shares',line:'Every venue the same'}]}/>;}