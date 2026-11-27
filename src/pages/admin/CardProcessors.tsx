import {useSearchParams,Link} from 'react-router-dom';
import {PageTop} from '@/components/kit/PageTop';
import {FinanceViewTabs} from '@/components/finance/FinanceViewTabs';
import {Button} from '@/components/ui/button';
import {ProcessorCards} from '@/components/settings/ProcessorCards';
import PaymentsProcessorsPage from '@/pages/payments/PaymentsProcessorsPage';
import PaymentsMerchantsPage from '@/pages/payments/PaymentsMerchantsPage';
import PaymentsFeeRatesPage from '@/pages/payments/PaymentsFeeRatesPage';
export default function CardProcessors({embedded=false}:{embedded?:boolean}){const [params,setParams]=useSearchParams();const view=params.get('view')??'processors';
 // Settings: processors, merchants and fees are read and edited in place (ProcessorCards); the old three-tab editor stays for the admin page.
 if(embedded)return <ProcessorCards/>;
 return <div className={`min-w-0 space-y-5 ${embedded?'settings-pad':''}`}>{embedded?<button type="button" className="self-start px-1 text-[13px] text-[#1F6B5E]" onClick={()=>setParams({tab:'accounting',view:'processors'})}>‹ Card processors</button>:<><Button asChild variant="link" className="p-0 h-auto"><Link to="/settings?tab=accounting">Accounting</Link></Button><PageTop title="Card processors"/></>}<FinanceViewTabs value={view} items={[{key:'processors',label:'Processors'},{key:'merchants',label:'Merchants'},{key:'fee-rates',label:'Fee rates'}]}/><div className="max-w-full min-w-0 overflow-x-auto">{view==='merchants'?<PaymentsMerchantsPage/>:view==='fee-rates'?<PaymentsFeeRatesPage/>:<PaymentsProcessorsPage/>}</div></div>;}
