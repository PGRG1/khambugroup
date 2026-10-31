import {useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {useBankModule} from '@/hooks/useBankModule';
import {useVenueScope} from '@/hooks/useVenueScope';
import {usePeriodFilter} from '@/hooks/usePeriodFilter';
import {useProcessorContext,ProcessorSelector} from '@/pages/payments/_shared';
import {SettlementBatchesTab} from '@/components/finance/payments/SettlementBatchesTab';
import {SettlementDetailsAuditTab} from '@/components/finance/payments/SettlementDetailsAuditTab';
import {MonthlyReconciliationTab} from '@/components/finance/payments/MonthlyReconciliationTab';
import {ImportsTab} from '@/components/finance/payments/ImportsTab';
import {QuickFilter} from '@/components/kit/QuickFilter';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Upload} from 'lucide-react';
export function PayoutsView(){
 const c=useProcessorContext(),bank=useBankModule(),scope=useVenueScope();const [params,setParams]=useSearchParams();const mode=params.get('payout')??'batches';const [upload,setUpload]=useState(false);
 const period=usePeriodFilter(c.procBatches.map(b=>b.settlement_date),'all');
 const merchants=c.procMerchants.filter(m=>scope.includesName(m.venue)||m.shared_venues?.some(v=>scope.includesName(v)));const ids=new Set(merchants.map(m=>m.id));const batches=c.procBatches.filter(b=>ids.has(b.merchant_id)&&period.inPeriod(b.settlement_date));const batchIds=new Set(batches.map(b=>b.id));
 return <div className="space-y-4 min-w-0"><div className="flex flex-wrap justify-between gap-3">{period.control}<Button onClick={()=>setUpload(true)}><Upload className="h-4 w-4"/>Upload payout</Button></div><div className="flex flex-wrap gap-3"><QuickFilter label="Payout view" value={mode} onChange={v=>{const p=new URLSearchParams(params);p.set('payout',v);setParams(p);}} options={[{key:'batches',label:'Batches'},{key:'fee-audit',label:'Fee audit'},{key:'monthly',label:'Monthly check'}]}/><ProcessorSelector processors={c.processors} processorId={c.processorId} setProcessorId={c.setProcessorId} feeRateCountByProcessor={c.feeRateCountByProcessor}/></div>
 <div className="min-w-0 max-w-full overflow-x-auto">{mode==='fee-audit'?<SettlementDetailsAuditTab processor={c.processor} merchants={merchants} batches={batches} transactions={c.procTxns.filter(t=>batchIds.has(t.batch_id))}/>:mode==='monthly'?<MonthlyReconciliationTab processor={c.processor} merchants={merchants} batches={batches} bankTxns={bank.transactions}/>:<SettlementBatchesTab processor={c.processor} merchants={merchants} batches={batches} lines={c.procLines.filter(l=>batchIds.has(l.batch_id))} transactions={c.procTxns.filter(t=>batchIds.has(t.batch_id))} bankTxns={bank.transactions} bankAccounts={bank.accounts} onReload={c.reload}/>}</div>
 <Dialog open={upload} onOpenChange={setUpload}><DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden"><DialogHeader><DialogTitle>Payout statements</DialogTitle></DialogHeader><ProcessorSelector processors={c.processors} processorId={c.processorId} setProcessorId={c.setProcessorId} feeRateCountByProcessor={c.feeRateCountByProcessor}/><ImportsTab processor={c.processor} imports={c.imports} merchants={c.merchants} tenantId={c.tenantId} onChanged={c.reload}/></DialogContent></Dialog></div>;
}