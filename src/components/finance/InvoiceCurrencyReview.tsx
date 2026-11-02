import { useState } from 'react';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import { useFxRate } from '@/hooks/useFxRate';
import { supabase } from '@/integrations/supabase/client';
import type { Invoice } from '@/hooks/useInvoiceData';
import { getBaseCurrency, formatWithBase } from '@/utils/money';
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
    <FxPaymentReview source="invoice" id={invoice.id} currency={invoice.currency} bookedRate={invoice.fx_rate} posted={posted}/>
  </div>;
}