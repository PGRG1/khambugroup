import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SectionPillRow } from '@/components/kit/SectionPillRow';
import { cn } from '@/lib/utils';
import { PageControls } from '@/components/kit/PageTopControls';
export function FinanceViewTabs({items,value,param='view'}:{items:{key:string;label:string}[];value:string;param?:string}){
  const location=useLocation();const paths=items.map(i=>{const p=new URLSearchParams(location.search);p.set(param,i.key);return {label:i.label,path:`${location.pathname}?${p}`};});
  return <PageControls side="left"><nav aria-label="Page views" className="flex flex-wrap gap-2">{paths.map((i,n)=><Button key={i.path} variant="outline" asChild className={cn(items[n].key===value?'bg-accent':'text-muted-foreground')}><Link to={i.path} aria-current={items[n].key===value?'page':undefined}>{i.label}</Link></Button>)}</nav></PageControls>;
}