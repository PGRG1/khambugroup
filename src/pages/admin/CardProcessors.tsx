import {useSearchParams,Link} from 'react-router-dom';
import {PageTop} from '@/components/kit/PageTop';
import {FinanceViewTabs} from '@/components/finance/FinanceViewTabs';
import {Button} from '@/components/ui/button';
import {SettingsCard,Row} from '@/components/settings/SettingsForm';
import {usePaymentSettlements} from '@/hooks/usePaymentSettlements';
import PaymentsProcessorsPage from '@/pages/payments/PaymentsProcessorsPage';
import PaymentsMerchantsPage from '@/pages/payments/PaymentsMerchantsPage';
import PaymentsFeeRatesPage from '@/pages/payments/PaymentsFeeRatesPage';
const pct=(n:number)=>`${(n*100).toFixed(2)}%`;
// Settings: one read-first card per processor; Edit opens the existing processor, merchant and fee editors.
function ProcessorCards({onEdit}:{onEdit:()=>void}){const {loading,processors,merchants,feeRates}=usePaymentSettlements();
 if(loading)return <p role="status" className="text-[13px] text-muted-foreground">Loading…</p>;
 if(!processors.length)return <SettingsCard title="Card processors" onEdit={onEdit}><Row label="Processors" missing="Add your card processor"/></SettingsCard>;
 return <>{processors.map(p=>{const ms=merchants.filter(m=>m.processor_id===p.id),rates=feeRates.filter(r=>r.processor_id===p.id).map(r=>Number(r.rate)).filter(Number.isFinite);const lo=Math.min(...rates),hi=Math.max(...rates);
  return <SettingsCard key={p.id} title={p.is_active?p.name:`${p.name} · archived`} onEdit={onEdit}>
   <Row label="Merchants" value={ms.map(m=>m.venue||m.shared_venues.join(' + ')||m.display_name).filter(Boolean).join(' · ')} missing="No merchants yet"/>
   <Row label="Fees" value={rates.length?(lo===hi?pct(lo):`${pct(lo)} to ${pct(hi)}`):''} missing="No fee rates yet"/>
  </SettingsCard>;})}</>;}
export default function CardProcessors({embedded=false}:{embedded?:boolean}){const [params,setParams]=useSearchParams();const view=params.get('view')??'processors';
 if(embedded&&view==='processors'&&!params.has('edit'))return <ProcessorCards onEdit={()=>setParams({tab:'accounting',view:'processors',edit:'1'})}/>;
 return <div className={`min-w-0 space-y-5 ${embedded?'settings-pad':''}`}>{embedded?<button type="button" className="self-start px-1 text-[13px] text-[#1F6B5E]" onClick={()=>setParams({tab:'accounting',view:'processors'})}>‹ Card processors</button>:<><Button asChild variant="link" className="p-0 h-auto"><Link to="/settings?tab=accounting">Accounting</Link></Button><PageTop title="Card processors"/></>}<FinanceViewTabs value={view} items={[{key:'processors',label:'Processors'},{key:'merchants',label:'Merchants'},{key:'fee-rates',label:'Fee rates'}]}/><div className="max-w-full min-w-0 overflow-x-auto">{view==='merchants'?<PaymentsMerchantsPage/>:view==='fee-rates'?<PaymentsFeeRatesPage/>:<PaymentsProcessorsPage/>}</div></div>;}
