import {useCallback,useEffect,useState} from 'react';
import {fetchAllRows} from '@/utils/fetchAllRows';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {useVenueScope} from '@/hooks/useVenueScope';
import {payrollOwed,type OwedItem} from '@/utils/financeWorkingCapital';
import {formatMonthLabel} from '@/utils/format';
export type FinancePayment={key:string;date:string;payee:string;amount:number;method:string;match:string;link:string;paymentId?:string};
export function useFinanceObligations(){
 const {tenantId}=useActiveTenant();const scope=useVenueScope();const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const [items,setItems]=useState<OwedItem[]>([]),[history,setHistory]=useState<FinancePayment[]>([]);
 const reload=useCallback(async()=>{if(!tenantId){setItems([]);setHistory([]);setLoading(false);return;}setLoading(true);setError('');try{
   const [bills,claims,payroll,emps,entries,billPayments,batches,venues]=await Promise.all(['expense_bills','staff_reimbursements','hr_payroll','hr_employees','journal_entries','expense_bill_payments','hr_payroll_payment_batches','venues'].map(t=>fetchAllRows(t,'*',undefined,tenantId,true)));
   const posted=new Set(entries.filter(e=>e.status==='posted').map(e=>e.id));const employee=new Map(emps.map(e=>[e.id,e]));const venue=new Map(venues.map(v=>[v.id,v.name]));const out:OwedItem[]=[];
   for(const b of bills){const amount=Math.max(0,Number(b.total_amount)-Number(b.paid_amount));if(b.approval_status!=='posted'||!posted.has(b.journal_entry_id)||amount<=.005)continue;out.push({key:`bill:${b.id}`,id:b.id,source:'bill',payeeKey:b.supplier_id?`supplier:${b.supplier_id}`:`bill-vendor:${b.vendor_name}`,payee:b.vendor_name||'Bill vendor',what:b.notes||b.bill_number||'Bill',venue:b.venue||venue.get(b.venue_id)||null,date:b.bill_date,due:b.due_date,amount,supplierId:b.supplier_id,link:`/expenses?bill=${b.id}`});}
   for(const c of claims){if(c.approval_status!=='approved'||c.status!=='owing'||!posted.has(c.journal_entry_id))continue;out.push({key:`staff:${c.id}`,id:c.id,source:'staff',payeeKey:`staff:${c.claimant_name}`,payee:c.claimant_name,what:c.description,venue:venue.get(c.venue_id)||null,date:c.claim_date,due:null,amount:Number(c.amount),link:'/expenses/claims'});}
   for(const p of payroll){if(!p.accrual_journal_entry_id||!posted.has(p.accrual_journal_entry_id))continue;const e=employee.get(p.employee_id);const month=`${p.year}-${String(p.month).padStart(2,'0')}`;const next=new Date(Date.UTC(p.year,p.month,1)).toISOString().slice(0,7);const owed=payrollOwed(p);for(const kind of ['salary','mpf'] as const){if(owed[kind]<=.005)continue;out.push({key:`${kind}:${p.id}`,id:p.id,source:kind,payeeKey:kind==='salary'?`employee:${p.employee_id}`:'mpf:trustee',payee:kind==='salary'?`${e?.first_name??''} ${e?.last_name??''}`.trim()||'Staff member':'MPF trustee',what:`${kind==='salary'?'Salary':'MPF'} · ${formatMonthLabel(month)}`,venue:venue.get(e?.venue_id)||e?.venue||null,date:`${month}-01`,due:`${next}-${kind==='salary'?'07':'10'}`,amount:owed[kind],employeeId:p.employee_id,year:p.year,month:p.month,link:'/hr/payroll'});}}
   setItems(out);
   const histories:FinancePayment[]=[];
   for(const p of billPayments){const b=bills.find(b=>b.id===p.bill_id);histories.push({key:`bill:${p.id}`,date:p.payment_date,payee:b?.vendor_name||'Bill vendor',amount:Number(p.amount),method:p.payment_method,match:entries.find(e=>e.id===p.journal_entry_id)?.status==='posted'?'Awaiting bank match':'Posting needs a look',link:`/expenses?bill=${p.bill_id}`});}
   for(const p of batches.filter(b=>b.status==='posted'))histories.push({key:`payroll:${p.id}`,date:p.payment_date,payee:p.payment_kind==='mpf'?'MPF trustee':'Payroll',amount:Number(p.total_amount),method:p.payment_method,match:p.bank_transaction_id?'Matched':'Awaiting bank match',link:'/hr/payroll'});
   for(const c of claims.filter(c=>c.status==='paid'))histories.push({key:`staff:${c.id}`,date:c.paid_date||c.claim_date,payee:c.claimant_name,amount:Number(c.amount),method:c.paid_from||'',match:c.paid_from==='petty_cash'?'Cash box':'Awaiting bank match',link:'/expenses/claims'});
   setHistory(histories);
 }catch(e){setError(e instanceof Error?e.message:'Could not load owed amounts');}finally{setLoading(false);}},[tenantId]);
 useEffect(()=>{void reload();},[reload]);
 return {items:items.filter(i=>scope.includesName(i.venue)),history,loading,error,reload};
}