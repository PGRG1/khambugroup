import { useEffect, useState } from 'react';
import { useBaniAccounting } from '@/hooks/useBaniAccounting';
import { usePreviewMode } from '@/hooks/usePreviewMode';
import { PageTop } from '@/components/kit/PageTop';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
export default function Accounting(){
  const bani=useBaniAccounting();const {isPreviewActive}=usePreviewMode();
  const [enabled,setEnabled]=useState(true),[limit,setLimit]=useState(''),[saving,setSaving]=useState(false);
  useEffect(()=>{setEnabled(bani.settings.enabled);setLimit(bani.settings.ask_above===null?'':String(bani.settings.ask_above));},[bani.settings]);
  async function save(){if(!bani.tenantId||isPreviewActive)return;const amount=limit.trim()?Number(limit):null;if(amount!==null&&(!Number.isFinite(amount)||amount<0)){toast.error('Enter an amount of zero or more');return;}setSaving(true);const {error}=await supabase.rpc('bani_accounting_save_settings',{p_tenant:bani.tenantId,p_enabled:enabled,p_ask_above:amount});setSaving(false);if(error)toast.error(error.message);else{toast.success('Accounting settings saved');await bani.refresh();}}
  return <div className="space-y-5 min-w-0"><PageTop title="Accounting" actions={<Button onClick={save} disabled={saving||bani.loading||isPreviewActive}>Save</Button>}/><section className="card-glass p-5 space-y-5"><h2 className="font-display text-lg">Bani posting</h2><div className="flex items-center justify-between gap-4"><Label htmlFor="bani-auto-post">Bani posts automatically when sure</Label><Switch id="bani-auto-post" checked={enabled} onCheckedChange={setEnabled} disabled={isPreviewActive||bani.loading}/></div><div className="space-y-2"><Label htmlFor="bani-limit">Ask me above HK$</Label><Input id="bani-limit" className="max-w-xs" type="number" min="0" step="0.01" placeholder="No limit" value={limit} onChange={e=>setLimit(e.target.value)} disabled={isPreviewActive||bani.loading}/></div>{bani.settings.paused_reason&&<div className="kit-explain break-words"><p>Bani couldn't check this (AI unavailable)</p><p className="text-sm mt-1">{bani.settings.paused_reason}</p><Button className="mt-3" variant="outline" disabled={isPreviewActive||bani.busy} onClick={()=>bani.run('resume')}>Resume checks</Button></div>}</section></div>;
}