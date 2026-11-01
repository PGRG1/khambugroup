import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {Button} from '@/components/ui/button';
import {supabase} from '@/integrations/supabase/client';
import {toast} from 'sonner';
export function ScheduleDraftCancel({tenantId,id,disabled}:{tenantId:string|null;id:string;disabled?:boolean}){const cache=useQueryClient(),[busy,setBusy]=useState(false);return <Button size="sm" variant="ghost" disabled={disabled||busy||!tenantId} onClick={async()=>{if(!tenantId)return;setBusy(true);try{const {error}=await supabase.rpc('finance_schedule_cancel',{t:tenantId,ident:id});if(error)throw error;await cache.invalidateQueries();toast.success('Waiting draft cancelled');}catch(e){toast.error(e instanceof Error?e.message:'Draft could not be cancelled');}finally{setBusy(false);}}}>Cancel draft</Button>;}