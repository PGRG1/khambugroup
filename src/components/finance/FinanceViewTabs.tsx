import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SectionPillRow } from '@/components/kit/SectionPillRow';
import { cn } from '@/lib/utils';
export function FinanceViewTabs({items,value,param='view'}:{items:{key:string;label:string}[];value:string;param?:string}){
  const location=useLocation();const paths=items.map(i=>{const p=new URLSearchParams(location.search);p.set(param,i.key);return {label:i.label,path:`${location.pathname}?${p}`};});
  return <><div className="md:hidden"><SectionPillRow label="Page views" items={paths} activePath={paths[items.findIndex(i=>i.key===value)]?.path??paths[0]?.path??''}/></div><nav aria-label="Page views" className="hidden md:flex border-b border-border gap-2">{paths.map((i,n)=><Button key={i.path} variant="ghost" asChild className={cn('rounded-none border-b-2 h-10 shadow-none bg-transparent hover:bg-transparent',items[n].key===value?'border-primary':'border-transparent text-muted-foreground')}><Link to={i.path} aria-current={items[n].key===value?'page':undefined}>{i.label}</Link></Button>)}</nav></>;
}