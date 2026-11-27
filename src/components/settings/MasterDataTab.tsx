import {useMemo,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import ProductMasterTab from '@/components/procurement/ProductMasterTab';
import {useProductMaster} from '@/hooks/useProductMaster';
import {useSupplierDirectory} from '@/hooks/useSupplierDirectory';
import {directoryDuplicates} from '@/utils/supplierDirectory';
import {SupplierNameLink} from '@/components/vendors/SupplierProfileDialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Toolbar} from '@/components/kit/Toolbar';
import {PageAction} from '@/components/settings/SettingsForm';
import {Plus} from 'lucide-react';
import {useQuery} from '@tanstack/react-query';
import {useCanEditItemList} from '@/hooks/useCanEditItemList';
import {hongKongDate} from '@/utils/purchasingOverview';
import {rebateLabel,rebateProgress,type Rebate} from '@/utils/supplierRebates';
import {PhoneRow} from '@/components/finance/accounting/AccountingKit';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {useAuth} from '@/hooks/useAuth';
import {usePreviewMode} from '@/hooks/usePreviewMode';
import {supabase} from '@/integrations/supabase/client';
import {formatDate,formatTableInteger} from '@/utils/format';
import {toast} from 'sonner';
// Master data › Suppliers & vendors: a setup list, laid out like Revenue › Sales records. Suppliers send stock invoices;
// vendors send bills (CLP, Towngas…). Contact details missing show amber; possible duplicates sit behind one line.
const PAY_TERMS: Record<string,string> = { cod:'Cash on delivery', on_receipt:'On receipt', receipt:'On receipt' };
const termsLabel=(t:string|null)=>{if(!t)return '';const k=t.trim().toLowerCase();if(PAY_TERMS[k])return PAY_TERMS[k];const n=k.match(/^(?:net\s*)?(\d+)(?:\s*days?)?$/);return n?`${n[1]} days`:t;};
function SuppliersList(){const data=useSupplierDirectory();const {isAdmin}=useAuth();const {isPreviewActive}=usePreviewMode();
 const [search,setSearch]=useState(''),[status,setStatus]=useState('active'),[type,setType]=useState('all'),[busy,setBusy]=useState(false),[showIssues,setShowIssues]=useState(false);
 const [merge,setMerge]=useState<ReturnType<typeof directoryDuplicates>[number]|null>(null);
 const blank={name:'',type:'procurement',contact:'',phone:'',email:'',terms:'Net 30'};const [adding,setAdding]=useState<typeof blank|null>(null);
 const rows:any[]=data.data?.rows??[];
 const canDeals=useCanEditItemList()===true&&!isPreviewActive;
 const rebatesQ=useQuery({queryKey:['supplier-rebates',data.tenantId],enabled:!!data.tenantId,queryFn:async()=>{const {data:r,error}=await (supabase as any).from('supplier_rebates').select('*').eq('tenant_id',data.tenantId).eq('is_active',true);if(error)throw error;return (r??[]) as Rebate[];}});
 const today=hongKongDate();
 const spend=((data.data?.invoices??[]) as any[]).filter(i=>i.review_status==='Approved'||i.review_status==='Disputed').map(i=>({supplier_id:i.supplier_id,date:String(i.invoice_date),total:Number(i.total_amount??0)}));
 const rebateOf=(r:any)=>(rebatesQ.data??[]).find(x=>r.ids?.has?.(x.supplier_id)||x.supplier_id===r.id);
 const progressOf=(r:any)=>{const rb=rebateOf(r);return rb?rebateProgress(rb,spend,r.ids instanceof Set?r.ids:new Set([r.id]),today):null;};
 const earnedN=rows.filter(r=>!r.archived&&progressOf(r)?.earned).length;
 type RebateForm={id?:string;supplier:any;threshold:string;basis:'percent'|'fixed';value:string;period:'monthly'|'quarterly'|'yearly';starts_on:string};
 const [rebate,setRebate]=useState<RebateForm|null>(null);
 const openRebate=(r:any)=>{const rb=rebateOf(r);setRebate(rb?{id:rb.id,supplier:r,threshold:String(rb.threshold),basis:rb.basis,value:String(rb.value),period:rb.period,starts_on:rb.starts_on}:{supplier:r,threshold:'',basis:'percent',value:'',period:'quarterly',starts_on:today.slice(0,8)+'01'});};
 async function saveRebate(stop=false){if(!rebate||!data.tenantId)return;const t=Number(rebate.threshold),v=Number(rebate.value);
  if(!stop&&(!(t>0)||!(v>0)||(rebate.basis==='percent'&&v>=100))){toast.error('Enter the spend and what you get back');return;}
  setBusy(true);const db=(supabase as any).from('supplier_rebates');
  const {error}=stop?await db.update({is_active:false,ends_on:today,updated_at:new Date().toISOString()}).eq('id',rebate.id).eq('tenant_id',data.tenantId)
   :rebate.id?await db.update({threshold:t,basis:rebate.basis,value:v,period:rebate.period,starts_on:rebate.starts_on,updated_at:new Date().toISOString()}).eq('id',rebate.id).eq('tenant_id',data.tenantId)
   :await db.insert({tenant_id:data.tenantId,supplier_id:rebate.supplier.id,threshold:t,basis:rebate.basis,value:v,period:rebate.period,starts_on:rebate.starts_on});
  setBusy(false);if(error){toast.error(error.message);return;}toast.success(stop?'Rebate stopped':'Rebate saved');setRebate(null);void rebatesQ.refetch();}
 const kind=(r:any)=>r.vendor_type==='expense'?'Vendor':'Supplier';
 const supplies=(r:any)=>(r.categories??[]).join(', ');
 const duplicates=directoryDuplicates(rows);const noContact=rows.filter(r=>!r.archived&&!(r.contact_person??'').trim());
 const q=search.trim().toLowerCase();
 const shown=rows.filter(r=>(status==='all'||(status==='archived')===r.archived)&&(type==='all'||(type==='vendor')===(kind(r)==='Vendor'))&&(!q||`${r.name} ${r.contact_person??''} ${r.categories.join(' ')}`.toLowerCase().includes(q)));
 const suppliersN=rows.filter(r=>kind(r)==='Supplier').length,vendorsN=rows.length-suppliersN;
 const canMerge=isAdmin&&!isPreviewActive;
 async function alias(from:string,into:string|null){if(!data.tenantId)return;setBusy(true);const {error}=await supabase.rpc('set_supplier_directory_alias',{p_tenant:data.tenantId,p_from:from,p_into:into??undefined});setBusy(false);if(error){toast.error(error.message);return;}await data.refetch();setMerge(null);toast.success(into?'Merged. Invoices and payments are unchanged':'Merge undone');}
 const open=(e:React.MouseEvent<HTMLElement>)=>{if((e.target as HTMLElement).closest('button,a'))return;(e.currentTarget.querySelector('button,a') as HTMLElement|null)?.click();};
 const amber=(t:string)=><span className="text-[#B45309]">{t}</span>;
 const issues=duplicates.length+noContact.length+earnedN;
 async function addSupplier(){if(!adding||!data.tenantId)return;const name=adding.name.trim();if(!name)return;
  if(rows.some(r=>r.name.trim().toLowerCase()===name.toLowerCase())){toast.error(`${name} is already in the list`);return;}
  setBusy(true);const {error}=await supabase.from('suppliers').insert({tenant_id:data.tenantId,name,vendor_type:adding.type,contact_person:adding.contact.trim()||null,phone:adding.phone.trim()||null,email:adding.email.trim()||null,payment_terms:adding.terms,is_active:true,invoice_rounding_mode:'sum_then_round',categories:[],delivery_days:[],moq:0} as any);setBusy(false);
  if(error){toast.error(error.message);return;}toast.success(`${name} added`);setAdding(null);await data.refetch();}
 const field=(label:string,el:React.ReactNode)=><div><label className="mb-1.5 block text-[13px] text-muted-foreground">{label}</label>{el}</div>;
 return <>{canMerge&&<PageAction><Button size="sm" className="h-10 rounded-full" onClick={()=>setAdding(blank)}><Plus className="h-4 w-4"/>Add</Button></PageAction>}<section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label="Suppliers and vendors">
  <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5"><span>{formatTableInteger(rows.length)} suppliers and vendors</span><span className="text-[13px] text-muted-foreground font-normal whitespace-nowrap">· {formatTableInteger(suppliersN)} suppliers · {formatTableInteger(vendorsN)} vendors</span></h2>
  <Toolbar search={search} onSearch={setSearch} placeholder="Search suppliers and vendors" searchAfterControls mobileSearchBelow filter={<div className="flex gap-2">
   <Select value={type} onValueChange={setType}><SelectTrigger className="h-9 w-36 rounded-full" aria-label="Type"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All types</SelectItem><SelectItem value="supplier">Suppliers</SelectItem><SelectItem value="vendor">Vendors</SelectItem></SelectContent></Select>
   <Select value={status} onValueChange={setStatus}><SelectTrigger className="h-9 w-32 rounded-full" aria-label="Status"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="archived">Archived</SelectItem><SelectItem value="all">All</SelectItem></SelectContent></Select>
  </div>}/>
  {data.isError&&<p className="px-1 text-sm text-destructive">Could not load suppliers.</p>}
  {issues>0&&<p className="px-1 text-[13px] whitespace-nowrap overflow-hidden text-ellipsis"><b className="font-semibold">{[duplicates.length?`${formatTableInteger(duplicates.length)} possible duplicates`:'',noContact.length?`${formatTableInteger(noContact.length)} missing a contact`:'',earnedN?`${formatTableInteger(earnedN)} rebate${earnedN===1?'':'s'} earned`:''].filter(Boolean).join(' · ')}</b> · <button type="button" className="kit-link" onClick={()=>setShowIssues(v=>!v)}>{showIssues?'Hide them':'Show them'}</button></p>}
  {showIssues&&<ul className="px-1 text-[13px] space-y-1.5">
   {duplicates.map(d=><li key={d.from.id+d.into.id} className="flex flex-wrap gap-x-2"><span>{d.from.name} and {d.into.name} may be the same business</span>{canMerge&&<button type="button" className="kit-link" onClick={()=>setMerge(d)}>Merge</button>}</li>)}
   {rows.filter(r=>!r.archived&&progressOf(r)?.earned).map(r=>{const p=progressOf(r)!;return <li key={'rb'+r.id}>{r.name} rebate earned: HK${Math.round(p.amount).toLocaleString('en-HK')} on HK${Math.round(p.spent).toLocaleString('en-HK')} spent · ask them for it</li>;})}
   {noContact.map(r=><li key={r.id} className="flex gap-x-2"><span>{r.name} has no contact</span><SupplierNameLink id={r.id}><span className="kit-link">Add contact</span></SupplierNameLink></li>)}
   {data.data?.suppliers.filter(s=>s.directory_merged_into).map(s=><li key={s.id} className="text-muted-foreground">✓ {s.name} merged into {data.data?.suppliers.find(a=>a.id===s.directory_merged_into)?.name}{canMerge&&<> · <button type="button" className="kit-link" disabled={busy} onClick={()=>alias(s.id,null)}>Undo</button></>}</li>)}
  </ul>}
  <ul className="sm:hidden kit">{shown.map(r=><PhoneRow key={r.id} title={<SupplierNameLink id={r.id}>{r.name}</SupplierNameLink>} amount={kind(r)} sub={`${(r.contact_person??'').trim()||'No contact'} · ${termsLabel(r.payment_terms)||'No terms'}`} tone={r.archived?'mut':'mut'}/>)}</ul>
  <div className="hidden sm:block kit sales-table-scroll" tabIndex={0} role="region" aria-label="Suppliers table"><table className="sales-table" aria-label="Suppliers and vendors">
   <thead><tr>{['Name','Type','Supplies','Payment terms','Contact','Phone','Rebate'].map(h=><th key={h} scope="col" className="sales-cell-left">{h}</th>)}<th scope="col" className="sales-cell-right">Status</th></tr></thead>
   <tbody>{shown.map(r=>{const c=(r.contact_person??'').trim(),ph=(r.phone??'').trim(),t=termsLabel(r.payment_terms);return <tr key={r.id} className={`sales-record-row ${r.archived?'sales-closed-row':''}`} onClick={open}>
    <td className="sales-cell-left font-medium" title={r.name}><SupplierNameLink id={r.id}>{r.name}</SupplierNameLink></td>
    <td className="sales-cell-left whitespace-nowrap">{kind(r)}</td>
    <td className="sales-cell-left text-muted-foreground" title={supplies(r)}>{supplies(r)||'—'}</td>
    <td className="sales-cell-left whitespace-nowrap">{t||(r.archived?'—':amber('Not set'))}</td>
    <td className="sales-cell-left" title={c}>{c||(r.archived?'—':amber('Not set'))}</td>
    <td className="sales-cell-left whitespace-nowrap">{ph||(r.archived?'—':amber('Not set'))}</td>
    <td className="sales-cell-left whitespace-nowrap">{(()=>{const rb=rebateOf(r),p=progressOf(r);const text=rb?<span className="text-[#2F7A5E]" title={p?`${p.pct}% of the spend this period`:undefined}>{rebateLabel(rb)}</span>:<span className="text-muted-foreground">—</span>;return canDeals&&kind(r)==='Supplier'&&!r.archived?<button type="button" className="text-left hover:underline" onClick={e=>{e.stopPropagation();openRebate(r);}}>{rb?text:<span className="text-muted-foreground">Add</span>}</button>:text;})()}</td>
    <td className="sales-cell-right whitespace-nowrap">{r.archived?'Archived':r.is_active?'Active':'Inactive'}</td>
   </tr>;})}</tbody></table></div>
  {!shown.length&&<p className="p-10 text-center text-sm text-muted-foreground">{data.isPending?'Loading suppliers…':q||status!=='active'||type!=='all'?'Nothing matches your search or filters.':'No suppliers or vendors yet.'}</p>}
  <Dialog open={!!merge} onOpenChange={o=>!o&&setMerge(null)}><DialogContent className="!bg-card !backdrop-blur-none"><DialogHeader><DialogTitle>Merge these two?</DialogTitle><DialogDescription>{merge?.from.name} → {merge?.into.name}</DialogDescription></DialogHeader><p className="text-sm">They show as one in this list. Invoices, payments and the books are not changed, and you can undo it.</p><div className="flex justify-end gap-2"><Button variant="outline" className="rounded-full" onClick={()=>setMerge(null)}>Cancel</Button><Button className="rounded-full" disabled={busy} onClick={()=>merge&&alias(merge.from.id,merge.into.id)}>Merge</Button></div></DialogContent></Dialog>
  <Dialog open={!!rebate} onOpenChange={o=>!o&&!busy&&setRebate(null)}><DialogContent className="!bg-card !backdrop-blur-none"><DialogHeader><DialogTitle>Rebate · {rebate?.supplier.name}</DialogTitle><DialogDescription>Money back from this supplier when you spend enough</DialogDescription></DialogHeader>
   {rebate&&<div className="space-y-3.5">
    {field('When you spend',<Input className="h-10 text-[14px]" inputMode="decimal" placeholder="100000" value={rebate.threshold} onChange={e=>setRebate({...rebate,threshold:e.target.value})}/>)}
    {field('You get back',<><div className="grid grid-cols-2 gap-2 mb-2">{([['percent','A % of spend','e.g. 2% back'],['fixed','A fixed amount','e.g. HK$5,000']] as const).map(([k,t,l])=><button key={k} type="button" aria-pressed={rebate.basis===k} onClick={()=>setRebate({...rebate,basis:k})} className={`text-left rounded-lg border px-3 py-2 ${rebate.basis===k?'border-[rgba(31,107,94,0.35)] bg-[rgba(31,107,94,0.08)]':'border-border bg-white'}`}><p className="text-[13px] font-medium">{t}</p><p className="text-[12px] text-muted-foreground">{l}</p></button>)}</div><Input className="h-10 text-[14px]" inputMode="decimal" placeholder={rebate.basis==='percent'?'2':'5000'} value={rebate.value} onChange={e=>setRebate({...rebate,value:e.target.value})}/></>)}
    <div className="grid grid-cols-2 gap-3">{field('Counted',<Select value={rebate.period} onValueChange={v=>setRebate({...rebate,period:v as RebateForm['period']})}><SelectTrigger className="h-10 text-[14px]"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="monthly">Every month</SelectItem><SelectItem value="quarterly">Every quarter</SelectItem><SelectItem value="yearly">Every year</SelectItem></SelectContent></Select>)}{field('From',<Input type="date" className="h-10 text-[14px]" value={rebate.starts_on} onChange={e=>setRebate({...rebate,starts_on:e.target.value})}/>)}</div>
    <p className="text-[12px] text-muted-foreground">Counted from this supplier's approved invoices. When it's earned, Bani tells you to ask for it.</p>
    <div className="flex items-center gap-2 pt-1">{rebate.id&&<Button variant="ghost" className="mr-auto" disabled={busy} onClick={()=>void saveRebate(true)}>Stop rebate</Button>}<Button variant="outline" className="ml-auto rounded-full" disabled={busy} onClick={()=>setRebate(null)}>Cancel</Button><Button className="rounded-full bg-[#1F6B5E] text-white hover:bg-[#1A5C51]" disabled={busy} onClick={()=>void saveRebate()}>{busy?'Saving…':'Save'}</Button></div>
   </div>}
  </DialogContent></Dialog>
  <Dialog open={!!adding} onOpenChange={o=>!o&&!busy&&setAdding(null)}><DialogContent className="!bg-card !backdrop-blur-none"><DialogHeader><DialogTitle>Add a supplier or vendor</DialogTitle></DialogHeader>
   {adding&&<div className="space-y-3.5">
    {field('Name',<Input className="h-10 text-[14px]" value={adding.name} placeholder="Angliss HK Food Service" onChange={e=>setAdding({...adding,name:e.target.value})}/>)}
    {field('Type',<div className="grid grid-cols-2 gap-2">{[['procurement','Supplier','Stock and goods on invoices'],['expense','Vendor','Bills and running costs (CLP, rent…)']].map(([k,t,l])=><button key={k} type="button" aria-pressed={adding.type===k} onClick={()=>setAdding({...adding,type:k})} className={`text-left rounded-lg border px-3 py-2 ${adding.type===k?'border-[rgba(31,107,94,0.35)] bg-[rgba(31,107,94,0.08)]':'border-border bg-white'}`}><p className="text-[13px] font-medium">{t}</p><p className="text-[12px] text-muted-foreground">{l}</p></button>)}</div>)}
    <div className="grid grid-cols-2 gap-3">{field('Contact',<Input className="h-10 text-[14px]" value={adding.contact} placeholder="Name" onChange={e=>setAdding({...adding,contact:e.target.value})}/>)}{field('Phone',<Input className="h-10 text-[14px]" inputMode="tel" value={adding.phone} onChange={e=>setAdding({...adding,phone:e.target.value})}/>)}</div>
    {field('Email',<Input className="h-10 text-[14px]" type="email" value={adding.email} onChange={e=>setAdding({...adding,email:e.target.value})}/>)}
    {field('Payment terms',<Select value={adding.terms} onValueChange={v=>setAdding({...adding,terms:v})}><SelectTrigger className="h-10 text-[14px]"><SelectValue/></SelectTrigger><SelectContent>{['COD','On receipt','Net 7','Net 14','Net 30','Net 60','Monthly','Autopay'].map(t=><SelectItem key={t} value={t}>{termsLabel(t)}</SelectItem>)}</SelectContent></Select>)}
    <div className="flex justify-end gap-2 pt-1"><Button variant="outline" className="rounded-full" disabled={busy} onClick={()=>setAdding(null)}>Cancel</Button><Button className="rounded-full bg-[#1F6B5E] text-white hover:bg-[#1A5C51]" disabled={busy||!adding.name.trim()} onClick={()=>void addSupplier()}>{busy?'Adding…':'Add'}</Button></div>
   </div>}
  </DialogContent></Dialog>
 </section></>;
}
const MD_TABS=[['suppliers','Suppliers & vendors'],['products','Products'],['categories','Categories']] as const;
export function MasterDataTab({destination}:{destination?:'suppliers'|'products'|'categories'}){const [params,setParams]=useSearchParams();const tab=destination??MD_TABS.find(t=>t[0]===params.get('md'))?.[0]??'suppliers';
 return <div className="contents">{tab==='suppliers'?<SuppliersList/>:<section className="kit settings-card min-w-0">{tab==='products'?<div className="min-w-0"><ProductMasterTab popup/></div>:<CategoriesList/>}</section>}</div>;}

function CategoriesList(){const {products,loading}=useProductMaster();const [group,setGroup]=useState<string|null>(null),[review,setReview]=useState<string|null>(null);
 const {groups,dupes}=useMemo(()=>{const g=new Map<string,Map<string,number>>();const names=new Map<string,Set<string>>();for(const p of products){const top=p.level1_category?.trim()||'Not set';const m=g.get(top)??new Map<string,number>();g.set(top,m);for(const c of [p.level2_category,p.level3_category]){const n=c?.trim();if(!n)continue;const path=`${top} › ${p.level2_category?.trim()??''}${c===p.level3_category?` › ${n}`:''}`;if(c===p.level2_category)m.set(n,(m.get(n)??0)+1);const k=n.toLowerCase();const set=names.get(k)??new Set<string>();set.add(path);names.set(k,set);}}
  const dupes=[...names.entries()].filter(([,s])=>s.size>1).map(([k,s])=>({name:products.flatMap(p=>[p.level2_category,p.level3_category]).find(c=>c?.trim().toLowerCase()===k)?.trim()??k,paths:[...s]}));
  return {groups:[...g.entries()].map(([name,m])=>({name,cats:[...m.entries()].sort((a,b)=>a[0].localeCompare(b[0])),count:products.filter(p=>(p.level1_category?.trim()||'Not set')===name).length})).sort((a,b)=>a.name.localeCompare(b.name)),dupes};},[products]);
 const open=groups.find(g=>g.name===group),dup=dupes.find(d=>d.name===review);
 return <div className="space-y-4 min-w-0"><div><p className="text-sm text-muted-foreground">{formatTableInteger(groups.length)} groups · {formatTableInteger(products.length)} products</p></div>
 {dupes.map(d=><p key={d.name} className="settings-note-amber break-words">{d.name} ×{formatTableInteger(d.paths.length)} — the same category name is used in more than one place. <Button variant="outline" size="sm" className="ml-2 h-7" onClick={()=>setReview(d.name)}>Review</Button></p>)}
 {loading?<p className="text-muted-foreground text-sm">Loading categories…</p>:<div className="divide-y divide-border border-y border-border">{groups.map(g=><div key={g.name} className="settings-row py-3 px-2 flex justify-between gap-3" onClick={()=>setGroup(g.name)}><div className="min-w-0"><p className={g.name==='Not set'?'font-medium settings-amber':'font-medium'}>{g.name}</p><p className="text-xs text-muted-foreground">{formatTableInteger(g.cats.length)} categories</p></div><span className="text-sm text-muted-foreground whitespace-nowrap">{formatTableInteger(g.count)} products</span></div>)}{!groups.length&&<p className="py-6 text-sm text-muted-foreground">No product categories yet.</p>}</div>}

 <Dialog open={!!open} onOpenChange={o=>!o&&setGroup(null)}><DialogContent><DialogHeader><DialogTitle>{open?.name}</DialogTitle><DialogDescription>{formatTableInteger(open?.count??0)} products</DialogDescription></DialogHeader><div className="divide-y divide-border">{open?.cats.map(([c,n])=><div key={c} className="py-2 flex justify-between text-sm"><span className="break-words">{c}</span><span className="text-muted-foreground">{formatTableInteger(n)} products</span></div>)}{!open?.cats.length&&<p className="text-sm text-muted-foreground py-2">No categories under this group.</p>}</div></DialogContent></Dialog>
 <Dialog open={!!dup} onOpenChange={o=>!o&&setReview(null)}><DialogContent><DialogHeader><DialogTitle>{dup?.name} ×{dup?.paths.length}</DialogTitle><DialogDescription>Where this category name is used</DialogDescription></DialogHeader><ul className="text-sm space-y-2">{dup?.paths.map(p=><li key={p} className="break-words">{p}</li>)}</ul><p className="text-xs text-muted-foreground">Rename or move products in the Products tab to combine them.</p></DialogContent></Dialog></div>;}
