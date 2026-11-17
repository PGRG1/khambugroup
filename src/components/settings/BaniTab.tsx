import {Fragment,useEffect,useMemo,useState} from 'react';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {useBaniAccounting} from '@/hooks/useBaniAccounting';
import {fetchAllRows} from '@/utils/fetchAllRows';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {formatDate,formatTableInteger} from '@/utils/format';
import {fromRules,fromExamples,fromFeedback,fromNotes,type Learning,type LearningGroup,type Lookups} from '@/utils/baniLearning';
import {toast} from 'sonner';

const GROUPS:[LearningGroup,string][]=[['bank','Bank'],['invoices','Invoices'],['venues','Venues and suppliers']];

export function BaniTab(){
  const {tenantId}=useActiveTenant();const bani=useBaniAccounting();
  const [raw,setRaw]=useState<{rules:any[];feedback:any[];notes:any[];look:Lookups}>({rules:[],feedback:[],notes:[],look:{people:{},suppliers:{},products:{},venues:{}}});
  const [loading,setLoading]=useState(true),[filter,setFilter]=useState<'all'|LearningGroup>('all'),[search,setSearch]=useState(''),[open,setOpen]=useState<Learning|null>(null),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false);
  async function load(){if(!tenantId)return;setLoading(true);try{
    const [rules,feedback,notes,people,suppliers,products,venues]=await Promise.all([
      fetchAllRows('ai_learned_rules','*',{col:'updated_at',asc:false},tenantId,true),
      fetchAllRows('match_feedback','*',{col:'created_at',asc:false},tenantId,true),
      fetchAllRows('bani_memory_notes','*',{col:'created_at',asc:false},tenantId,true),
      supabase.from('profiles').select('user_id,display_name'),
      fetchAllRows('suppliers','id,name',undefined,tenantId,true),
      fetchAllRows('product_master','id,internal_product_name',undefined,tenantId,true),
      fetchAllRows('venues','id,name',undefined,tenantId,true)]);
    const map=(rows:any[],k:string,v:string)=>Object.fromEntries(rows.filter(r=>r[k]&&r[v]).map(r=>[r[k],r[v]]));
    setRaw({rules,feedback,notes,look:{people:map(people.data??[],'user_id','display_name'),suppliers:map(suppliers,'id','name'),products:map(products,'id','internal_product_name'),venues:Object.fromEntries(venues.map((v:any)=>[String(v.name).toLowerCase(),v.name]))}});
  }catch(e){toast.error((e as Error).message);}finally{setLoading(false);}}
  useEffect(()=>{void load();},[tenantId]);
  const items=useMemo(()=>[...fromRules(raw.rules,raw.look),...fromExamples(bani.examples,raw.look),...fromFeedback(raw.feedback,raw.look),...fromNotes(raw.notes,raw.look)].filter(i=>!i.forgotten),[raw,bani.examples]);
  const shown=items.filter(i=>(filter==='all'||i.group===filter)&&`${i.sentence} ${i.from} ${i.example}`.toLowerCase().includes(search.toLowerCase()));
  async function forget(){if(!open||!tenantId)return;setBusy(true);const {error}=await supabase.rpc('settings_forget_learning',{t:tenantId,k:open.kind,ids:open.ids});setBusy(false);
    if(error){toast.error(error.message);return;}setConfirm(false);setOpen(null);toast.success('Bani will no longer use this');void load();void bani.refresh();}
  return <><div className="p-4 sm:p-5 space-y-4">
    <div><h2 className="font-display text-lg font-semibold">What Bani learned</h2><p className="text-sm text-muted-foreground">{formatTableInteger(items.length)} things people taught Bani. It uses them the next time the same thing comes up.</p></div>
    {bani.settings.paused_reason&&<div className="kit-explain"><p>Bani can't check new bills right now: the AI spending limit for the workspace was reached. Nothing is posted while this lasts.</p><Button className="mt-3" variant="outline" disabled={bani.busy} onClick={()=>bani.run('resume')}>Try again</Button></div>}
    <div className="flex flex-wrap items-center gap-3"><div className="settings-tabs" role="tablist" aria-label="Filter learning">{([['all','All'],...GROUPS] as [string,string][]).map(([k,l])=><button key={k} role="tab" aria-selected={filter===k} onClick={()=>setFilter(k as any)}>{l}</button>)}</div><Input className="sm:ml-auto sm:max-w-xs" aria-label="Search what Bani learned" placeholder="Search" value={search} onChange={e=>setSearch(e.target.value)}/></div></div>
    {loading?<p className="p-8 text-center text-muted-foreground text-sm">Loading…</p>:!shown.length?<p className="p-8 text-center text-muted-foreground text-sm">{items.length?'Nothing matches this view.':'Nothing taught yet.'}</p>:
    GROUPS.filter(([g])=>shown.some(i=>i.group===g)).map(([g,label])=><section key={g} className="pb-2"><h3 className="px-4 sm:px-5 pt-3 pb-2 text-[11.5px] font-semibold uppercase tracking-[.08em] text-muted-foreground">{label}</h3>
      <table className="w-full table-fixed text-sm"><thead className="hidden sm:table-header-group"><tr className="text-xs text-muted-foreground border-y border-border"><th className="text-left font-medium py-2 px-4 sm:px-5 w-[52%]">What Bani learned</th><th className="text-left font-medium w-[26%]">From</th><th className="text-left font-medium pr-4">Used</th></tr></thead>
      <tbody>{shown.filter(i=>i.group===g).map(i=><tr key={i.key} className="settings-row border-b border-border/60" onClick={()=>setOpen(i)}><td className="py-3 px-4 sm:px-5 break-words align-top">{i.sentence}<p className="sm:hidden text-xs text-muted-foreground mt-1">{i.from}{i.added?` · ${formatDate(i.added)}`:''} · {i.used}</p></td><td className="hidden sm:table-cell align-top py-3 pr-3 text-muted-foreground">{i.from}{i.added&&<p className="text-xs">{formatDate(i.added)}</p>}</td><td className="hidden sm:table-cell align-top py-3 pr-4 text-muted-foreground">{i.used}</td></tr>)}</tbody></table></section>)}
    <Dialog open={!!open} onOpenChange={o=>{if(!o){setOpen(null);setConfirm(false);}}}><DialogContent><DialogHeader><DialogTitle className="break-words leading-snug">{open?.sentence}</DialogTitle><DialogDescription>What Bani learned</DialogDescription></DialogHeader>
      {open&&<dl className="text-sm grid grid-cols-[110px_1fr] gap-x-3 gap-y-2">{([['From',open.from],['Added',open.added?formatDate(open.added):'Not recorded'],['Taught by',open.by??'Not recorded'],['Used',open.used],['Example',open.example]] as [string,string][]).map(([k,v])=><Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="break-words">{v}</dd></Fragment>)}</dl>}
      {confirm?<div className="space-y-3 border-t border-border pt-3"><p className="text-sm">Bani will no longer use this, and will ask next time instead. Nothing already recorded changes.</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setConfirm(false)}>Keep it</Button><Button disabled={busy} onClick={()=>void forget()}>Forget</Button></div></div>
      :<div className="flex justify-between gap-2"><Button variant="outline" onClick={()=>setOpen(null)}>Close</Button><Button variant="outline" onClick={()=>setConfirm(true)}>Forget</Button></div>}
    </DialogContent></Dialog></>;
}
