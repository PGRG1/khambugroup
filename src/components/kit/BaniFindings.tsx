import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { BaniOrb } from '@/components/assistant/BaniOrb';
import { useBaniTopic } from '@/components/assistant/FloatingBaniContext';
import type { PageWorkItem } from '@/utils/baniPageWork';
import { usePageTopControls } from './PageTopControls';

/** Display grouping only: original questions and evidence remain intact. */
function groupFindings(findings: PageWorkItem[]): PageWorkItem[] {
  const groups = new Map<string, PageWorkItem[]>();
  for (const finding of findings) {
    const personKind = finding.id.match(/^[0-9a-f-]{36}-(working|identity|start|entitlement|conflict|rest)$/)?.[1];
    const key = personKind ?? finding.id;
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  return [...groups.entries()].map(([kind, items]) => {
    const first = items[0];
    if (items.length === 1) return { ...first, title: first.title.replace(/\b1 rest days owed\b/g, '1 rest day owed') };
    const labels: Record<string, string> = { working: 'still working here?', identity: 'check names', start: 'check recorded start dates', entitlement: 'annual leave entitlement not set', conflict: 'leave records disagree', rest: 'rest days owed' };
    return { ...first, id: `group-${kind}`, title: `${items.length} people: ${labels[kind] ?? first.title}`, detail: items.map(f => `${f.title} · ${f.detail}`).join('\n'), question: items.map(f => f.question).join('\n') };
  });
}

export function BaniFindings({ findings }: { findings: PageWorkItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const topic = useBaniTopic(), grouped = groupFindings(findings);
  const host = usePageTopControls();
  return <section className="page-bani glass-surface border border-border rounded-lg px-4 py-3 min-w-0" aria-label="Bani findings">
    <div className="flex items-start gap-3">
      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 p-0" aria-label="Open Bani" onClick={() => topic(grouped[0]?.question ?? '')}><BaniOrb size={32} mode="idle" /></Button>
      <div className="min-w-0 flex-1">
        <h2 className="font-display font-semibold text-sm">Bani</h2>
        {grouped.length ? (expanded ? grouped : grouped.slice(0, 1)).map(f => <Button key={f.id} variant="ghost" className="bani-finding w-full h-auto justify-start whitespace-normal text-left px-0 py-1 text-sm" onClick={() => topic(f.question)}>{f.title}{f.id.endsWith('-conflict') ? ` · ${f.detail}` : ''}</Button>) : <p className="text-sm text-muted-foreground mt-1">Nothing needs a look.</p>}
        {grouped.length > 1 && <Button variant="ghost" className="bani-fold h-auto p-0 text-xs text-muted-foreground text-left justify-start whitespace-normal" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : `${grouped.length - 1} more: ${grouped.slice(1, 3).map(f => f.title).join(' · ')}`}</Button>}
        <div ref={host?.setWarnings} className="page-bani-notices space-y-2 empty:hidden" />
      </div>
    </div>
  </section>;
}