import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import {useOrganizations} from '@/hooks/useOrganizations';
import {Status,PhoneRow,Empty,keyOpen} from '@/components/finance/accounting/AccountingKit';
import {FinanceViewTabs} from '@/components/finance/FinanceViewTabs';
import {CompanyDetails} from './CompanyDetails';
import {Choice,PlainList,PageAction,SettingsCard,Field,SaveBar} from './SettingsForm';
import {TeamWorkingSettings} from '@/components/settings/TeamWorkingSettings';
import {CentralSharingSetting} from '@/components/settings/CentralSharingSetting';
import {useEffect,useState} from 'react';
import {Link,Navigate,useSearchParams} from 'react-router-dom';
import {resolveVenueSection,type SettingsDestination} from '@/utils/settingsNavigation';
import {useVenues,type Venue} from '@/hooks/useVenues';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {useSeatHistory} from '@/hooks/useSeatHistory';
import {useRevenueSources} from '@/hooks/useRevenueSources';
import {useVenueServicePeriods} from '@/hooks/useVenueServicePeriods';
import {usePurchasingMode} from '@/hooks/usePurchasingMode';
import {VenueSeatsTab,VenuePeriodsTab,VenueClosuresTab,VenueAreasTab,VenueLocationTab,VenueAddressCard} from '@/components/settings/VenueTabs';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {supabase} from '@/integrations/supabase/client';
import {toast} from 'sonner';
import {Plus} from 'lucide-react';
import {formatTableInteger} from '@/utils/format';
import {useQueryClient} from '@tanstack/react-query';
export function BusinessTab({destination='company'}:{destination?:SettingsDestination}){
 const {isPlatformAdmin:bani}=usePlatformAdmin(); // venues are added, renamed, closed and reopened by the Bani team only (enforced in the database too)
 const v=useVenues(),org=useOrganizations(),seats=useSeatHistory(),sources=useRevenueSources(),periods=useVenueServicePeriods(),buy=usePurchasingMode();const {tenantId,memberships}=useActiveTenant();const cache=useQueryClient();const [params,setParams]=useSearchParams();
 const [statusConfirm,setStatusConfirm]=useState(false);const view=resolveVenueSection(params);const [selected,setSelected]=useState<Venue|null>(null),[locations,setLocations]=useState<any[]>([]),[newArea,setNewArea]=useState(''),[lat,setLat]=useState(''),[address,setAddress]=useState(''),[lng,setLng]=useState(''),[sourceOpen,setSourceOpen]=useState(false),[source,setSource]=useState<any>(null),[ref,setRef]=useState('last_count'),[newVenue,setNewVenue]=useState(false),[venueName,setVenueName]=useState('');
 const loadAreas=async()=>{if(!tenantId)return;const {data}=await supabase.from('stock_locations').select('*').eq('tenant_id',tenantId).order('sort_order');setLocations(data??[]);};
 useEffect(()=>{void loadAreas();if(tenantId)supabase.from('app_config').select('value').eq('tenant_id',tenantId).eq('key','stock_count_reference_mode').maybeSingle().then(({data})=>setRef(data?.value==='none'?'none':'last_count'));},[tenantId]);
 useEffect(()=>{const id=params.get('venue');setSelected(id?v.venues.find(v=>v.id===id)??null:null);},[params,v.venues]);
 useEffect(()=>{if(!selected||!tenantId)return;supabase.from('venues').select('latitude,longitude,address').eq('id',selected.id).eq('tenant_id',tenantId).maybeSingle().then(({data}:any)=>{setAddress(data?.address??'');setLat(data?.latitude==null?'':String(data.latitude));setLng(data?.longitude==null?'':String(data.longitude));});},[selected?.id,tenantId]);
 const name=memberships.find(m=>m.tenant_id===tenantId)?.tenant_name??'Business';
 const closeDialog=()=>{setStatusConfirm(false);setSelected(null);setParams({tab:'business',section:'venues'});};
 const openVenue=(venue:Venue,section='seats')=>{setParams({tab:'business',venue:venue.id,section});};
 async function config(key:string,value:string){if(!tenantId)return;const {error}=await supabase.from('app_config').upsert({tenant_id:tenantId,key,value},{onConflict:'tenant_id,key'});if(error)toast.error(error.message);else{if(key==='stock_count_reference_mode')setRef(value);void cache.invalidateQueries({queryKey:['purchasing-mode',tenantId]});}}
 return <div className="contents">
 {destination==='company'&&<CompanyDetails fallbackName={name}/>}
 {destination==='venues'&&!selected&&(()=>{const rowsV=v.venues.map(venue=>({venue,areas:locations.filter(l=>l.venue_id===venue.id&&l.is_active).length,count:periods.rows.filter(p=>p.venueId===venue.id&&p.isActive).length})).sort((a,b)=>Number(b.venue.is_active)-Number(a.venue.is_active)||a.venue.name.localeCompare(b.venue.name));const status=(r:typeof rowsV[number])=>!r.venue.is_active?{text:'Closed',tone:'mut' as const}:!r.venue.seats?{text:'Seats not set',tone:'amber' as const}:{text:'Open',tone:'ok' as const};
 return <>{bani?<PageAction><Button size="sm" className="h-10 rounded-full" onClick={()=>setNewVenue(true)}><Plus className="h-4 w-4"/>Add venue</Button></PageAction>:null}
 {params.has('venue')&&!v.loading?<p role="alert" className="kit-explain">This venue is not available in the current business. <Button variant="link" onClick={closeDialog}>Back to Venues</Button></p>:
 <><SettingsCard title="Venues"><div className="min-w-0" aria-busy={v.loading}>
 <ul className="min-[768px]:hidden kit">{rowsV.map(r=>{const s=status(r);return <PhoneRow key={r.venue.id} flag={s.tone==='amber'&&s.text} title={r.venue.name} amount={r.venue.seats?`${formatTableInteger(r.venue.seats)} seats`:'—'} sub={`${s.text} · ${formatTableInteger(r.count)} service periods · ${formatTableInteger(r.areas)} stock areas`} tone={s.tone==='amber'?'amber':'mut'} onOpen={()=>openVenue(r.venue)}/>;})}</ul>
 <div className="hidden min-[768px]:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Venues table"><table className="sales-table" aria-label="Venues"><thead><tr><th scope="col" className="sales-cell-left">Venue</th><th scope="col" className="sales-cell-left">Address</th><th scope="col" className="sales-cell-right">Seats</th><th scope="col" className="sales-cell-right">Service periods</th><th scope="col" className="sales-cell-right">Stock areas</th><th scope="col" className="sales-cell-left">Status</th></tr></thead>
 <tbody>{rowsV.map(r=>{const s=status(r);return <tr key={r.venue.id} className="sales-record-row" {...keyOpen(()=>openVenue(r.venue))}><td className="sales-cell-left font-medium">{r.venue.name}</td><td className="sales-cell-left">{r.venue.address?<span className="block truncate" title={r.venue.address}>{r.venue.address}</span>:<span className="text-[#B45309]">Not set</span>}</td><td className="kit-num">{r.venue.seats?formatTableInteger(r.venue.seats):r.venue.is_active?<span className="text-[#B45309]">Not set</span>:<span className="text-muted-foreground">—</span>}</td><td className="kit-num">{formatTableInteger(r.count)}</td><td className="kit-num">{formatTableInteger(r.areas)}</td><td className="sales-cell-left"><span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${s.tone==='amber'?'text-[#B45309]':s.tone==='mut'?'text-muted-foreground':''}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${s.tone==='amber'?'bg-[#C26A12]':s.tone==='mut'?'bg-[#B8C0BB]':'bg-[#3E9B6B]'}`}/>{s.text}</span></td></tr>;})}</tbody></table></div>
 {!v.loading&&!v.venues.length&&<Empty>No venues yet. Add your first venue.</Empty>}</div></SettingsCard>{!bani&&<p className="px-1 text-[13px] text-muted-foreground">Company details and new venues are set up by Bani.</p>}</>}</>;})()}
 {destination==='purchasing'&&<><Choice label="How you buy" value={buy.mode as 'by_venue'|'central'} onChange={k=>void config('purchasing_mode',k)} options={[{key:'by_venue',title:'By venue',line:'Each venue buys for itself'},{key:'central',title:'Central',line:'One kitchen buys for every venue'}]}/><CentralSharingSetting/></>}
 {destination==='stock'&&<Choice label="When counting stock, show" value={(ref==='none'?'none':'last_count') as 'none'|'last_count'} onChange={k=>void config('stock_count_reference_mode',k)} options={[{key:'none',title:'Nothing',line:'Blind count: counters start from zero'},{key:'last_count',title:'Last approved count',line:'Counters see the last figure for each item'}]}/>}
 {destination==='team'&&<TeamWorkingSettings/>}
 {destination==='sources'&&<><PageAction><Button size="sm" className="h-10 rounded-full" onClick={()=>{setSource({name:'',description:''});setSourceOpen(true);}}><Plus className="h-4 w-4"/>Add source</Button></PageAction>
 <SettingsCard title="In use"><PlainList empty="No sales sources yet." rows={sources.sources.filter(s=>s.is_active).map(s=>({id:s.id,name:s.name,line:s.description||undefined,onOpen:()=>{setSource({...s});setSourceOpen(true);}}))}/></SettingsCard>
 {sources.sources.some(s=>!s.is_active)&&<SettingsCard title="Archived"><PlainList empty="" rows={sources.sources.filter(s=>!s.is_active).map(s=>({id:s.id,name:s.name,line:s.description||undefined,onOpen:()=>{setSource({...s});setSourceOpen(true);}}))}/></SettingsCard>}</>}
 {selected&&destination==='venues'&&<section className="settings-venue space-y-4 min-w-0"><header><button type="button" className="text-[13px] text-[#1F6B5E]" onClick={closeDialog}>‹ Business</button><h1 className="mt-1 text-[20px] font-semibold flex flex-wrap items-baseline gap-x-2"><span>{selected.name}</span>{!selected.is_active&&<span className="text-[13px] font-normal"><Status text="Closed" tone="mut"/></span>}</h1></header><FinanceViewTabs param="section" value={view==='accounts'?'seats':view==='closures'?'periods':view} items={[{key:'seats',label:'Seats'},{key:'periods',label:'Opening hours'},{key:'location',label:'Location'},...(bani?[{key:'status',label:'Status'}]:[])]}/><div className="min-w-0 space-y-4">
 {view==='seats'&&<VenueSeatsTab venueId={selected.id} tenantId={tenantId} history={seats.rows.filter(h=>h.venue_id===selected.id)} onSaved={()=>{void seats.reload();void v.reload();}}/>}
 {/* Opening hours: when the venue trades (service periods) and when it doesn't (closures), one tab. */}
 {(view==='periods'||view==='closures')&&<><VenuePeriodsTab venueId={selected.id} onChanged={periods.refetch}/><VenueClosuresTab venueId={selected.id} venueName={selected.name}/></>}
 {view==='areas'&&<Navigate to="/procurement/stock-areas" replace/>}
 {view==='location'&&<VenueAddressCard key={'a'+selected.id} venueId={selected.id} tenantId={tenantId} address={address} onSaved={(a)=>{setAddress(a);void v.reload();}}/>}
 {view==='location'&&<VenueLocationTab key={selected.id} venueId={selected.id} tenantId={tenantId} lat={lat} lng={lng} onSaved={(a,b)=>{setLat(a);setLng(b);}}/>}
 {view==='accounts'&&<p className="settings-card text-sm text-muted-foreground">A venue's sales, service charge, tips and cash accounts are set in one place: <Link className="kit-link" to="/finance/books?view=chart-of-accounts">Finance › Accounting › How things post</Link>.</p>}
 {view==='status'&&<div className="settings-card space-y-4"><h3 className="font-medium">{!bani?'Status':selected.is_active?'Close venue':'Reopen venue'}</h3><p className="text-sm text-muted-foreground">{bani?'All existing records will be retained.':`${selected.name} is ${selected.is_active?'open':'closed'}. Contact Bani to ${selected.is_active?'close':'reopen'} it.`}</p>{bani&&<Button variant="outline" onClick={()=>setStatusConfirm(true)}>{selected.is_active?'Close venue':'Reopen venue'}</Button>}<Dialog open={statusConfirm} onOpenChange={setStatusConfirm}><DialogContent><DialogHeader><DialogTitle>{selected.is_active?'Close':'Reopen'} {selected.name}?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">All records will be retained.</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setStatusConfirm(false)}>Cancel</Button><Button onClick={async()=>{if(await v.update(selected.id,{is_active:!selected.is_active}))closeDialog();}}>Confirm</Button></div></DialogContent></Dialog></div>}
 </div></section>}
 
 {sourceOpen&&source&&<SettingsCard title={source.id?source.name||'Sales source':'New sales source'} editing action={source.id&&<Button variant="outline" size="sm" className="rounded-full" onClick={async()=>{if(await sources.update(source.id,{is_active:!source.is_active})){setSource(null);setSourceOpen(false);}}}>{source.is_active?'Archive':'Restore'}</Button>}>
 <Field label="Name" htmlFor="source-name" missing={!source.name?.trim()}><Input id="source-name" value={source.name} onChange={e=>setSource({...source,name:e.target.value})}/></Field>
 <Field label="Description" htmlFor="source-description"><Input id="source-description" placeholder="Optional" value={source.description??''} onChange={e=>setSource({...source,description:e.target.value})}/></Field>
 <SaveBar dirty={!!source.name?.trim()} onSave={async()=>{const ok=source.id?await sources.update(source.id,{name:source.name,description:source.description}):await sources.create({name:source.name,description:source.description});if(ok){setSource(null);setSourceOpen(false);}}} onCancel={()=>{setSource(null);setSourceOpen(false);}}/></SettingsCard>}
 <Dialog open={bani&&newVenue} onOpenChange={setNewVenue}><DialogContent><DialogHeader><DialogTitle>Add venue</DialogTitle></DialogHeader><Input aria-label="Venue name" value={venueName} onChange={e=>setVenueName(e.target.value)}/><Button disabled={!venueName.trim()} onClick={async()=>{if(await v.create({name:venueName,organization_id:org.organizations[0]?.id})){setNewVenue(false);setVenueName('');}}}>Add venue</Button></DialogContent></Dialog>
 </div>;
}
