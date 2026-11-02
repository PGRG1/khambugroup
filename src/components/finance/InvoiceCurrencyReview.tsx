import { useState } from 'react';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import { useFxRate } from '@/hooks/useFxRate';
import { supabase } from '@/integrations/supabase/client';
import type { Invoice } from '@/hooks/useInvoiceData';
import { getBaseCurrency, formatWithBase, formatMoney } from '@/utils/money';
import { formatMenuCurrency } from '@/utils/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FxPaymentReview } from './FxPaymentReview';
import { toast } from 'sonner';

export function InvoiceCurrencyReview({ invoice, posted, onSaved }: { invoice: Invoice; posted: boolean; onSaved:()=>Promise<void> }) {
  const {tenantId}=useActiveTenant(),preview=usePreviewMode();
  const [edit,setEdit]=useState(false),[currency,setCurrency]=useState(invoice.currency||getBaseCurrency()),[rate,setRate]=useState(invoice.fx_rate?String(invoice.fx_rate):''),[busy,setBusy]=useState(false);
  const lookup=useFxRate(invoice.invoice_date,currency);
  return <div className="text-sm space-y-2"><Button variant="ghost" className="h-auto p-0 font-normal text-left whitespace-normal" disabled={posted||preview.isPreviewActive} onClick={()=>setEdit(!edit)}>{invoice.original_total!=null?formatWithBase(invoice.original_total,invoice.currency,invoice.fx_rate,invoice.invoice_date):`Currency · ${invoice.currency||getBaseCurrency()}`}</Button>
    {edit&&<div className="grid grid-cols-2 gap-3"><label>Currency<Input aria-label="Invoice currency" maxLength={3} value={currency} onChange={e=>{setCurrency(e.target.value.toUpperCase());setRate('');}}/></label><label>Rate<Input aria-label="Invoice exchange rate" inputMode="decimal" value={rate||String(lookup.data?.rate??'')} onChange={e=>setRate(e.target.value)}/></label><Button className="col-span-2" disabled={busy||posted} onClick={async()=>{if(!tenantId)return;setBusy(true);try{const {error}=await supabase.rpc('finance_invoice_fx_set',{t:tenantId,ident:invoice.id,c:currency,r:Number(rate)||lookup.data?.rate||0});if(error)throw error;await onSaved();setEdit(false);toast.success('Invoice currency saved');}catch(e){toast.error(e instanceof Error?e.message:'Currency could not be saved');}finally{setBusy(false);}}}>Save currency</Button></div>}
    {invoice.currency&&invoice.currency!==getBaseCurrency()&&!!invoice.line_items?.some(l=>(l as any).original_unit_price!=null)&&<div className="divide-y divide-border" data-testid="invoice-fx-lines">{invoice.line_items!.map(l=><div key={l.id} className="py-1.5 flex justify-between gap-3"><span className="min-w-0 break-words">{l.description}</span><span className="td-num text-right shrink-0">{(l as any).original_unit_price!=null?<>{formatMoney(Number((l as any).original_unit_price),invoice.currency!)} · {formatMoney(Number((l as any).original_total??0),invoice.currency!)}<span className="block text-xs text-muted-foreground">{formatMenuCurrency(Number(l.unit_price))} · {formatMenuCurrency(Number(l.total))}</span></>:formatMenuCurrency(Number(l.total))}</span></div>)}</div>}
    {invoice.original_balance!=null&&<p className="text-xs text-muted-foreground td-num">Still owed in {invoice.currency}: {formatMoney(Number(invoice.original_balance),invoice.currency!)}</p>}
    <FxPaymentReview source="invoice" id={invoice.id} currency={invoice.currency} bookedRate={invoice.fx_rate} posted={posted}/>
  </div>;
}