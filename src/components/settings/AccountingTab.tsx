import {ScheduleSetup} from '@/components/finance/ScheduleSetup';
import {BaseCurrencySetting} from '@/components/settings/BaseCurrencySetting';
import {BooksStartSetting} from '@/components/settings/BooksStartSetting';
import {useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {useActiveTenant} from '@/hooks/useActiveTenant';
import {useChartOfAccounts} from '@/hooks/useChartOfAccounts';
import {useAccountMapping} from '@/hooks/useAccountMapping';
import {fetchAllRows} from '@/utils/fetchAllRows';
import {categorySuggestion} from '@/utils/settingsFacts';
import {formatTableInteger} from '@/utils/format';
import {supabase} from '@/integrations/supabase/client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import OpeningBalances from '@/pages/procurement/OpeningBalances';
import {toast} from 'sonner';
import {settingsHref,type SettingsDestination} from './settingsNavigation';
import PaymentsProcessorsPage from '@/pages/payments/PaymentsProcessorsPage';
import PaymentsMerchantsPage from '@/pages/payments/PaymentsMerchantsPage';
import PaymentsFeeRatesPage from '@/pages/payments/PaymentsFeeRatesPage';
type Category={id:string;name:string;kind:string;account:string|null;used:string};
export function AccountingTab({destination='currency'}:{destination:SettingsDestination}){const {tenantId}=useActiveTenant();const coa=useChartOfAccounts(),mapping=useAccountMapping();const [params,setParams]=useSearchParams();const [rows,setRows]=useState<Category[]>([]),[hasOpening,setHasOpening]=useState(false),[editing,setEditing]=useState<Category|null>(null),[account,setAccount]=useState(''),[search,setSearch]=useState('');const view=params.get('view');
 async function load(){if(!tenantId){setRows([]);return;}try{const [expense,cash,accounting,opening]=await Promise.all([fetchAllRows('expense_categories','*',undefined,tenantId,true),fetchAllRows('petty_cash_classifications','*',undefined,tenantId,true),fetchAllRows('accounting_categories','*',undefined,tenantId,true),supabase.from('account_opening_balances').select('id',{count:'exact',head:true}).eq('tenant_id',tenantId)]);setRows([...expense.map(e=>({id:e.id,name:e.name,kind:'expense',account:e.default_account_id,used:'Bills & receipts'})),...cash.map(e=>({id:e.id,name:e.name,kind:'cash',account:e.gl_account_id,used:'Cash-box receipts'})),...accounting.map(e=>({id:e.id,name:e.name,kind:'accounting',account:mapping.items.find(m=>m.rule_type==='invoice_expense'&&m.match_key===e.name)?.account_id??null,used:'Supplier invoices'}))].sort((a,b)=>a.name.localeCompare(b.name)));setHasOpening((opening.count??0)>0);}catch(e){toast.error((e as Error).message);}}
 useEffect(()=>{void load();},[tenantId,mapping.items]);
 function show(value?:string){setParams(value?{tab:'accounting',view:value}:{tab:'accounting'},{replace:true});}
 async function save(row:Category,id:string){if(!tenantId)return;const {error}=await supabase.rpc('settings_category_account',{t:tenantId,k:row.kind,i:row.id,a:id});if(error)toast.error(error.message);else{toast.success('Account mapping saved');setEditing(null);void mapping.fetchAll();void load();}}
 const missing=rows.filter(r=>!r.account).length;
 return <div className="space-y-5 min-w-0">
 {destination==='currency'&&<BaseCurrencySetting/>}
 {destination==='books-start'&&<BooksStartSetting/>}
 {destination==='schedule'&&<ScheduleSetup embedded/>}
 {destination==='tax'&&<ScheduleSetup tax embedded/>}
 {destination==='accounts'&&<div className="settings-summary-row"><div><h3 className="font-medium">Account names and codes</h3><p className="text-sm text-muted-foreground">Review and manage your chart in Finance Books.</p></div><Button asChild><Link to="/finance/books?view=chart-of-accounts">Open chart of accounts</Link></Button></div>}
 {destination==='mappings'&&<section className="space-y-4 min-w-0"><p className="text-sm text-muted-foreground">{formatTableInteger(missing)} categories without an account</p><Input aria-label="Search categories" placeholder="Search categories" value={search} onChange={e=>setSearch(e.target.value)}/><div className="overflow-x-auto"><table className="w-full text-sm" aria-label="Category account mappings"><thead><tr><th className="text-left py-3 w-[32%]">Name</th><th className="text-left">Account</th><th className="text-left w-[26%]">Used in</th></tr></thead><tbody>{rows.filter(r=>r.name.toLowerCase().includes(search.toLowerCase())).map(r=>{const a=coa.items.find(a=>a.id===r.account),suggestion=!a?categorySuggestion(r.name,coa.items):undefined;return <tr key={`${r.kind}:${r.id}`} className="border-t"><td className="py-3 pr-2 break-words"><Button variant="link" className="p-0 h-auto truncate text-left max-w-[var(--bani-name-max)]" title={r.name} onClick={()=>{setEditing(r);setAccount(r.account??'');}}>{r.name}</Button></td><td className="py-3 pr-2 break-words">{a?`${a.code} · ${a.name}`:<span className="text-warning">No account yet</span>}{suggestion&&<div className="mt-1 text-xs text-muted-foreground">Bani: {suggestion.code} · {coa.items.find(a=>a.id===suggestion.id)?.name}<Button variant="link" className="p-0 h-auto ml-2" onClick={()=>void save(r,suggestion.id)}>Accept</Button></div>}</td><td className="text-xs text-muted-foreground break-words">{r.used}</td></tr>;})}</tbody></table></div></section>}
 <Dialog open={!!editing} onOpenChange={o=>!o&&setEditing(null)}><DialogContent><DialogHeader><DialogTitle>{editing?.name} · account</DialogTitle></DialogHeader><Select value={account||undefined} onValueChange={setAccount}><SelectTrigger aria-label="Category account"><SelectValue placeholder="Pick an account"/></SelectTrigger><SelectContent>{coa.items.filter(a=>a.is_active).map(a=><SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent></Select><Button disabled={!account} onClick={()=>editing&&void save(editing,account)}>Save mapping</Button><Button variant="outline" onClick={()=>setEditing(null)}>Cancel</Button></DialogContent></Dialog>
 {destination==='processors'&&<section className="space-y-5"><nav aria-label="Card processor sections" className="settings-venue-nav">{[['processors','Processors'],['merchants','Merchants'],['fee-rates','Fee rates']].map(([key,label])=><Button key={key} asChild variant={(view??'processors')===key?'secondary':'ghost'} aria-current={(view??'processors')===key?'page':undefined}><Link to={`${settingsHref('processors')}&view=${key}`}>{label}</Link></Button>)}</nav><div className="max-w-full min-w-0 overflow-x-auto">{view==='merchants'?<PaymentsMerchantsPage/>:view==='fee-rates'?<PaymentsFeeRatesPage/>:<PaymentsProcessorsPage/>}</div></section>}
 {destination==='opening'&&<OpeningBalances/>}
 </div>;
}
