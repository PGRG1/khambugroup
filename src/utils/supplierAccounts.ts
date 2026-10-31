import { autoAllocateFifo,round2 } from '@/utils/supplierPaymentAllocation';
export interface AccountInvoice {id:string;supplier_id:string;supplier_name:string;invoice_date:string;invoice_number:string;venue:string;due_date:string|null;outstanding_amount:number;payment_status:string;review_status:string|null}
export interface AccountPayment {id:string;supplier_id:string|null;payment_date:string;amount:number;allocated_amount:number;unallocated_amount:number}
export type LateBucket='all'|'no-date'|'1-30'|'31-60'|'60+';
export function daysLate(due:string|null,today:string){return due?Math.max(0,Math.round((Date.parse(today)-Date.parse(due.slice(0,10)))/86400000)):0;}
export function inLateBucket(i:AccountInvoice,bucket:LateBucket,today:string){const d=daysLate(i.due_date,today);return bucket==='all'||bucket==='no-date'&&!i.due_date||bucket==='1-30'&&d>=1&&d<=30||bucket==='31-60'&&d>=31&&d<=60||bucket==='60+'&&d>60;}
export function openAccountInvoices(invoices:AccountInvoice[]){return invoices.filter(i=>i.outstanding_amount>0.005&&i.payment_status!=='voided'&&i.review_status!=='Voided');}
export function supplierAccountRows(invoices:AccountInvoice[],payments:AccountPayment[],today:string,names:Map<string,string>=new Map()){
 const ids=new Set([...invoices.map(i=>i.supplier_id),...payments.filter(p=>p.unallocated_amount>0.005).map(p=>p.supplier_id)].filter((id):id is string=>!!id));
 return [...ids].map(id=>{const all=invoices.filter(i=>i.supplier_id===id);const open=openAccountInvoices(all);const pays=payments.filter(p=>p.supplier_id===id);return {id,name:names.get(id)||all[0]?.supplier_name||'—',owed:round2(open.reduce((s,i)=>s+i.outstanding_amount,0)),overdue:round2(open.filter(i=>daysLate(i.due_date,today)>0).reduce((s,i)=>s+i.outstanding_amount,0)),invoiceCount:open.length,noDueCount:open.filter(i=>!i.due_date).length,lastInvoice:all.map(i=>i.invoice_date).sort().pop()??null,unallocated:round2(pays.reduce((s,p)=>s+p.unallocated_amount,0)),paymentCount:pays.length,paid:round2(pays.reduce((s,p)=>s+p.amount,0)),matched:round2(pays.reduce((s,p)=>s+p.allocated_amount,0))};});
}
export function medianSupplierTerms(invoices:Pick<AccountInvoice,'invoice_date'|'due_date'>[]):{days:number|null;samples:number}{
 const values=invoices.flatMap(i=>{if(!i.invoice_date||!i.due_date)return [];const days=(Date.parse(i.due_date)-Date.parse(i.invoice_date))/86400000;return Number.isFinite(days)&&days>=0?[days]:[];}).sort((a,b)=>a-b);const m=Math.floor(values.length/2);return {days:values.length?Math.round(values.length%2?values[m]:(values[m-1]+values[m])/2):null,samples:values.length};
}
export function dueDateFromTerms(date:string,days:number){if(!Number.isInteger(days)||days<0||days>3650)throw new Error('Enter whole payment-term days from 0 to 3650.');const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export interface MatchProposal {payment_id:string;invoice_id:string;amount:number;payment_remaining:number;invoice_open:number}
export function proposeSupplierMatches(supplierId:string,payments:AccountPayment[],invoices:AccountInvoice[]):MatchProposal[]{
 const eligible=invoices.filter(i=>i.supplier_id===supplierId).map(i=>({...i}));const result:MatchProposal[]=[];
 for(const payment of payments.filter(p=>p.supplier_id===supplierId&&p.unallocated_amount>0.005).sort((a,b)=>a.payment_date.localeCompare(b.payment_date)||a.id.localeCompare(b.id))){
  const suggestions=autoAllocateFifo(payment.unallocated_amount,eligible,payment.payment_date);
  for(const suggestion of suggestions){const invoice=eligible.find(i=>i.id===suggestion.invoice_id);const original=invoices.find(i=>i.id===suggestion.invoice_id);if(!invoice||!original)continue;result.push({payment_id:payment.id,invoice_id:invoice.id,amount:suggestion.amount,payment_remaining:payment.unallocated_amount,invoice_open:original.outstanding_amount});invoice.outstanding_amount=round2(invoice.outstanding_amount-suggestion.amount);}
 }return result;
}
