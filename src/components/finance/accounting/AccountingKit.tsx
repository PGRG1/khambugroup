import type { KeyboardEvent, ReactNode } from 'react';

// Shared pieces for the Accounting tabs, matching Cash, Receivables and Payables:
// a summary card (label, one green ✓ line, 2–4 numbers), then one card with a table on computer
// and a grouped list on phone. Status words are amber (needs you), green ✓ (fine) or grey (info).
export const AMBER = '#B45309';
export const GREEN = '#1F6B5E';
export type Tone = 'amber' | 'ok' | 'mut';

export const Flag = ({ text }: { text: string }) => <span className="sales-flag" role="img" aria-label={text} title={text}>!</span>;

export function Status({ text, tone }: { text: ReactNode; tone: Tone }) {
  return <span className={tone === 'amber' ? 'text-[#B45309]' : tone === 'ok' ? 'text-[#1F6B5E]' : 'text-muted-foreground'}>{tone === 'ok' ? '✓ ' : ''}{text}</span>;
}

export const keyOpen = (fn: () => void) => ({
  tabIndex: 0,
  onClick: fn,
  onKeyDown: (e: KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fn(); } },
});

export type Stat = { label: string; value: ReactNode; sub?: ReactNode; tone?: 'amber' | 'green' };
const COLS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4' };

export function Hero({ label, check, checkTone = 'ok', stats, busy, aria }: { label: ReactNode; check?: ReactNode; checkTone?: Tone; stats: Stat[]; busy?: boolean; aria: string }) {
  return <section className="card-glass rounded-xl p-4 min-w-0" aria-label={aria} aria-busy={busy}>
    <div className="flex items-baseline justify-between gap-3 px-1">
      <p className="min-w-0 truncate text-[12px] text-muted-foreground">{label}</p>
      {check && <p className="shrink-0 text-[12px] whitespace-nowrap"><Status text={check} tone={checkTone} /></p>}
    </div>
    <div className={`mt-2 grid gap-3 px-1 ${COLS[Math.min(stats.length, 4)]}`}>{stats.map(s => <div key={s.label} className="min-w-0">
      <p className="text-[12px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">{s.label}</p>
      <p className={`mt-0.5 text-[20px] max-sm:text-[15px] font-semibold td-num whitespace-nowrap overflow-hidden text-ellipsis ${s.tone === 'amber' ? 'text-[#B45309]' : s.tone === 'green' ? 'text-[#1F6B5E]' : ''}`}>{busy ? '…' : s.value}</p>
      {s.sub && <p className="mt-0.5 text-[12px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">{s.sub}</p>}
    </div>)}</div>
  </section>;
}

export function Section({ title, detail, aria, busy, children }: { title: string; detail?: ReactNode; aria?: string; busy?: boolean; children: ReactNode }) {
  return <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label={aria ?? title} aria-busy={busy}>
    <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5"><span>{title}</span>{detail != null && <span className="text-[13px] text-muted-foreground font-normal whitespace-nowrap">· {detail}</span>}</h2>
    {children}
  </section>;
}

export const Note = ({ children }: { children: ReactNode }) => <p className="px-1 text-[12px] text-muted-foreground">{children}</p>;

export const Ask = ({ children }: { children: ReactNode }) => <div className="rounded-[14px] bg-[#FDF3E8] px-4 py-3 text-[13px] text-[#8A420B]"><b className="font-semibold">Needs you:</b> {children}</div>;

export const GroupHead = ({ name, right }: { name: ReactNode; right?: ReactNode }) => <p className="mt-3 mb-1 px-2 flex justify-between gap-2 text-[13px] font-semibold text-[color:var(--kit-ink)] whitespace-nowrap"><span className="truncate">{name}</span>{right != null && <span className="td-num">{right}</span>}</p>;

/** One phone row: flag, name and amount on top, one grey or amber line under it. */
export function PhoneRow({ flag, title, amount, sub, tone = 'mut', onOpen }: { flag?: string | false; title: ReactNode; amount?: ReactNode; sub?: ReactNode; tone?: Tone; onOpen?: () => void }) {
  return <li className={`flex items-center gap-2 px-2 min-h-11 py-2 ${onOpen ? 'cursor-pointer' : ''} ${flag ? 'bg-[#FDF3F2]' : ''}`} {...(onOpen ? keyOpen(onOpen) : {})}>
    <span className="w-4 shrink-0">{flag && <Flag text={flag} />}</span>
    <span className="block flex-1 min-w-0">
      <span className="flex items-baseline justify-between gap-2"><span className="truncate text-[14px]">{title}</span>{amount != null && <span className="td-num shrink-0 text-[14px]">{amount}</span>}</span>
      {sub != null && <span className={`mt-0.5 block truncate text-[12px] ${tone === 'amber' ? 'text-[#B45309]' : tone === 'ok' ? 'text-[#1F6B5E]' : 'text-muted-foreground'}`}>{sub}</span>}
    </span>
  </li>;
}

export const Empty = ({ children }: { children: ReactNode }) => <p className="p-8 text-center text-sm text-muted-foreground">{children}</p>;

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return <div className="flex items-center justify-between px-1 text-[12px] text-muted-foreground">
    <span>Page {page} of {pages}</span>
    <span className="flex gap-3">
      <button type="button" className="kit-link disabled:opacity-40" disabled={page === 1} onClick={() => onPage(page - 1)}>Previous</button>
      <button type="button" className="kit-link disabled:opacity-40" disabled={page === pages} onClick={() => onPage(page + 1)}>Next</button>
    </span>
  </div>;
}
