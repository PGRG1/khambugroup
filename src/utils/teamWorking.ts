import {roleGroup,monthKey} from '@/utils/peoplePresentation';
import {personOnDate,shiftAt,shiftHours,type RotaRow} from '@/utils/peopleRota';
export const TEAM_MODES = {own:'Each venue has its own team',across:'Staff work across venues',central:'One central team'} as const;
export type TeamMode = keyof typeof TEAM_MODES;
export type TeamWorking = {default_mode:TeamMode;role_modes:Record<string,TeamMode>};
export const DEFAULT_TEAM_WORKING:TeamWorking={default_mode:'own',role_modes:{}};
export function resolveTeamWorking(value:unknown):TeamWorking {const v=value as Partial<TeamWorking>|null;const valid=(m:unknown):m is TeamMode=>typeof m==='string'&&Object.prototype.hasOwnProperty.call(TEAM_MODES,m);return {default_mode:valid(v?.default_mode)?v.default_mode:'own',role_modes:Object.fromEntries(Object.entries(v?.role_modes??{}).filter(([,m])=>valid(m)))};}
export const teamMethod=(m:TeamMode)=>({own:'own team',across:'share by hours',central:'central team'})[m];
export function venueStaffProfit(sales:number,bought:number,otherRunning:number,staff:number|null){return staff===null?null:sales-bought-otherRunning-staff;}
export type CostShare={venue_id:string|null;name:string;cents:number;hours:number;method:string};
export type PersonCost={employee_id:string;mainVenue:string|null;cost:number;shares:CostShare[]};
export type VenueCost={venue_id:string|null;name:string;cost:number;sales:number;percent:number|null;method:string};
export type TeamCost={month:string;cost:number|null;people:PersonCost[];venues:VenueCost[];central:VenueCost;unallocated:VenueCost};
// Largest-remainder cents keep every person's saved employment cost intact.
export function splitCents(total:number,weights:number[]):number[]{const sum=weights.reduce((n,w)=>n+w,0);if(sum<=0)return weights.map(()=>0);const sign=total<0?-1:1,abs=Math.abs(total),raw=weights.map(w=>abs*w/sum),result=raw.map(Math.floor);let remaining=abs-result.reduce((n,w)=>n+w,0);const order=raw.map((n,i)=>({i,remainder:n-result[i]})).sort((a,b)=>b.remainder-a.remainder||a.i-b.i);for(const item of order){if(remaining--<=0)break;result[item.i]++;}return result.map(n=>n*sign);}
export function allocateTeamCost(payroll:RotaRow[],people:RotaRow[],shifts:RotaRow[],terms:RotaRow[],venues:RotaRow[],sales:RotaRow[],month:string,setting:TeamWorking=DEFAULT_TEAM_WORKING,roles:Record<string,string>={}):TeamCost {
 const rows=payroll.filter(p=>monthKey(p)===month),end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
 const persons:PersonCost[]=rows.map(p=>{
  const raw=people.find(e=>e.id===p.employee_id),person=raw?personOnDate(raw,terms,end):null,mode=setting.role_modes[roleGroup(person?.job_title,roles)]??setting.default_mode;
  const primary=venues.find(v=>person?.venue_id?person.venue_id===v.id:person?.venue===v.name),cents=Math.round((Number(p.gross_salary??0)+Number(p.mpf_employer??0))*100);
  const own=shifts.filter(s=>s.employee_id===p.employee_id&&String(s.shift_date).startsWith(month)&&s.status!=='cancelled'&&!s.no_show_decision&&shiftHours(s)>0);
  const hours=venues.map(v=>own.filter(s=>shiftAt(s,v,people,terms)).reduce((n,s)=>n+shiftHours(s),0)),sumHours=hours.reduce((n,h)=>n+h,0);
  const main=primary?.id??(sumHours>0?venues[hours.indexOf(Math.max(...hours))]?.id:null)??null;let shares:CostShare[]=[];
  if(mode==='central')shares=[{venue_id:null,name:'Central',cents,hours:sumHours,method:'central team'}];
  else if(mode==='own')shares=[{venue_id:primary?.id??null,name:primary?.name??'Not on rota / venue not recorded',cents,hours:sumHours,method:primary?'own team':'venue not recorded'}];
  else if(sumHours<=0)shares=[{venue_id:null,name:'Not on rota / venue not recorded',cents,hours:0,method:'no month rota hours'}];
  else {
   const basis=p.preparation?.pay_basis??person?.pay_basis;let distributed=cents;let residualMethod='pay not explained by rota hours';
   if(basis==='hour'){
    const gross=Number(p.gross_salary??0),rate=p.preparation?.hourly_rate??(p.preparation?.pay_basis==='hour'?p.forecast_base_salary:person?.pay_amount);
    if(rate==null||!Number.isFinite(Number(rate))){distributed=0;residualMethod='hourly rate not recorded';}
    else {const earned=Math.min(Math.max(0,gross),Math.max(0,sumHours*Number(rate)));distributed=gross>0?Math.round(earned*(1+Number(p.mpf_employer??0)/gross)*100):0;}
   }
   const split=splitCents(distributed,hours);shares=venues.flatMap((v,i)=>hours[i]>0?[{venue_id:v.id,name:v.name,cents:split[i],hours:hours[i],method:'share by hours'}]:[]);
   if(distributed!==cents)shares.push({venue_id:null,name:'Not on rota / venue not recorded',cents:cents-distributed,hours:0,method:residualMethod});
  }
  return {employee_id:p.employee_id,mainVenue:main,cost:cents/100,shares};
 });
 const bucket=(id:string|null,name:string):VenueCost=>{const shares=persons.flatMap(p=>p.shares).filter(s=>id?s.venue_id===id:s.name===name);const cost=shares.reduce((n,s)=>n+s.cents,0)/100,totalSales=id?sales.filter(s=>String(s.date).startsWith(month)&&(s.venue_id?s.venue_id===id:s.venue===name)).reduce((n,s)=>n+Number(s.total_sales??0),0):0;return {venue_id:id,name,cost,sales:totalSales,percent:rows.length&&totalSales>0?cost/totalSales*100:null,method:[...new Set(shares.map(s=>s.method))].join(' + ')||teamMethod(setting.default_mode)};};
 return {month,cost:rows.length?persons.reduce((n,p)=>n+Math.round(p.cost*100),0)/100:null,people:persons,venues:venues.map(v=>bucket(v.id,v.name)),central:bucket(null,'Central'),unallocated:bucket(null,'Not on rota / venue not recorded')};
}
export function teamSuggestions(people:RotaRow[],shifts:RotaRow[],terms:RotaRow[],venues:RotaRow[],roles:Record<string,string>={}){
 return [...new Set(people.map(e=>roleGroup(e.job_title,roles)))].filter(r=>r!=='No role set').sort().map(role=>{const members=people.filter(e=>roleGroup(e.job_title,roles)===role);const across=members.filter(e=>{const work=shifts.filter(s=>s.employee_id===e.id&&s.status!=='cancelled'&&shiftHours(s)>0);const months=[...new Set(work.map(s=>String(s.shift_date).slice(0,7)))];return months.filter(m=>venues.filter(v=>work.some(s=>String(s.shift_date).startsWith(m)&&shiftAt(s,v,people,terms))).length>1).length>=2;});const count=members.filter(e=>shifts.some(s=>s.employee_id===e.id&&s.status!=='cancelled'&&shiftHours(s)>0)).length;return {role,mode:(across.length?'across':'own') as TeamMode,evidence:across.length?`${across.length} people worked at multiple venues in at least two recorded months`:count?`${count} people have rota records; no repeated cross-venue pattern`:'No rota pattern recorded; default remains own team'};});
}