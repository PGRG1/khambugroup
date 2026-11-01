import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useBaniTopic } from '@/components/assistant/FloatingBaniContext';
import type { PageWorkItem } from '@/utils/baniPageWork';

export function PeopleFindings({findings}:{findings:PageWorkItem[]}) {
  const [expanded,setExpanded]=useState(false),topic=useBaniTopic();
  if(!findings.length)return null;
  return <section className="people-findings glass-surface border border-border rounded-lg px-4 py-3" aria-label="Bani findings">
    <h2 className="font-display font-semibold text-sm mb-1">Bani</h2>
    {(expanded?findings:findings.slice(0,1)).map(f=><Button key={f.id} variant="ghost" className="bani-finding w-full h-auto justify-start whitespace-normal text-left px-0 py-1 text-sm" onClick={()=>topic(f.question)}>{f.title}{f.id.endsWith('-conflict')?` · ${f.detail}`:''}</Button>)}
    {findings.length>1&&<Button variant="ghost" className="bani-fold h-auto p-0 text-xs text-muted-foreground text-left justify-start" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Show less':`${findings.length-1} more: ${findings.slice(1,3).map(f=>f.title).join(' · ')}`}</Button>}
  </section>;
}