import {useCallback,useEffect,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {useAuth} from '@/hooks/useAuth';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import {fetchAllRows} from '@/utils/fetchAllRows';
import type {RotaRow} from '@/utils/peopleRota';
import {toast} from 'sonner';
export function usePeoplePayroll(year:number,month:number){
 const {tenantId}=useActiveTenant();const {user,isAdmin}=useAuth();const preview=usePreviewMode();const uid=preview.isPreviewActive&&isAdmin?preview.previewUserId:user?.id;
 const [state,setState]=useState<{rows:RotaRow[];months:RotaRow[];audits:RotaRow[];payroll:RotaRow[];sales:RotaRow[];owner:boolean;manager:boolean;loading:boolean}>({rows:[],months:[],audits:[],payroll:[],sales:[],owner:false,manager:false,loading:true});
 const reload=useCallback(async(prepare=false)=>{if(!tenantId||!uid)return;setState(s=>({...s,loading:true}));try{
 const [owner,manager]=await Promise.all([supabase.rpc('people_owner',{t:tenantId,u:uid}),supabase.rpc('payroll_manager',{t:tenantId,u:uid})]);
 const {data:rows,error}=await supabase.rpc(prepare&&manager.data&&!preview.isPreviewActive?'payroll_prepare':'payroll_preview',{t:tenantId,y:year,m:month});if(error)throw error;
 const [months,audits,payroll,sales]=await Promise.all([fetchAllRows('hr_payroll_months','*',undefined,tenantId),fetchAllRows('hr_payroll_overrides','*',undefined,tenantId),fetchAllRows('hr_payroll','*',undefined,tenantId),fetchAllRows('sales_records','date,venue_id,venue,subtotal',undefined,tenantId)]);
 setState({rows:(rows??[]) as RotaRow[],months,audits,payroll,sales,owner:Boolean(owner.data),manager:Boolean(manager.data),loading:false});
 }catch(e){toast.error((e as Error).message);setState(s=>({...s,loading:false}));}},[tenantId,uid,year,month,preview.isPreviewActive]);
 useEffect(()=>{reload(true);},[reload]);
 return {...state,reload,tenantId,uid,preview:preview.isPreviewActive};
}