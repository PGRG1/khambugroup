import {bookAmount, plGroup, type BookAccount, type BookEntry, type BookLine} from './financeClose';
import {financeProfit} from './financeOverview';
import type {ReportRow} from './financeReportViews';

export type PLRow = ReportRow & {id:string; kind:'section'|'account'|'total'|'grand'|'ratio'; parent?:string; accountId?:string};
type Payroll = Parameters<typeof financeProfit>[3];
export type PLPeriod = {label:string; from:string; to:string};
const staffCodes = new Set(['6000','6010','6020']);
function group(a:BookAccount) {
  if(a.code==='FX-R') return 'fx-r';
  if(a.code==='FX-U') return 'fx-u';
  if(plGroup(a.account_type)==='Sales') return 'sales';
  if(a.code.startsWith('5')) return 'food';
  if(plGroup(a.account_type)==='Running costs') return staffCodes.has(a.code)?'staff':'running';
  return null;
}

/** Read-only presentation: retain operations totals and make payroll reconciliation explicit. */
export function restaurantPL(entries:BookEntry[],lines:BookLine[],accounts:BookAccount[],payroll:Payroll,periods:PLPeriod[]):PLRow[] {
  const posted=new Map(entries.filter(e=>e.status==='posted').map(e=>[e.id,e]));
  const byAccount=new Map(accounts.map(a=>[a.id,a]));
  const balances=periods.map(period=>{
    const amounts=new Map<string,number>();
    for(const line of lines){
      const entry=posted.get(line.entry_id),account=line.account_id?byAccount.get(line.account_id):undefined;
      if(!entry||!account||!group(account)||entry.entry_date<period.from||entry.entry_date>period.to)continue;
      amounts.set(account.id,(amounts.get(account.id)??0)+bookAmount(line,account));
    }
    return amounts;
  });
  const sum=(key:string)=>balances.map(b=>accounts.filter(a=>group(a)===key).reduce((n,a)=>n+(b.get(a.id)??0),0));
  const sales=sum('sales'),food=sum('food'),bookedStaff=sum('staff'),bookedRunning=sum('running'),fxR=sum('fx-r'),fxU=sum('fx-u');
  const staff=periods.map((p,i)=>{
    // Restrict both sources to the exact selected dates, including partial months.
    const es=entries.filter(e=>e.entry_date>=p.from&&e.entry_date<=p.to);
    const months=[...new Set(es.filter(e=>e.status==='posted').map(e=>e.entry_date.slice(0,7)))];
    return months.reduce((n,m)=>{
      const result=financeProfit(es,lines,accounts,payroll,m);
      const monthStaff=lines.reduce((total,l)=>{
        const e=posted.get(l.entry_id),a=l.account_id?byAccount.get(l.account_id):undefined;
        return e&&e.entry_date>=p.from&&e.entry_date<=p.to&&e.entry_date.startsWith(m)&&a&&group(a)==='staff'?total+bookAmount(l,a):total;
      },0);
      return n+(result.staff??monthStaff);
    },0)+(months.length?0:bookedStaff[i]);
  });
  const running=bookedRunning.map((n,i)=>n+bookedStaff[i]-staff[i]);
  const rows:PLRow[]=[];
  const total=(id:string,label:string,values:number[],kind:PLRow['kind']='total')=>rows.push({id,label,values,kind});
  const section=(id:string,label:string,values:number[])=>{
    rows.push({id,label,values,kind:'section',section:true});
    accounts.filter(a=>group(a)===id&&balances.some(b=>Math.abs(b.get(a.id)??0)>.005)).sort((a,b)=>a.code.localeCompare(b.code)).forEach(a=>rows.push({id:a.id,label:a.name,values:balances.map(b=>b.get(a.id)??0),kind:'account',parent:id,accountId:a.id}));
  };
  section('sales','Revenue',sales);
  total('net-sales','Net revenue',sales);
  section('food','Cost of sales',food);
  total('gross','Gross profit',sales.map((n,i)=>n-food[i]));
  section('staff','Staff costs',staff);
  const staffDifference=staff.map((n,i)=>n-bookedStaff[i]);
  if(staffDifference.some(n=>Math.abs(n)>.005))rows.push({id:'payroll-reconciliation',label:'Posted payroll reconciliation',values:staffDifference,kind:'account',parent:'staff'});
  total('prime','Prime cost',food.map((n,i)=>n+staff[i]));
  total('prime-ratio','Prime cost %',food.map((n,i)=>sales[i]?(n+staff[i])/sales[i]*100:0),'ratio');
  rows[rows.length-1].percent=true;
  section('running','Operating expenses',running);
  if(staffDifference.some(n=>Math.abs(n)>.005))rows.push({id:'expense-reconciliation',label:'Posted payroll reclassification',values:staffDifference.map(n=>-n),kind:'account',parent:'running'});
  total('operating','Operating profit',sales.map((n,i)=>n-food[i]-staff[i]-running[i]));
  section('fx-r','FX gains / losses · realised',fxR);
  section('fx-u','FX gains / losses · unrealised',fxU);
  total('profit','Profit before tax',sales.map((n,i)=>n-food[i]-staff[i]-running[i]-fxR[i]-fxU[i]),'grand');
  total('margin','Profit margin',sales.map((n,i)=>n?(n-food[i]-staff[i]-running[i]-fxR[i]-fxU[i])/n*100:0),'ratio');
  rows[rows.length-1].percent=true;
  return rows;
}