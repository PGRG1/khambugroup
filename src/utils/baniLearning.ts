// Turns every place Bani stores taught learning into one plain sentence per item.
// Never surfaces IDs, UUIDs or raw JSON.
import {sameNote} from '@/utils/noteSameness';
import {formatCurrency,formatDate,formatTableInteger} from '@/utils/format';

export type LearningGroup='bank'|'invoices'|'venues';
export type LearningKind='rule'|'example'|'feedback'|'note';
export type Learning={key:string;kind:LearningKind;ids:string[];group:LearningGroup;sentence:string;from:string;added:string|null;by:string|null;used:string;example:string;forgotten:boolean};
export type Lookups={people:Record<string,string>;suppliers:Record<string,string>;products:Record<string,string>;venues:Record<string,string>};

const UUID=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const words=(k:string)=>k.replace(/_/g,' ').replace(/^\w/,c=>c.toUpperCase());
/** Plain words from a stored value: drops id/system keys and UUID strings; never JSON. */
export function plainValue(v:unknown):string{
  if(v===null||v===undefined||v==='')return '';
  if(typeof v==='number')return formatTableInteger(v)===String(v)?String(v):String(v);
  if(typeof v!=='object'){const s=String(v);return UUID.test(s)?'':s;}
  if(Array.isArray(v))return v.map(plainValue).filter(Boolean).join(', ');
  return Object.entries(v as Record<string,unknown>).filter(([k])=>!/(^id$|_id$|^tenant|created|updated|confidence)/.test(k)).map(([k,x])=>{const t=plainValue(x);return t?`${words(k)}: ${t}`:'';}).filter(Boolean).join(' · ');
}
export function usedText(hits:number|null|undefined,last:string|null|undefined,tracked:boolean){
  if(!tracked)return 'Not recorded';
  if(!hits)return 'Not used yet';
  return `Used ${formatTableInteger(hits)} ${hits===1?'time':'times'}${last?` · last ${formatDate(last)}`:''}`;
}
const actionWords=(a:any)=>a?.suggested_category==='KPay Settlement'?'KPay settlements':String(a?.suggested_category??a?.suggested_type??'').replace(/_/g,' ');

export function isRepairRule(r:any){return r?.output_action?.trust==='source_date_correction';}

export function fromRules(rules:any[],l:Lookups):Learning[]{
  return rules.filter(r=>!isRepairRule(r)).map(r=>{const p=r.input_pattern??{};const text=p.contains??p.match_contains??p.matches;const bank=r.domain==='bank_recon'||r.workflow==='bank_txn_classify';
    const act=actionWords(r.output_action);
    const sentence=bank&&text?`Bank lines from “${text}” are ${act||'handled the way you showed'}`:(r.name&&!UUID.test(r.name)?r.name:`${plainValue(p)||'This pattern'} → ${act||plainValue(r.output_action)}`);
    return {key:`rule:${r.id}`,kind:'rule' as const,ids:[r.id],group:bank?'bank' as const:'invoices' as const,sentence,from:bank?'Bank matching':'Document reading',added:r.created_at??null,by:l.people[r.created_by]??null,used:usedText(r.hit_count,r.last_used_at,true),example:text?`A bank line containing “${text}”`:plainValue(p)||'Not recorded',forgotten:r.status==='disabled'};});
}
export function fromExamples(rows:any[],l:Lookups):Learning[]{
  return rows.map(e=>{const a=e.after_value??{},bank=String(e.source_type??'').startsWith('bank');
    const matched=String(a.matched_type??'').replace(/_/g,' ');
    const sentence=bank&&a.amount!=null?`A bank line of ${formatCurrency(Number(a.amount))} is a ${matched||'matched payment'}`:`${e.field?words(e.field):'This'}${e.item_key&&!UUID.test(e.item_key)?` for “${e.item_key}”`:''} should be ${plainValue(e.after_value)||'as corrected'}`;
    const before=plainValue(e.before_value),after=plainValue(e.after_value);
    return {key:`example:${e.id}`,kind:'example' as const,ids:[e.id],group:bank?'bank' as const:'invoices' as const,sentence,from:bank?'Bank matching':'Correction',added:e.created_at??null,by:l.people[e.actor_id]??null,used:'Not recorded',example:[before&&`Before: ${before}`,after&&`After: ${after}`,e.reason&&!UUID.test(e.reason)&&`Reason: ${e.reason}`].filter(Boolean).join(' · ')||'Not recorded',forgotten:!!e.disabled_at};});
}
export function fromFeedback(rows:any[],l:Lookups):Learning[]{
  return rows.filter(f=>f.chosen_product_id&&f.printed_description).map(f=>{const product=l.products[f.chosen_product_id]??'the product you picked';const supplier=l.suppliers[f.supplier_id];
    return {key:`feedback:${f.id}`,kind:'feedback' as const,ids:[f.id],group:'invoices' as const,sentence:`“${f.printed_description}” on invoices is your ${product}`,from:'Invoice matching',added:f.created_at??null,by:l.people[f.user_id]??null,used:'Not recorded',example:[`Invoice line “${f.printed_description}”`,supplier&&`from ${supplier}`,f.item_code&&`code ${f.item_code}`,f.unit&&`unit ${f.unit}`,f.unit_price!=null&&`price ${formatCurrency(Number(f.unit_price))}`].filter(Boolean).join(' · '),forgotten:!!f.disabled_at};});
}
/** Memory notes collapsed: same scope + same (near-identical) wording shows once; Forget covers every copy. */
export function fromNotes(rows:any[],l:Lookups):Learning[]{
  const out:Learning[]=[];
  for(const n of [...rows].sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)))){
    const scope=`${n.scope_type}:${n.scope_key}`;const hit=out.find(o=>(o as any).scope===scope&&sameNote((o as any).raw,n.note??''));
    if(hit){hit.ids.push(n.id);if(!n.disabled_at)hit.forgotten=false;continue;}
    const name=n.scope_type==='supplier'?l.suppliers[n.scope_key]:l.venues[String(n.scope_key).toLowerCase()]??n.scope_key;
    const note=String(n.note??'').trim();const sentence=name&&!UUID.test(name)&&!note.toLowerCase().includes(name.toLowerCase())?`${name}: ${note}`:note;
    out.push(Object.assign({key:`note:${n.id}`,kind:'note' as const,ids:[n.id],group:'venues' as const,sentence,from:n.source==='chat'?'Chat with Bani':'Bani',added:n.created_at??null,by:l.people[n.created_by]??null,used:'Not recorded',example:`Told to Bani${name&&!UUID.test(name)?` about ${name}`:''}: “${note}”`,forgotten:!!n.disabled_at},{scope,raw:note}));
  }
  return out.map(({scope,raw,...rest}:any)=>rest);
}
