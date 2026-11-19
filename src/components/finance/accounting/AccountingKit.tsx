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

const CHIP: Record<Tone, string> = { amber: 'bg-[rgba(224,123,26,.15)] text-[#B45309]', ok: 'bg-[rgba(22,163,74,.12)] text-[#15803D]', mut: 'bg-muted text-muted-foreground' };

/** Same shape as Purchasing's main card: "What · when", one big short number with a small chip beside it,
 *  then up to three small numbers. Callers pass short values (shortMoney) and a chip of two or three words. */
export function Hero({ label, check, checkTone = 'ok', stats, busy, aria }: { label: ReactNode; check?: ReactNode; checkTone?: Tone; stats: Stat[]; busy?: boolean; aria: string }) {
  const [main, ...rest] = stats;
  return <section className="glass-surface rounded-xl border border-border/60 px-5 py-5 space-y-4 max-sm:px-4 max-sm:py-4 max-sm:space-y-3 min-w-0" aria-label={aria} aria-busy={busy}>
    <div className="min-w-0">
      <p className="text-[13px] font-medium text-muted-foreground truncate">{main ? <>{main.label} · {label}</> : label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
        {main && <span className={`text-[32px] sm:text-[42px] leading-none font-semibold td-num tabular-nums whitespace-nowrap ${main.tone === 'amber' ? 'text-[#B45309]' : ''}`}>{busy ? '…' : main.value}</span>}
        {check && !busy && <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium whitespace-nowrap ${CHIP[checkTone]}`}>{checkTone === 'ok' ? '✓ ' : ''}{check}</span>}
      </div>
    </div>
    {rest.length > 0 && <div className="grid gap-3 border-t border-border/50 pt-3" style={{ gridTemplateColumns: `repeat(${Math.min(rest.length, 3)}, minmax(0, 1fr))` }}>{rest.slice(0, 3).map(s => <div key={s.label} className="min-w-0">
      <p className="text-[11px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">{s.label}</p>
      <p className={`text-[16px] font-semibold td-num tabular-nums whitespace-nowrap ${s.tone === 'amber' ? 'text-[#B45309]' : s.tone === 'green' ? 'text-[#1F6B5E]' : ''}`}>{busy ? '…' : s.value}</p>
      {s.sub && <p className="text-[11px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis">{s.sub}</p>}
    </div>)}</div>}
  </section>;
}

export function Section({ title, detail, aria, busy, children }: { title: string; detail?: ReactNode; aria?: string; busy?: boolean; children: ReactNode }) {
  return <section className="card-glass rounded-xl p-3 sm:p-4 space-y-3 min-w-0" aria-label={aria ?? title} aria-busy={busy}>
    <h2 className="text-base font-display font-semibold px-1 flex flex-wrap gap-x-1.5"><span>{title}</span>{detail != null && <span className="text-[13px] text-muted-foreground font-normal whitespace-nowrap">· {detail}</span>}</h2>
    {children}
  </section>;
}

export const Note = (_: { children: ReactNode }) => null;

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
