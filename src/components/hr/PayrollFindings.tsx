import {useState} from 'react';
import {Button} from '@/components/ui/button';
import {BaniOrb} from '@/components/assistant/BaniOrb';
import {useBaniTopic} from '@/components/assistant/FloatingBaniContext';
import type {PageWorkItem} from '@/utils/baniPageWork';

export function PayrollFindings({findings}:{findings:PageWorkItem[]}) {
 const [expanded,setExpanded]=useState(false),[shown,setShown]=useState<string[]>([]),topic=useBaniTopic();
 if(!findings.length)return null;
 return <section className="people-findings glass-surface border border-border rounded-lg px-4 py-3" aria-label="Bani findings">
  <h2 className="flex items-center gap-2 font-display font-semibold text-sm mb-1"><BaniOrb size={24} mode="idle"/>Bani</h2>
  {(expanded?findings:findings.slice(0,1)).map(f=><div key={f.id} className="text-sm py-1"><span>{f.title}</span> <Button variant="link" className="h-auto p-0 text-xs" aria-expanded={shown.includes(f.id)} onClick={()=>setShown(list=>list.includes(f.id)?list.filter(id=>id!==f.id):[...list,f.id])}>{shown.includes(f.id)?'Hide':'Show'}</Button>{shown.includes(f.id)&&<div className="text-muted-foreground mt-1">{f.detail} <Button variant="link" className="h-auto p-0 text-xs" onClick={()=>topic(f.question)}>Check</Button></div>}</div>)}
  {findings.length>1&&<Button variant="ghost" className="bani-fold h-auto p-0 text-xs text-muted-foreground text-left justify-start" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Show less':`${findings.length-1} more`}</Button>}
 </section>;
}