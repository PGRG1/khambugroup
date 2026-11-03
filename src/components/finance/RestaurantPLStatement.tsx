import {useState} from 'react';
import {Link} from 'react-router-dom';
import {ChevronDown,ChevronRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {formatCurrency,formatPercent,formatDate} from '@/utils/format';
import type {PLRow} from '@/utils/restaurantPL';

export function RestaurantPLStatement({rows,columns,from,to,scope,detailed,onDetailed}:{rows:PLRow[];columns:string[];from:string;to:string;scope:string;detailed:boolean;onDetailed:(v:boolean)=>void}){
  const [collapsed,setCollapsed]=useState<Set<string>>(new Set());
  const sales=rows.find(r=>r.id==='net-sales')?.values??[];
  const shown=rows.filter(r=>r.kind!=='account'||detailed&&!collapsed.has(r.parent??''));
  return <section aria-label="Profit and loss statement" className="min-w-0 border-y border-border bg-card text-card-foreground [font-family:'IBM_Plex_Sans',sans-serif] [font-variant-numeric:tabular-nums]">
    <header className="flex flex-wrap items-start justify-between gap-4 px-5 py-6 sm:px-7">
      <div><h2 className="text-xl font-semibold">Profit &amp; loss</h2><p className="mt-1 text-sm text-muted-foreground">{scope} · {formatDate(from)} — {formatDate(to)}</p><p className="mt-1 text-xs text-muted-foreground">Posted books · Accrual basis</p></div>
      <div role="group" aria-label="Statement detail" className="flex gap-1 border-b border-border">
        <Button variant="ghost" aria-pressed={!detailed} onClick={()=>onDetailed(false)} className={!detailed?'rounded-none border-b-2 border-accent':'rounded-none text-muted-foreground'}>Management</Button>
        <Button variant="ghost" aria-pressed={detailed} onClick={()=>onDetailed(true)} className={detailed?'rounded-none border-b-2 border-accent':'rounded-none text-muted-foreground'}>Account detail</Button>
      </div>
    </header>
    <div className="max-w-full overflow-x-auto">
      <table aria-label="Restaurant profit and loss" className="w-full min-w-full border-collapse text-sm">
        <thead className="bg-muted text-xs text-muted-foreground"><tr><th scope="col" className="min-w-36 px-3 py-3 text-left font-medium sm:min-w-64 sm:px-7">Account / line</th>{columns.map(c=><th scope="col" key={c} className="min-w-36 px-3 py-3 text-right font-medium sm:min-w-44 sm:px-5">{c}<span className="block pt-1 font-normal">Amount · % of revenue</span></th>)}</tr></thead>
        <tbody>{shown.map(r=>{
          const section=r.kind==='section',grand=r.kind==='grand',total=r.kind==='total',ratio=r.kind==='ratio';
          const children=rows.some(child=>child.parent===r.id);
          return <tr key={r.id} className={grand?'border-t-4 border-double border-foreground bg-muted font-semibold':total?'border-t border-border font-semibold':section?'border-t border-border bg-muted/50 font-medium':ratio?'text-muted-foreground':'border-t border-border/40'}>
            <th scope="row" className={`px-3 text-left sm:px-7 ${section?'py-3':ratio?'py-2':'py-2.5'} ${r.kind==='account'?'font-normal':'font-inherit'}`}>
              {section&&detailed&&children?<Button variant="ghost" size="sm" className="-ml-2 h-auto justify-start gap-2 whitespace-normal px-2 py-0 text-left font-medium" aria-expanded={!collapsed.has(r.id)} onClick={()=>setCollapsed(old=>{const next=new Set(old);next.has(r.id)?next.delete(r.id):next.add(r.id);return next;})}>{collapsed.has(r.id)?<ChevronRight className="h-3.5 w-3.5 shrink-0"/>:<ChevronDown className="h-3.5 w-3.5 shrink-0"/>}{r.label}</Button>:r.accountId?<Link className="block pl-5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" to={`/finance/books?view=ledger&account=${encodeURIComponent(r.accountId)}&from=${from}&to=${to}`}>{r.label}</Link>:<span className={r.kind==='account'?'block pl-5 text-muted-foreground':''}>{r.label}</span>}
            </th>
            {columns.map((c,i)=><td key={c} className="px-3 py-2.5 text-right align-middle whitespace-nowrap sm:px-5"><span>{r.values[i]==null?'—':r.percent?formatPercent(r.values[i]):formatCurrency(r.values[i]??0)}</span>{!r.percent&&<span className="block text-xs font-normal text-muted-foreground sm:ml-4 sm:inline-block sm:w-14">{sales[i]?formatPercent((r.values[i]??0)/(sales[i]??1)*100):'—'}</span>}</td>)}
          </tr>;
        })}</tbody>
      </table>
    </div>
  </section>;
}