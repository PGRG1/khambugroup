export type OwedItem = {
  key: string; id: string; source: 'supplier' | 'bill' | 'salary' | 'mpf' | 'staff';
  payeeKey: string; payee: string; what: string; venue: string | null;
  date: string; due: string | null; amount: number; supplierId?: string | null;
  employeeId?: string; year?: number; month?: number; link: string;
};
export type AppliedItem = {source: OwedItem['source']; id: string; amount: number; credits: {id: string; amount: number}[]};
const cents = (n: number) => Math.round(n * 100);
/** Allocation preview only; the server rechecks every balance under locks. */
export function paymentPreview(items: OwedItem[], cash: number, credits: {id:string;supplier_id:string;remaining_balance:number}[]): AppliedItem[] {
  let money = Math.max(0, cents(cash));
  const available = credits.map(c=>({...c,left:Math.max(0,cents(c.remaining_balance))}));
  return items.map(i=>{
    let due = Math.max(0,cents(i.amount)); const applied: AppliedItem['credits'] = [];
    if(i.source==='supplier') for(const c of available){
      if(c.supplier_id!==i.supplierId||c.left<=0||due<=0)continue;
      const amount=Math.min(c.left,due); c.left-=amount;due-=amount;applied.push({id:c.id,amount:amount/100});
    }
    const amount=Math.min(money,due);money-=amount;
    return {source:i.source,id:i.id,amount:amount/100,credits:applied};
  });
}
export function groupPayees(items: OwedItem[]) {
  const groups=new Map<string,{key:string;name:string;amount:number;items:OwedItem[]}>();
  for(const i of items){const g=groups.get(i.payeeKey)??{key:i.payeeKey,name:i.payee,amount:0,items:[]};g.amount+=i.amount;g.items.push(i);groups.set(g.key,g);}
  return [...groups.values()].map(g=>({...g,amount:cents(g.amount)/100})).sort((a,b)=>a.name.localeCompare(b.name));
}
export function daysLate(due:string|null,today:string){return due?Math.max(0,Math.floor((Date.parse(today)-Date.parse(due))/86400000)):0;}
export const bankSettled=(t:{status:string;match_confidence?:string|null;matched_record_id?:string|null;journal_entry_id?:string|null})=>
  ['matched','cleared','posted'].includes(t.status)&&t.match_confidence!=='low'&&!!(t.matched_record_id||t.journal_entry_id);
export function payrollOwed(row:{net_salary:number|null;salary_paid_amount:number|null;mpf_employee:number|null;mpf_employer:number|null;mpf_paid_amount:number|null}){
  return {salary:Math.max(0,cents(Number(row.net_salary??0)-Number(row.salary_paid_amount??0)))/100,mpf:Math.max(0,cents(Number(row.mpf_employee??0)+Number(row.mpf_employer??0)-Number(row.mpf_paid_amount??0)))/100};
}
export const tenderFields=[['visa','Visa'],['mastercard','Mastercard'],['amex','Amex'],['union_pay','UnionPay'],['jcb','JCB'],['alipay','Alipay'],['wechat','WeChat'],['payme','PayMe'],['cash','Cash takings']] as const;
export function expectedTenderDays(sales:Record<string,unknown>[]){
  return sales.flatMap(s=>tenderFields.flatMap(([method,label])=>{
    const amount=Number(s[method]??0);return amount>0?[{key:`${s.id}:${method}`,salesId:String(s.id),date:String(s.date),venue:String(s.venue??''),venueId:s.venue_id?String(s.venue_id):null,method,label,amount}]:[];
  }));
}
/** Only actual links, never keyword/amount resemblance, establish receipt. */
export function cashDepositChecked(salesId:string,bank:{id:string;money_in:number;status:string;matched_record_id:string|null;matched_record_type:string|null}[],matches:{txn_id:string;matched_id:string;matched_type:string}[]){
  return bank.some(t=>Number(t.money_in)>0&&['matched','cleared','posted'].includes(t.status)&&((t.matched_record_id===salesId&&['sales_record','cash_deposit','sales'].includes(t.matched_record_type??''))||matches.some(m=>m.txn_id===t.id&&m.matched_id===salesId&&['sales_record','cash_deposit','sales'].includes(m.matched_type))));
}
export function legacyFinanceDestination(path:string){
  if(path.startsWith('/payments')){const key=path.split('/')[2];return ['processors','merchants','fee-rates'].includes(key)?`/admin/accounting/card-processors?view=${key}`:`/finance/receivables?view=payouts${key?`&payout=${key}`:''}`;}
  if(path.startsWith('/petty-cash')){const key=path.split('/')[2];return key==='receipts'?'/expenses?source=cash-box':key==='classifications'?'/admin/accounting?view=cash-categories':key==='replenishments'?'/finance/cash?view=transactions&type=top-ups':'/finance/cash?view=accounts';}
  if(path.startsWith('/bank')){const key=path.split('/')[2];return key==='reconciliation'?'/finance/cash?view=close':!key||['accounts','dashboard','fx'].includes(key)?'/finance/cash?view=accounts':`/finance/cash?view=transactions${key==='incoming'?'&filter=in':key==='outgoing'?'&filter=out':key==='transfers'?'&type=transfers':key==='fees'?'&type=fees':key==='rules'?'&examples=1':''}`;}
  return null;
}