import {useSearchParams,Link} from 'react-router-dom';
import {PageTop} from '@/components/kit/PageTop';
import {FinanceViewTabs} from '@/components/finance/FinanceViewTabs';
import {Button} from '@/components/ui/button';
import PaymentsProcessorsPage from '@/pages/payments/PaymentsProcessorsPage';
import PaymentsMerchantsPage from '@/pages/payments/PaymentsMerchantsPage';
import PaymentsFeeRatesPage from '@/pages/payments/PaymentsFeeRatesPage';
export default function CardProcessors(){const [params]=useSearchParams();const view=params.get('view')??'processors';return <div className="min-w-0 space-y-5"><Button asChild variant="link" className="p-0 h-auto"><Link to="/admin/accounting">Accounting</Link></Button><PageTop title="Card processors"/><FinanceViewTabs value={view} items={[{key:'processors',label:'Processors'},{key:'merchants',label:'Merchants'},{key:'fee-rates',label:'Fee rates'}]}/><div className="max-w-full min-w-0 overflow-x-auto">{view==='merchants'?<PaymentsMerchantsPage/>:view==='fee-rates'?<PaymentsFeeRatesPage/>:<PaymentsProcessorsPage/>}</div></div>;}