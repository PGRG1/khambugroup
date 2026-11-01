import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {useAuth} from '@/hooks/useAuth';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import {fetchAllRows} from '@/utils/fetchAllRows';
import type {RotaRow} from '@/utils/peopleRota';
import {toast} from 'sonner';
import {canPrepareMonth,monthKey} from '@/utils/peoplePresentation';
import {hongKongDay} from '@/utils/peopleRota';
export function usePeoplePayroll(year:number,month:number){
 const {tenantId}=useActiveTenant();const {user,isAdmin}=useAuth();const preview=usePreviewMode();const uid=preview.isPreviewActive&&isAdmin?preview.previewUserId:user?.id;
 const [state,setState]=useState<{rows:RotaRow[];months:RotaRow[];audits:RotaRow[];payroll:RotaRow[];sales:RotaRow[];owner:boolean;manager:boolean;loading:boolean}>({rows:[],months:[],audits:[],payroll:[],sales:[],owner:false,manager:false,loading:true});
 const request=useRef(0);
 const reload=useCallback(async(prepare=false)=>{if(!tenantId||!uid)return;const current=++request.current;setState(s=>({...s,rows:[],loading:true}));try{
 const [owner,manager]=await Promise.all([supabase.rpc('people_owner',{t:tenantId,u:uid}),supabase.rpc('payroll_manager',{t:tenantId,u:uid})]);
 const [months,audits,stored,sales,people]=await Promise.all([fetchAllRows('hr_payroll_months','*',undefined,tenantId),fetchAllRows('hr_payroll_overrides','*',undefined,tenantId),fetchAllRows('hr_payroll','*',undefined,tenantId),fetchAllRows('sales_records','date,venue_id,venue,subtotal,total_sales',undefined,tenantId),fetchAllRows('hr_employees','*',undefined,tenantId)]);
 let payroll=stored;const key=`${year}-${String(month).padStart(2,'0')}`;
 if(prepare&&manager.data&&!preview.isPreviewActive&&canPrepareMonth(stored,year,month,hongKongDay())){const result=await supabase.rpc('payroll_prepare',{t:tenantId,y:year,m:month});if(result.error)throw result.error;payroll=await fetchAllRows('hr_payroll','*',undefined,tenantId);}
 const rows=payroll.filter(p=>monthKey(p)===key).map(p=>{const e=people.find(e=>e.id===p.employee_id);return {...p,name:`${e?.first_name??''} ${e?.last_name??''}`.trim(),venue_id:e?.venue_id};});
 if(current===request.current)setState({rows:(rows??[]) as RotaRow[],months,audits,payroll,sales,owner:Boolean(owner.data),manager:Boolean(manager.data),loading:false});
 }catch(e){if(current===request.current){toast.error((e as Error).message);setState(s=>({...s,loading:false}));}}},[tenantId,uid,year,month,preview.isPreviewActive]);
 useEffect(()=>{reload();},[reload]);
 return {...state,reload,tenantId,uid,preview:preview.isPreviewActive};
}