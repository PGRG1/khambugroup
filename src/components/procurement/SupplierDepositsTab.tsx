import {useEffect,useMemo,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogFooter} from '@/components/ui/dialog';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {supabase} from '@/integrations/supabase/client';
import {fetchAllRows} from '@/utils/fetchAllRows';
import {formatCurrency,formatDecimal} from '@/utils/format';
import {buildSupplierContainers,type DepositLine} from '@/utils/supplierDeposits';
import {useVenueScope} from '@/hooks/useVenueScope';
import {usePagePermissions} from '@/hooks/usePagePermissions';
import {toast} from 'sonner';
export function SupplierDepositsTab({supplierId,tenantId,refreshKey,onHeldChange,onSaved,selectedInvoiceIds}: {supplierId:string;tenantId:string;refreshKey:number;onHeldChange:(n:number)=>void;onSaved:()=>void;selectedInvoiceIds:Set<string>|null}) {
 const scope=useVenueScope(); const {isPreviewActive}=usePagePermissions();
 const [lines,setLines]=useState<DepositLine[]>([]);const [loading,setLoading]=useState(true);const [open,setOpen]=useState(false);
 const [key,setKey]=useState('');const [venue,setVenue]=useState('');const [qty,setQty]=useState('1');const [cost,setCost]=useState('');const [date,setDate]=useState('');const [request,setRequest]=useState('');const [saving,setSaving]=useState(false);
 useEffect(()=>{if(!tenantId)return;let cancelled=false;setLoading(true);(async()=>{
  const rows=await fetchAllRows('grn_items','id,product_master_id,quantity_received,accepted_qty,unit,unit_cost,description,product_master!product_master_id(*),goods_received_notes!grn_id(supplier_id,status,venue,received_date,invoice_id,tenant_id)',undefined,tenantId);
  if(cancelled)return;
  setLines(rows.filter(r=>r.goods_received_notes?.tenant_id===tenantId&&r.goods_received_notes?.supplier_id===supplierId&&['confirmed','disputed'].includes(r.goods_received_notes.status)&&String(r.product_master?.financial_treatment??'').startsWith('Asset')).map(r=>({id:r.id,productId:r.product_master_id,name:r.product_master.name||r.product_master.internal_product_name||r.description,unit:r.unit,qty:Number(r.accepted_qty??r.quantity_received),unitCost:Number(r.unit_cost),venue:r.goods_received_notes.venue,receivedDate:r.goods_received_notes.received_date,invoiceId:r.goods_received_notes.invoice_id})));setLoading(false);
 })();return()=>{cancelled=true};},[tenantId,supplierId,refreshKey]);
 const visible=useMemo(()=>lines.filter(l=>scope.includesName(l.venue)&&(!selectedInvoiceIds||(l.invoiceId&&selectedInvoiceIds.has(l.invoiceId)))),[lines,scope,selectedInvoiceIds]);
 const containers=useMemo(()=>buildSupplierContainers(visible),[visible]);
 useEffect(()=>onHeldChange(containers.reduce((sum,r)=>sum+r.held,0)),[containers,onHeldChange]);
 const container=containers.find(r=>r.key===key);
 const choose=(value:string)=>{setKey(value);const row=containers.find(r=>r.key===value);const source=row?.lines.find(l=>l.qty<0)??row?.lines.find(l=>l.qty>0);setCost(source?String(source.unitCost):'');setVenue(source?.venue??'');};
 const save=async()=>{const source=container?.lines.find(l=>l.qty<0)??container?.lines.find(l=>l.qty>0);if(!source||!tenantId||isPreviewActive||saving)return;
  if(!Number.isInteger(Number(qty))||Number(qty)<=0||!cost.trim()||!Number.isFinite(Number(cost))||Number(cost)<0||!venue||!date){toast.error('Enter venue, date, whole quantity and refund per container');return;}
  setSaving(true);const {error}=await supabase.rpc('log_supplier_container_return',{p_tenant:tenantId,p_supplier:supplierId,p_product:source.productId,p_venue:venue,p_date:date,p_qty:Number(qty),p_cost:Number(cost),p_request:request});setSaving(false);
  if(error){toast.error(error.message);return;}toast.success('Returned empties recorded');setOpen(false);onSaved();
 };
 return <div className="space-y-4">
  <h2 className="font-display text-base font-semibold">Deposits <span className="text-sm font-normal text-muted-foreground">· {containers.length} containers</span></h2>
  {containers.filter(r=>r.returned>0&&r.paid===0).map(r=><p key={r.key} className="kit-explain">{r.name} returned but no deposit was ever paid — the deposit was probably inside the beer price.</p>)}
  <table className="w-full text-sm supplier-deposit-table"><thead><tr><th>Container</th><th>Paid</th><th>Returned</th><th>Out</th><th>Held</th></tr></thead><tbody>
   {containers.map(r=><tr key={r.key}><td>{r.name}</td><td>{formatDecimal(r.paid,0)}</td><td>{formatDecimal(r.returned,0)}</td><td>{formatDecimal(r.out,0)}</td><td className="td-num">{formatCurrency(r.held)}</td></tr>)}
   {!containers.length&&<tr><td colSpan={5}>{loading?'Loading…':'No received deposit containers.'}</td></tr>}
  </tbody></table>
  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"><p className="text-xs text-muted-foreground">Out = containers paid for minus returned</p><Button variant="outline" disabled={!containers.length||isPreviewActive} onClick={()=>{setQty('1');setDate(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hong_Kong',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));setRequest(crypto.randomUUID());choose(containers[0]?.key??'');setOpen(true);}}>Log returned empties</Button></div>
  <Dialog open={open} onOpenChange={o=>!saving&&setOpen(o)}><DialogContent className="supplier-detail-dialog"><DialogHeader><DialogTitle>Log returned empties</DialogTitle></DialogHeader>
   <Label>Container<Select value={key} onValueChange={choose}><SelectTrigger aria-label="Container"><SelectValue/></SelectTrigger><SelectContent>{containers.map(r=><SelectItem key={r.key} value={r.key}>{r.name}</SelectItem>)}</SelectContent></Select></Label>
   <Label>Venue<Select value={venue} onValueChange={setVenue}><SelectTrigger aria-label="Return venue"><SelectValue/></SelectTrigger><SelectContent>{scope.venues.filter(v=>scope.includesName(v.name)).map(v=><SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>)}</SelectContent></Select></Label>
   <Label>Return date<Input aria-label="Return date" type="date" value={date} onChange={e=>setDate(e.target.value)}/></Label>
   <div className="grid grid-cols-2 gap-3"><Label>Containers returned<Input aria-label="Containers returned" type="number" min="1" step="1" value={qty} onChange={e=>setQty(e.target.value)}/></Label><Label>Refund per container<Input aria-label="Refund per container" type="number" min="0" step="0.01" value={cost} onChange={e=>setCost(e.target.value)}/></Label></div>
   <p className="text-sm text-muted-foreground">{qty} returned · {formatCurrency(Number(qty)*Number(cost))} deposit value. No payment or invoice is created.</p>
   <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)} disabled={saving}>Cancel</Button><Button onClick={save} disabled={saving||isPreviewActive}>{saving?'Saving…':'Confirm return'}</Button></DialogFooter>
  </DialogContent></Dialog>
 </div>;
}