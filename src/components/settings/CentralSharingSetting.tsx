import {useQueryClient} from '@tanstack/react-query';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {useCentralSharing} from '@/hooks/useCentralSharing';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import {supabase} from '@/integrations/supabase/client';
import {Label} from '@/components/ui/label';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {toast} from 'sonner';
export function CentralSharingSetting(){const q=useCentralSharing(),{tenantId}=useActiveTenant(),cache=useQueryClient(),preview=usePreviewMode();return <div className="flex flex-wrap justify-between gap-3 items-center"><Label>Central costs shared by</Label><Select disabled={preview.isPreviewActive||q.isPending||!tenantId} value={q.data?.rule??'sales'} onValueChange={async value=>{if(!tenantId)return;const {error}=await supabase.from('app_config').upsert({tenant_id:tenantId,key:'central_cost_sharing',value},{onConflict:'tenant_id,key'});if(error)toast.error(error.message);else await cache.invalidateQueries({queryKey:['central-sharing']});}}><SelectTrigger className="w-44"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="sales">Sales</SelectItem><SelectItem value="equal">Equal shares</SelectItem></SelectContent></Select></div>;}