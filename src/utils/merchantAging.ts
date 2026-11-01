import {ageBucket} from './financeReportViews';
export type MerchantBatchEvidence={id:string;merchant_id:string;transaction_date:string;settlement_date:string;net_settlement:number;bank_transaction_id:string|null};
export function merchantAging(batches:MerchantBatchEvidence[],matches:{matched_type:string;matched_id:string;txn_id:string}[],bank:{id:string;txn_date:string}[],asAt:string){
 const rows=new Map<string,{buckets:number[];lastMatched:string|null}>();
 for(const b of batches){if(b.transaction_date>asAt)continue;const row=rows.get(b.merchant_id)??{buckets:[0,0,0,0],lastMatched:null};const ids=[b.bank_transaction_id,...matches.filter(m=>m.matched_type==='settlement_batch'&&m.matched_id===b.id).map(m=>m.txn_id)].filter((id):id is string=>!!id);const dates=bank.filter(t=>ids.includes(t.id)&&t.txn_date<=asAt).map(t=>t.txn_date).sort();const matched=dates.at(-1);if(matched){if(!row.lastMatched||matched>row.lastMatched)row.lastMatched=matched;}else row.buckets[ageBucket(b.transaction_date,asAt)]+=Math.max(0,Number(b.net_settlement));rows.set(b.merchant_id,row);}
 return rows;
}