import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { buildStockCountReview, type CountDelivery, type CountMovement } from '@/utils/stockCountReview';
import type { Json } from '@/integrations/supabase/types';
export type CaptureSource='photo'|'said'|'typed';
export interface UnknownCount { id:string;area:string;qty:number|null;source:CaptureSource;confidence:string;note:string }
export interface CaptureState { done_areas:string[];unknown:UnknownCount[] }
export interface CountSession { id:string;venue:string;count_date:string;status:string;created_at:string;capture_state:CaptureState }
export interface CountProduct { id:string;internal_product_name:string;stock_uom:string;unit:string;cost_per_stock_unit:number }
export interface CountItem { id:string;product_master_id:string;counted_qty:number|null;unit:string;notes:string|null;capture_source:CaptureSource|null;confidence:string|null }
export interface AreaQty { count_item_id:string;location_id:string;qty:number|null;capture_source:CaptureSource|null;confidence:string|null;capture_note:string|null }
async function all<T>(factory:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:{message:string}|null}>):Promise<T[]> {
  const rows:T[]=[];for(let from=0;;from+=1000){const {data,error}=await factory(from,from+999);if(error)throw new Error(error.message);rows.push(...(data??[]));if((data??[]).length<1000)return rows;}
}
export function useStockCount(sessionId:string) {
  const {tenantId}=useActiveTenant();
  const [data,setData]=useState<{session:CountSession;products:CountProduct[];items:CountItem[];areas:{id:string;name:string}[];quantities:AreaQty[];review:ReturnType<typeof buildStockCountReview>;canApprove:boolean}|null>(null);
  const [error,setError]=useState('');
  const load=useCallback(async()=>{
    if(!tenantId)return;
    try {
      const {data:s,error:se}=await supabase.from('stock_count_sessions').select('*').eq('tenant_id',tenantId).eq('id',sessionId).single();if(se)throw se;
      const session={...s,capture_state:s.capture_state as unknown as CaptureState};
      const [products,items,areas,quantities,sessions,counts,deliveries,waste,transfers,transferItems,approval]=await Promise.all([
        all((a,b)=>supabase.from('product_master').select('id,internal_product_name,stock_uom,unit,cost_per_stock_unit').eq('tenant_id',tenantId).eq('status','Active').order('id').range(a,b)),
        all((a,b)=>supabase.from('stock_count_items').select('*').eq('tenant_id',tenantId).eq('session_id',sessionId).order('id').range(a,b)),
        all((a,b)=>supabase.from('stock_locations').select('id,name').eq('venue',s.venue).eq('is_active',true).order('sort_order').order('id').range(a,b)),
        all((a,b)=>supabase.from('stock_count_location_qtys').select('count_item_id,location_id,qty,capture_source,confidence,capture_note,stock_count_items!inner(session_id,tenant_id)').eq('stock_count_items.session_id',sessionId).eq('stock_count_items.tenant_id',tenantId).order('id').range(a,b)),
        all((a,b)=>supabase.from('stock_count_sessions').select('id,venue,count_date,status,created_at').eq('tenant_id',tenantId).eq('venue',s.venue).eq('status','approved').order('id').range(a,b)),
        all((a,b)=>supabase.from('stock_count_items').select('session_id,product_master_id,counted_qty').eq('tenant_id',tenantId).order('id').range(a,b)),
        all((a,b)=>supabase.from('grn_items').select('product_master_id,accepted_qty,quantity_received,goods_received_notes!inner(venue,status,received_date,tenant_id)').eq('tenant_id',tenantId).eq('goods_received_notes.tenant_id',tenantId).eq('goods_received_notes.venue',s.venue).order('id').range(a,b)),
        all((a,b)=>supabase.from('inventory_movements_waste').select('product_master_id,venue,entry_date,quantity').eq('tenant_id',tenantId).eq('venue',s.venue).order('id').range(a,b)),
        all((a,b)=>supabase.from('transfers').select('id,from_venue,to_venue,transfer_date,status,received_at').eq('tenant_id',tenantId).order('id').range(a,b)),
        all((a,b)=>supabase.from('transfer_items').select('transfer_id,product_master_id,quantity_sent,quantity_received').eq('tenant_id',tenantId).order('id').range(a,b)),
        supabase.rpc('stock_count_can_approve',{p_tenant:tenantId})
      ]);
      const ds:CountDelivery[]=deliveries.map(d=>({product_master_id:d.product_master_id,venue:d.goods_received_notes.venue,date:d.goods_received_notes.received_date,status:d.goods_received_notes.status,qty:Number(d.accepted_qty??d.quantity_received)}));
      const ms:CountMovement[]=waste.map(w=>({product_master_id:w.product_master_id,venue:w.venue,date:w.entry_date,qty:-Number(w.quantity)}));
      for(const t of transfers){if(!['confirmed','received'].includes(t.status))continue;for(const i of transferItems.filter(i=>i.transfer_id===t.id)){ms.push({product_master_id:i.product_master_id,venue:t.from_venue,date:t.transfer_date,qty:-Number(i.quantity_sent)});if(t.status==='received')ms.push({product_master_id:i.product_master_id,venue:t.to_venue,date:t.received_at ? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t.received_at)):t.transfer_date,qty:Number(i.quantity_received??0)});}}
      const current=items.map(i=>({...i,uncertain:quantities.some(q=>q.count_item_id===i.id&&q.qty!=null&&q.confidence!=null&&q.confidence!=='sure') || (!areas.length && i.confidence!=null&&i.confidence!=='sure')}));
      setData({session,products,items:items as CountItem[],areas,quantities:quantities as AreaQty[],review:buildStockCountReview({session,sessions,counts,current,deliveries:ds,movements:ms}),canApprove:approval.data===true});setError('');
    }catch(e){setError(e instanceof Error?e.message:'Unable to load count');throw e;}
  },[tenantId,sessionId]);
  useEffect(()=>{setData(null);load().catch(()=>{});},[load]);
  const save=async(area:string|null,lines:Json=[],removeProduct:string|null=null,removeUnknown:string|null=null,done=false)=>{const {error}=await supabase.rpc('save_stock_count_area',{p_session:sessionId,p_area:area,p_lines:lines,p_remove_product:removeProduct,p_remove_unknown:removeUnknown,p_done:done});if(error)throw error;await load();};
  const advance=async(status:'pending_review'|'approved')=>{if(!tenantId)throw new Error('Choose a tenant');const {data:updated,error}=await supabase.from('stock_count_sessions').update({status}).eq('tenant_id',tenantId).eq('id',sessionId).eq('status',status==='approved'?'pending_review':'in_progress').select('id').single();if(error||!updated)throw error??new Error('Count status changed; reopen it');await load();};
  return {data,error,load,save,advance};
}