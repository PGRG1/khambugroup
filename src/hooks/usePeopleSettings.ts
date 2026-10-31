import {useEffect,useState,useCallback} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {resolvePeopleSettings,type PeopleSettings} from '@/utils/people';
export function usePeopleSettings(){const {tenantId}=useActiveTenant();const [rows,setRows]=useState<{venue_id:string|null;values:Partial<PeopleSettings>}[]>([]);const [loading,setLoading]=useState(true);
 const reload=useCallback(async()=>{if(!tenantId){setRows([]);setLoading(false);return;}const {data}=await supabase.from('people_settings').select('venue_id,values').eq('tenant_id',tenantId);setRows((data??[]) as typeof rows);setLoading(false);},[tenantId]);
 useEffect(()=>{reload();window.addEventListener('people-settings-changed',reload);return()=>window.removeEventListener('people-settings-changed',reload);},[reload]);
 const company=rows.find(r=>r.venue_id===null)?.values??{};
 return {rows,loading,reload,company,forVenue:(id?:string|null)=>resolvePeopleSettings(company,rows.find(r=>r.venue_id===id)?.values??{})};
}