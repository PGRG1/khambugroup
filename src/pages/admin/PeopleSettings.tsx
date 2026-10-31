import {useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Switch} from '@/components/ui/switch';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {usePeopleSettings} from '@/hooks/usePeopleSettings';
import {useVenues} from '@/hooks/useVenues';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {usePagePermissions} from '@/hooks/usePagePermissions';
import {supabase} from '@/integrations/supabase/client';
import {peopleDefaults,resolvePeopleSettings,type PeopleSettings} from '@/utils/people';
import {toast} from 'sonner';
const labels:Record<keyof PeopleSettings,string>={rota:'Rota',clock_in:'Clock in/out',pay_hours:'Hours for pay come from',leave_requests:'Leave requests in app',sick_notes:'Sick notes',staff_app:'Staff app',payslips:'Payslips in staff app',managers_change_pay:'Managers can change pay',reliability:'Reliability on profile',approvals:'Approvals'};
const options:Record<string,[string,string][]>= {clock_in:[['off','Off'],['phone','Phone'],['venue_phone','Phone only at the venue']],pay_hours:[['rota','Rota'],['clock_ins','Clock-ins'],['typed_monthly','Typed monthly']],approvals:[['owner_run','Owner-run'],['managed','Managed'],['strict','Strict']]};
export default function PeopleSettingsPage(){const {tenantId}=useActiveTenant();const settings=usePeopleSettings();const {venues}=useVenues();const {isPreviewActive}=usePagePermissions();const [scope,setScope]=useState('company');const [draft,setDraft]=useState<Partial<PeopleSettings>>({});const [saving,setSaving]=useState(false);
 useEffect(()=>setDraft(settings.rows.find(r=>(r.venue_id??'company')===scope)?.values??{}),[scope,settings.rows]);
 const effective=resolvePeopleSettings(scope==='company'?draft:settings.company,scope==='company'?{}:draft);
 const save=async()=>{if(!tenantId||isPreviewActive)return;setSaving(true);const {error}=await supabase.rpc('save_people_settings',{t:tenantId,v:scope==='company'?null:scope,p:draft});setSaving(false);if(error)toast.error(error.message);else{toast.success('People settings saved');window.dispatchEvent(new Event('people-settings-changed'));}};
 return <div className="kit p-4 sm:p-6 space-y-5 min-w-0"><header className="flex justify-between gap-3"><h1 className="font-display text-2xl font-semibold">People settings</h1><Button onClick={save} disabled={saving||isPreviewActive}>Save</Button></header>
 <nav aria-label="People settings scope" className="flex overflow-x-auto border-b border-border">{[{id:'company',name:'Company'},...venues.filter(v=>v.is_active)].map(v=><Button key={v.id} variant="ghost" className="shrink-0 rounded-none" aria-pressed={scope===v.id} onClick={()=>setScope(v.id)}>{v.name}</Button>)}</nav>
 <section className="rounded-lg border border-border bg-card p-4"><h2 className="font-display font-semibold mb-4">{scope==='company'?'Company':venues.find(v=>v.id===scope)?.name}</h2>
 {(Object.keys(peopleDefaults) as (keyof PeopleSettings)[]).filter(k=>k!=='payslips'||effective.staff_app).map(k=><div key={k} className="flex flex-wrap items-center justify-between gap-3 py-3 border-b border-border"><span>{labels[k]}</span><div className="flex items-center gap-3">{options[k]?<Select value={String(effective[k])} onValueChange={v=>setDraft(d=>({...d,[k]:v}))}><SelectTrigger aria-label={labels[k]} className="w-[200px]"><SelectValue/></SelectTrigger><SelectContent>{options[k].map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>:<Switch aria-label={labels[k]} checked={Boolean(effective[k])} onCheckedChange={v=>setDraft(d=>({...d,[k]:v}))}/>} {scope!=='company'&&<Button variant="ghost" size="sm" disabled={draft[k]===undefined} onClick={()=>setDraft(d=>{const n={...d};delete n[k];return n;})}>Use Company</Button>}</div></div>)}
 </section></div>;
}