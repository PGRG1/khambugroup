import {useCallback,useEffect,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {useAuth} from '@/hooks/useAuth';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import {fetchAllRows} from '@/utils/fetchAllRows';
import {toast} from 'sonner';
import type {RotaRow} from '@/utils/peopleRota';
export function usePeopleRota(){
 const {tenantId}=useActiveTenant();const {user,isAdmin}=useAuth();const preview=usePreviewMode();const uid=preview.isPreviewActive&&isAdmin?preview.previewUserId:user?.id;
 const [loading,setLoading]=useState(true);const [state,setState]=useState<Record<'people'|'terms'|'shifts'|'attendance'|'leave'|'balances'|'holidays'|'sales'|'weeks'|'swaps',RotaRow[]>>({people:[],terms:[],shifts:[],attendance:[],leave:[],balances:[],holidays:[],sales:[],weeks:[],swaps:[]});const [access,setAccess]=useState(false);
 const reload=useCallback(async()=>{if(!tenantId||!uid){setLoading(false);return;}setLoading(true);try{const {data:allowed,error}=await supabase.rpc('people_access',{t:tenantId,u:uid});if(error)throw error;setAccess(Boolean(allowed));if(!allowed)return;const tables={people:'hr_employees',terms:'hr_employment_terms',shifts:'hr_shifts',attendance:'hr_attendance',leave:'hr_leave_requests',balances:'hr_leave_balances',holidays:'hr_holidays',sales:'sales_records',weeks:'hr_rota_weeks',swaps:'hr_swap_requests'};const entries=await Promise.all(Object.entries(tables).map(async([key,table])=>[key,await fetchAllRows(table,key==='leave'?'*,leave_type:hr_leave_types(*)':key==='balances'?'*,leave_type:hr_leave_types(*)':key==='sales'?'date,venue_id,venue,subtotal':'*',undefined,tenantId)]));setState(Object.fromEntries(entries) as typeof state);}catch(e){toast.error((e as Error).message);}finally{setLoading(false);}},[tenantId,uid]);
 useEffect(()=>{reload();},[reload]);
 const run=async(name:string,args:Record<string,unknown>)=>{if(preview.isPreviewActive||!tenantId)return false;const {error}=await (supabase.rpc as any)(name,{t:tenantId,...args});if(error){toast.error(error.message);return false;}await reload();return true;};
 return {...state,tenantId,uid,loading,access,reload,run,preview:preview.isPreviewActive};
}