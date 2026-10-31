import {useCallback,useEffect,useState} from 'react';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {fetchAllRows} from '@/utils/fetchAllRows';
import {expectedTenderDays} from '@/utils/financeWorkingCapital';
export function useFinanceReceipts(){
 const {tenantId}=useActiveTenant();const [sales,setSales]=useState<Record<string,unknown>[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const reload=useCallback(async()=>{if(!tenantId){setSales([]);setLoading(false);return;}setLoading(true);try{setSales(await fetchAllRows('sales_records','id,date,venue,venue_id,visa,mastercard,amex,union_pay,jcb,alipay,wechat,payme,cash',undefined,tenantId,true));setError('');}catch(e){setError(e instanceof Error?e.message:'Could not load expected receipts');}finally{setLoading(false);}},[tenantId]);
 useEffect(()=>{void reload();},[reload]);return {sales,expected:expectedTenderDays(sales),loading,error,reload};
}