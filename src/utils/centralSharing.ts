export type CentralSharingRule = 'sales' | 'equal';
/** Report-only allocation, in cents; never changes ledger attribution. */
export function centralShares(total:number, venues:{name:string;sales:number}[],rule:CentralSharingRule='sales') {
 const positive=venues.map(v=>Math.max(0,v.sales)),basis=rule==='equal'?venues.map(()=>1):positive;
 const denominator=basis.reduce((n,v)=>n+v,0),cents=Math.round(total*100);
 if(!denominator)return {shares:venues.map(()=>0),unallocated:total};
 const raw=basis.map(v=>Math.abs(cents)*v/denominator),allocated=raw.map(Math.floor);
 const order=raw.map((v,i)=>({i,f:v-allocated[i]})).sort((a,b)=>b.f-a.f||a.i-b.i);
 for(let n=Math.abs(cents)-allocated.reduce((s,v)=>s+v,0),i=0;i<n;i++)allocated[order[i].i]++;
 return {shares:allocated.map(v=>Math.sign(cents)*v/100),unallocated:0};
}