import { useEffect, useState } from 'react';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { fetchAllRows } from '@/utils/fetchAllRows';
import type { FoodSale,FoodReceipt,FoodLine,CostCount,CostCountLine,CostProduct } from '@/utils/menuCosts';
import { toast } from 'sonner';
export function useMenuFoodCosts() {
 const {tenantId}=useActiveTenant();
 const [data,setData]=useState<{sales:FoodSale[];receipts:FoodReceipt[];lines:FoodLine[];products:CostProduct[];counts:CostCount[];countLines:CostCountLine[]}>({sales:[],receipts:[],lines:[],products:[],counts:[],countLines:[]});
 const [loading,setLoading]=useState(true); const [error,setError]=useState('');
 useEffect(()=>{let alive=true;if(!tenantId){setLoading(false);return;}setLoading(true);setError('');
 Promise.all([fetchAllRows('sales_records','venue,date,subtotal',undefined,tenantId),fetchAllRows('goods_received_notes','id,venue,status,received_date',undefined,tenantId),fetchAllRows('grn_items','id,grn_id,product_master_id,accepted_qty,quantity_received,unit_cost,unit,created_at',undefined,tenantId),fetchAllRows('product_master','id,financial_treatment',undefined,tenantId),fetchAllRows('stock_count_sessions','id,venue,count_date,status,created_at',undefined,tenantId),fetchAllRows('stock_count_items','session_id,product_master_id,counted_qty,unit_cost',undefined,tenantId)])
 .then(([sales,receipts,lines,products,counts,countLines])=>{if(alive)setData({sales:sales as FoodSale[],receipts:receipts as FoodReceipt[],lines:lines as FoodLine[],products:products as CostProduct[],counts:counts as CostCount[],countLines:countLines as CostCountLine[]});}).catch(e=>{if(alive){setError(e.message);toast.error(e.message);}}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[tenantId]);
 return {...data,loading,error};
}
