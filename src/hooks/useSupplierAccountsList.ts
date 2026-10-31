import {useEffect,useState,useCallback} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {usePayables,type APInvoice,type APPaymentRow} from '@/hooks/usePayables';
import {medianSupplierTerms,proposeSupplierMatches,type MatchProposal} from '@/utils/supplierAccounts';
export function useSupplierAccountsList(){
 const payables=usePayables();const {tenantId}=useActiveTenant();const [history,setHistory]=useState<{supplier_id:string;invoice_date:string;due_date:string|null}[]>([]);const [historyError,setHistoryError]=useState('');
 const loadHistory=useCallback(async()=>{if(!tenantId)return;setHistoryError('');try{const rows:typeof history=[];for(let start=0;;start+=1000){const {data,error}=await supabase.from('invoices').select('supplier_id,invoice_date,due_date').eq('tenant_id',tenantId).neq('review_status','Voided').order('id').range(start,start+999);if(error)throw error;rows.push(...data);if(data.length<1000)break;}setHistory(rows);}catch(e){setHistoryError(e instanceof Error?e.message:'Could not load payment terms');}},[tenantId]);
 useEffect(()=>{void loadHistory();},[loadHistory]);
 const terms=(supplierId:string)=>medianSupplierTerms(history.filter(i=>i.supplier_id===supplierId));
 const refresh=()=>{payables.refresh();void loadHistory();};
 const approveMatches=async(supplierId:string,proposal:MatchProposal[])=>{if(!tenantId)throw new Error('Choose a client first.');const {error}=await supabase.rpc('approve_supplier_account_matches',{p_tenant:tenantId,p_supplier:supplierId,p_rows:proposal as any});if(error)throw error;refresh();};
 const approveDueDates=async(rows:{supplier_id:string;days:number;invoice_ids:string[]}[])=>{if(!tenantId)throw new Error('Choose a client first.');const {data,error}=await supabase.rpc('approve_supplier_account_due_dates',{p_tenant:tenantId,p_rows:rows as any});if(error)throw error;refresh();return data;};
 return {...payables,historyError,terms,approveMatches,approveDueDates};
}
export function supplierMatchProposal(supplierId:string,payments:APPaymentRow[],invoices:APInvoice[]){return proposeSupplierMatches(supplierId,payments,invoices);}
