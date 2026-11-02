import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import { useFxRate } from '@/hooks/useFxRate';
import { supabase } from '@/integrations/supabase/client';
import { formatMoney, formatRate, getBaseCurrency } from '@/utils/money';
import { formatDate } from '@/utils/format';
import { realisedFx } from '@/utils/fxAccounting';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { toast } from 'sonner';

export function FxPaymentReview({ source, id, currency, bookedRate, posted }: { source: 'bill' | 'invoice'; id: string; currency?: string | null; bookedRate?: number | null; posted: boolean }) {
  const { tenantId } = useActiveTenant(), preview = usePreviewMode(), cache = useQueryClient();
  const [open,setOpen] = useState(false), [date,setDate] = useState(new Date().toISOString().slice(0,10)), [original,setOriginal] = useState(''), [rate,setRate] = useState(''), [bank,setBank] = useState(''), [busy,setBusy] = useState(false);
  const lookup = useFxRate(date,currency);
  const q = useQuery({ queryKey:['fx-payment-history',tenantId,source,id], enabled: !!tenantId && !!currency && currency!==getBaseCurrency(), queryFn:async()=>{
    if (!tenantId) throw new Error('Choose a business');
    const accounts = await supabase.from('bank_accounts').select('id,account_name').eq('tenant_id',tenantId).eq('is_active',true);
    if (accounts.error) throw accounts.error;
    if (source==='bill') {
      const history=await supabase.from('expense_bill_payments').select('payment_date,cash_base_amount,fx_rate,fx_gain_loss').eq('tenant_id',tenantId).eq('bill_id',id).not('fx_rate','is',null);
      if(history.error)throw history.error; return {accounts:accounts.data, history:history.data};
    }
    const allocations=await supabase.from('payment_allocations').select('payment_id').eq('tenant_id',tenantId).eq('invoice_id',id);
    if(allocations.error)throw allocations.error;
    const ids=(allocations.data??[]).map(a=>a.payment_id);
    if(!ids.length)return {accounts:accounts.data,history:[]};
    const history=await supabase.from('payments').select('payment_date,cash_base_amount,fx_rate,fx_gain_loss').eq('tenant_id',tenantId).in('id',ids).not('fx_rate','is',null);
    if(history.error)throw history.error;return {accounts:accounts.data,history:history.data};
  },retry:1 });
  if(!currency || currency===getBaseCurrency() || !bookedRate)return null;
  const paidRate=Number(rate)||lookup.data?.rate||0;
  const math=Number(original)>0 && paidRate>0 ? realisedFx(Number(original),bookedRate,paidRate,getBaseCurrency()) : null;
  return <div className="space-y-2 text-sm">
    {(q.data?.history??[]).map((p,i)=><p key={i} className="text-muted-foreground td-num">Paid {formatDate(p.payment_date)}: {formatMoney(Number(p.cash_base_amount))} at {formatRate(Number(p.fx_rate))} → FX {Number(p.fx_gain_loss)>=0?'loss':'gain'} {formatMoney(Math.abs(Number(p.fx_gain_loss)))}</p>)}
    {posted&&<Button variant="link" className="h-auto p-0" disabled={preview.isPreviewActive} onClick={()=>setOpen(!open)}>Record foreign payment</Button>}
    {open&&<div className="space-y-3 border-t border-border pt-3"><div className="grid grid-cols-2 gap-3"><label>Payment date<Input type="date" value={date} onChange={e=>{setDate(e.target.value);setRate('');}}/></label><label>Amount · {currency}<Input aria-label="Original payment amount" inputMode="decimal" value={original} onChange={e=>setOriginal(e.target.value)}/></label><label>1 {currency} = {getBaseCurrency()}<Input aria-label="Payment exchange rate" inputMode="decimal" value={rate||String(lookup.data?.rate??'')} onChange={e=>setRate(e.target.value)}/></label><label>Paid from<Select value={bank||'none'} onValueChange={v=>setBank(v==='none'?'':v)}><SelectTrigger aria-label="Foreign payment bank"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">Choose account</SelectItem>{q.data?.accounts.map(a=><SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>)}</SelectContent></Select></label></div>
      {lookup.data?.nearest&&<p className="text-xs text-muted-foreground">Nearest available · {formatDate(lookup.data.rate_date)}</p>}
      {math&&<p className="td-num">{formatMoney(math.cash)} · FX {math.loss>=0?'loss':'gain'} {formatMoney(Math.abs(math.loss))}</p>}
      <Button disabled={busy||!math||!bank||preview.isPreviewActive} onClick={async()=>{if(!tenantId||!math)return;setBusy(true);try{const {error}=await supabase.rpc('finance_fx_payment_prepare',{t:tenantId,src:source,ident:id,d:date,original:Number(original),paid_rate:paidRate,bank,ref:''});if(error)throw error;toast.success('Payment draft ready for monthly approval');setOpen(false);await cache.invalidateQueries({queryKey:['finance-schedules']});}catch(e){toast.error(e instanceof Error?e.message:'Payment draft could not be prepared');}finally{setBusy(false);}}}>Prepare payment draft</Button>
    </div>}
  </div>;
}