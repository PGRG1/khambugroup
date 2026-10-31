import {useCallback,useEffect,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {useAuth} from '@/hooks/useAuth';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import {fetchAllRows} from '@/utils/fetchAllRows';
import {documentSources,indexDocuments,type FinancialDocument} from '@/utils/financialDocuments';
export function useFinancialDocuments(){
 const {tenantId}=useActiveTenant();const {user}=useAuth();const {isPreviewActive,previewUserId}=usePreviewMode();
 const [documents,setDocuments]=useState<FinancialDocument[]>([]);const [loading,setLoading]=useState(true);const [errors,setErrors]=useState<string[]>([]);
 const reload=useCallback(async()=>{if(!tenantId){setDocuments([]);setLoading(false);return;}setLoading(true);const uid=isPreviewActive?previewUserId:user?.id;const {data:canContracts}=uid?await supabase.rpc('people_documents_access',{t:tenantId,u:uid}):{data:false};
 const sources=documentSources.filter(s=>s.table!=='hr_person_documents'||canContracts);const failed:string[]=[];
 const sets=await Promise.all(sources.map(async s=>{try{return indexDocuments(s.table,await fetchAllRows(s.table,'*',{col:'id',asc:true},tenantId,true));}catch{failed.push(s.type);return [];}}));
 const all=sets.flat();const seen=new Set<string>();setDocuments(all.filter(d=>{const key=d.bucket+'|'+d.path;if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>b.date.localeCompare(a.date)));setErrors([...new Set(failed)]);setLoading(false);
 },[tenantId,user?.id,isPreviewActive,previewUserId]);useEffect(()=>{void reload();},[reload]);return {documents,loading,errors,reload};
}
