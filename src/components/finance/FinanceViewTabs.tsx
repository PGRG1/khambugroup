import { Link, useLocation } from 'react-router-dom';
import '@/components/kit/kit.css';

/**
 * A page's own views (Books, Reports, Receivables, Bank & cash…), shown like Purchasing's second-level
 * tabs (Invoices · Register · Notes · Received): plain words, the current one semibold with the green
 * highlighter stroke. Never a second row of pills under the section pills. Scrolls sideways on a phone.
 * Place it first on the page, above PageTop. `drop` removes query params that belong to one view only.
 */
export function FinanceViewTabs({items,value,param='view',drop=[]}:{items:{key:string;label:string}[];value:string;param?:string;drop?:string[]}){
  const location=useLocation();
  const paths=items.map(i=>{const p=new URLSearchParams(location.search);for(const k of drop)p.delete(k);p.set(param,i.key);return {key:i.key,label:i.label,path:`${location.pathname}?${p}`};});
  return <nav aria-label="Page views" className="max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><div className="invoice-switch">{paths.map(i=><Link key={i.key} to={i.path} replace aria-current={i.key===value?'page':undefined} className={`invoice-switch-item ${i.key===value?'is-active':''}`}>{i.label}</Link>)}</div></nav>;
}
