import {useQuery} from '@tanstack/react-query';
import {sessionQueryTiming,sameSessionPrevious} from '@/utils/sessionQuery';
import {useCallback,useEffect,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {useAuth} from '@/hooks/useAuth';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import {fetchAllRows} from '@/utils/fetchAllRows';
import {termsOnDate,type EmploymentTerms} from '@/utils/people';
export function usePeopleData(){const {tenantId}=useActiveTenant();const {user,isAdmin}=useAuth();const {isPreviewActive,previewUserId}=usePreviewMode();const uid=isPreviewActive&&isAdmin?previewUserId:user?.id;
 const [employees,setEmployees]=useState<any[]>([]);const [terms,setTerms]=useState<any[]>([]);const [changes,setChanges]=useState<any[]>([]);const [documents,setDocuments]=useState<any[]>([]);const [history,setHistory]=useState<any[]>([]);const [shifts,setShifts]=useState<any[]>([]);const [leave,setLeave]=useState<any[]>([]);const [payroll,setPayroll]=useState<any[]>([]);const [requests,setRequests]=useState<any[]>([]);const [owner,setOwner]=useState(false);const [canDocuments,setCanDocuments]=useState(false);const [loading,setLoading]=useState(true);
 const [evidence,setEvidence]=useState<{ledger:any[];holidays:any[];attendance:any[];swaps:any[];authors:any[]}>({ledger:[],holidays:[],attendance:[],swaps:[],authors:[]});
 const reload=useCallback(async()=>{if(!tenantId||!uid){setLoading(false);return;}setLoading(true);try{const [e,t,c,h,s,l,p,o,da,lr]=await Promise.all([fetchAllRows('hr_employees','*',undefined,tenantId),fetchAllRows('hr_employment_terms','*',undefined,tenantId),fetchAllRows('hr_people_changes','*',undefined,tenantId),fetchAllRows('hr_employee_history','*',undefined,tenantId),fetchAllRows('hr_shifts','*',undefined,tenantId),fetchAllRows('hr_leave_balances','*,leave_type:hr_leave_types(*)',undefined,tenantId),fetchAllRows('hr_payroll','*',undefined,tenantId),supabase.rpc('people_owner',{t:tenantId,u:uid}),supabase.rpc('people_documents_access',{t:tenantId,u:uid}),fetchAllRows('hr_leave_requests','*,leave_type:hr_leave_types(*)',undefined,tenantId)]);setRequests(lr);setEmployees(e);setTerms(t);setChanges(c);setHistory(h);const settlements=await fetchAllRows('hr_shift_settlements','*',undefined,tenantId);setShifts(s.map(shift=>({...shift,settlement:settlements.find(d=>d.shift_id===shift.id)})));setLeave(l);setPayroll(p);setOwner(Boolean(o.data));setCanDocuments(Boolean(da.data));setDocuments(da.data?await fetchAllRows('hr_person_documents','*',undefined,tenantId):[]);}finally{setLoading(false);}},[tenantId,uid]);
 useEffect(()=>{let active=true;if(!tenantId)return;Promise.all([fetchAllRows('hr_leave_ledger','*,leave_type:hr_leave_types(*)',undefined,tenantId),fetchAllRows('hr_holidays','*',undefined,tenantId),fetchAllRows('hr_attendance','*',undefined,tenantId),fetchAllRows('hr_swap_requests','*',undefined,tenantId),fetchAllRows('profiles','id,display_name',undefined,undefined)]).then(([ledger,holidays,attendance,swaps,authors])=>{if(active)setEvidence({ledger,holidays,attendance,swaps,authors});}).catch(()=>{if(active)setEvidence({ledger:[],holidays:[],attendance:[],swaps:[],authors:[]});});return()=>{active=false;};},[tenantId,history]);
 useEffect(()=>{reload();},[reload]);const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 return {tenantId,employees:employees.map(e=>({...e,...termsOnDate(terms.filter(t=>t.employee_id===e.id) as EmploymentTerms[],today)})),rawEmployees:employees,terms,changes,documents,history,shifts,leave,requests,payroll,owner,canDocuments,loading,reload,today,isPreviewActive,...evidence};
}
export function useOverviewPeopleData(){
 const {tenantId}=useActiveTenant();const {user,isAdmin}=useAuth();
 const {isPreviewActive,previewUserId}=usePreviewMode();
 const uid=isPreviewActive&&isAdmin?previewUserId:user?.id;
 const key=['people-overview',user?.id,tenantId,uid,previewUserId];
 const query=useQuery({queryKey:key,enabled:!!tenantId&&!!uid,...sessionQueryTiming,
  placeholderData:(previous,previousQuery)=>sameSessionPrevious(previous,previousQuery,key),
  queryFn:async()=>{
   if(!tenantId||!uid)return null;
   const [employees,terms,changes,history,shifts,leave,payroll,o,da,requests,ledger,holidays,attendance,swaps,authors]=await Promise.all([
    fetchAllRows('hr_employees','*',undefined,tenantId),fetchAllRows('hr_employment_terms','*',undefined,tenantId),
    fetchAllRows('hr_people_changes','*',undefined,tenantId),fetchAllRows('hr_employee_history','*',undefined,tenantId),
    fetchAllRows('hr_shifts','*',undefined,tenantId),fetchAllRows('hr_leave_balances','*,leave_type:hr_leave_types(*)',undefined,tenantId),
    fetchAllRows('hr_payroll','*',undefined,tenantId),supabase.rpc('people_owner',{t:tenantId,u:uid}),
    supabase.rpc('people_documents_access',{t:tenantId,u:uid}),fetchAllRows('hr_leave_requests','*,leave_type:hr_leave_types(*)',undefined,tenantId),
    fetchAllRows('hr_leave_ledger','*,leave_type:hr_leave_types(*)',undefined,tenantId),fetchAllRows('hr_holidays','*',undefined,tenantId),
    fetchAllRows('hr_attendance','*',undefined,tenantId),fetchAllRows('hr_swap_requests','*',undefined,tenantId),
    fetchAllRows('profiles','id,display_name',undefined,undefined)]);
   if(o.error)throw o.error;if(da.error)throw da.error;
   const documents=da.data?await fetchAllRows('hr_person_documents','*',undefined,tenantId):[];
   return {rawEmployees:employees,terms,changes,history,shifts,leave,payroll,owner:Boolean(o.data),canDocuments:Boolean(da.data),requests,ledger,holidays,attendance,swaps,authors,documents};
  }});
 const empty={rawEmployees:[] as any[],terms:[] as any[],changes:[] as any[],history:[] as any[],shifts:[] as any[],leave:[] as any[],payroll:[] as any[],owner:false,canDocuments:false,requests:[] as any[],ledger:[] as any[],holidays:[] as any[],attendance:[] as any[],swaps:[] as any[],authors:[] as any[],documents:[] as any[]};
 const data=query.data??empty;
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 return {...data,tenantId,today,isPreviewActive,loading:!!tenantId&&!!uid&&query.isPending,reload:async()=>{await query.refetch();},employees:data.rawEmployees.map(e=>({...e,...termsOnDate(data.terms.filter(t=>t.employee_id===e.id) as EmploymentTerms[],today)}))};
}
