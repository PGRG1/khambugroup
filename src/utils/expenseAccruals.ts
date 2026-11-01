function expenseMonths(first:string,last:string){const keys:string[]=[];for(let k=first.slice(0,7);k<=last.slice(0,7)&&keys.length<240;){keys.push(k);const d=new Date(`${k}-01T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+1);k=d.toISOString().slice(0,7);}return keys;}
export type ContractTerms={expected_amount:number;cadence:string;effective_from:string|null;contract_end?:string|null;rent_free_months?:string[];step_increases?:{month:string;amount:number}[];direction?:string;billed_when?:string};
const cents=(n:number)=>Math.round(n*100);
export function contractPlan(r:ContractTerms,from:string,to:string){
 const keys=expenseMonths(from,to).filter(k=>(!r.effective_from||k>=r.effective_from.slice(0,7))&&(!r.contract_end||k<=r.contract_end.slice(0,7)));
 const divisor=r.cadence==='quarterly'?3:r.cadence==='yearly'?12:1;
 const nominal=(k:string)=>{const step=[...(r.step_increases??[])].filter(s=>s.month<=k).sort((a,b)=>b.month.localeCompare(a.month))[0];return (step?.amount??Number(r.expected_amount))/divisor;};
 const term=r.contract_end&&r.effective_from?expenseMonths(r.effective_from,r.contract_end):[];
 const straight=term.length&&(r.rent_free_months?.length||r.step_increases?.length)?term.reduce((n,k)=>n+(r.rent_free_months?.includes(k)?0:nominal(k)),0)/term.length:null;
 return keys.map(month=>({month,amount:cents(straight??(r.rent_free_months?.includes(month)?0:nominal(month)))/100,cadence:r.cadence,needsTerm:!r.contract_end&&!!(r.rent_free_months?.length||r.step_increases?.length)}));
}
export function splitCoverage(amount:number,start:string,end:string){
 const a=new Date(`${start}T00:00:00Z`),b=new Date(`${end}T00:00:00Z`);if(!Number.isFinite(a.getTime())||!Number.isFinite(b.getTime())||b<a)throw new Error('Choose a valid covered period');
 const totalDays=Math.round((b.getTime()-a.getTime())/86400000)+1,total=cents(amount);let used=0;
 return expenseMonths(start,end).map((month,index,months)=>{const first=new Date(`${month}-01T00:00:00Z`),last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0));const days=Math.round((Math.min(b.getTime(),last.getTime())-Math.max(a.getTime(),first.getTime()))/86400000)+1;const share=index===months.length-1?total-used:Math.round(total*days/totalDays);used+=share;return {month,days,amount:share/100};});
}
export function estimateFromBills(rows:{amount:number;period:string}[],month:string){const prior=rows.filter(r=>r.period<month&&r.amount>0).sort((a,b)=>b.period.localeCompare(a.period)).slice(0,3);return prior.length?Math.round(prior.reduce((n,r)=>n+r.amount,0)/prior.length*100)/100:null;}
export function estimateReversal(estimate:{amount:number;expenseAccount:string;accrualAccount:string},actualAmount:number){return {reversal:[{account:estimate.expenseAccount,debit:0,credit:estimate.amount},{account:estimate.accrualAccount,debit:estimate.amount,credit:0}],actualAmount,difference:Math.round((actualAmount-estimate.amount)*100)/100};}
export function prepaymentRelease(total:number,start:string,end:string,month:string,remaining:number){const share=splitCoverage(total,start,end).find(p=>p.month===month)?.amount??0;return Math.max(0,Math.min(share,remaining));}