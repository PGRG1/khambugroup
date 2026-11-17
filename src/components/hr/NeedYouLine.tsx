import { useState } from 'react';
import { useBaniTopic } from '@/components/assistant/FloatingBaniContext';
import type { PageWorkItem } from '@/utils/baniPageWork';
import '@/components/kit/kit.css';

/**
 * Page findings shown the way Sales records shows "N days need you · Show them": one quiet line
 * inside the list card instead of a separate Bani box. Display only: each finding's detail opens
 * in place and "Ask Bani" hands its existing question to the floating Bani.
 */
export function NeedYouLine({ findings }: { findings: PageWorkItem[] }) {
  const [open, setOpen] = useState<string[]>([]), [all, setAll] = useState(false), topic = useBaniTopic();
  if (!findings.length) return null;
  const toggle = (id: string) => setOpen(list => list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  return <div className="kit space-y-1 px-1 text-[13px]" style={{ color: 'var(--kit-ink)' }} aria-label="Needs you">
    {(all ? findings : findings.slice(0, 1)).map(f => <div key={f.id}>
      <p><strong>{f.title.replace(/\.$/, '')}</strong> · <button type="button" className="kit-link" aria-expanded={open.includes(f.id)} onClick={() => toggle(f.id)}>{open.includes(f.id) ? 'Hide' : 'Show them'}</button>
        {!all && findings.length > 1 && <> · <button type="button" className="kit-link" onClick={() => setAll(true)}>{findings.length - 1} more</button></>}</p>
      {open.includes(f.id) && <p className="mt-1 text-muted-foreground">{f.detail ? `${f.detail} · ` : ''}<button type="button" className="kit-link" onClick={() => topic(f.question)}>Ask Bani</button></p>}
    </div>)}
  </div>;
}
