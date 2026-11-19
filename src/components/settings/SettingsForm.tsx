import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

// Plain form pieces for Settings (Rillet-style): label on the left and control on the right on computer,
// stacked on phone; hairlines between rows; one Save at the bottom. No cards, chips or coloured blocks.

export function Field({ label, hint, htmlFor, missing, children }: { label: string; hint?: string; htmlFor?: string; missing?: boolean; children: ReactNode }) {
  return <div className={`settings-field ${missing ? 'is-missing' : ''}`}>
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="block text-[14px] font-medium text-[color:var(--kit-ink)]">{label}</label>
      {hint && <p className="mt-0.5 text-[12px] text-muted-foreground">{hint}</p>}
    </div>
    <div className="min-w-0 max-w-[420px]">{children}</div>
  </div>;
}

/** Save bar under the form; full width on phone. */
export function SaveBar({ dirty, saving, onSave, onCancel }: { dirty: boolean; saving?: boolean; onSave: () => void; onCancel?: () => void }) {
  return <div className="settings-save">
    {onCancel && <Button type="button" variant="outline" className="max-sm:hidden" disabled={!dirty || saving} onClick={onCancel}>Cancel</Button>}
    <Button type="button" disabled={!dirty || saving} onClick={onSave} className="max-sm:w-full">{saving ? 'Saving…' : 'Save changes'}</Button>
  </div>;
}

/** One choice, saved as soon as it is tapped. Every option is visible with one short line. */
export function Choice<K extends string>({ label, value, options, onChange, disabled }: { label: string; value: K; options: { key: K; title: string; line: string }[]; onChange: (k: K) => void; disabled?: boolean }) {
  return <fieldset className="settings-choice" disabled={disabled}>
    <legend className="text-[14px] font-medium text-[color:var(--kit-ink)]">{label}</legend>
    <div className="mt-2 divide-y divide-[color:var(--settings-line)] rounded-lg border border-[color:var(--settings-line)] bg-white">
      {options.map(o => <label key={o.key} className="flex cursor-pointer items-start gap-3 px-4 py-3">
        <input type="radio" className="mt-1 h-4 w-4 accent-[#1F6B5E]" checked={value === o.key} onChange={() => onChange(o.key)} />
        <span className="min-w-0"><span className={`block text-[14px] ${value === o.key ? 'font-semibold' : ''}`}>{o.title}</span><span className="block text-[12px] text-muted-foreground">{o.line}</span></span>
      </label>)}
    </div>
  </fieldset>;
}

/** Plain list for things you add (sales sources): name, one grey line, Edit. */
export function PlainList({ rows, empty }: { rows: { id: string; name: string; line?: string; onOpen: () => void }[]; empty: string }) {
  if (!rows.length) return <p className="py-6 text-[13px] text-muted-foreground">{empty}</p>;
  return <ul className="divide-y divide-[color:var(--settings-line)] border-y border-[color:var(--settings-line)]">{rows.map(r => <li key={r.id}>
    <button type="button" onClick={r.onOpen} className="flex w-full items-center gap-3 py-3 text-left">
      <span className="min-w-0 flex-1"><span className="block truncate text-[14px]">{r.name}</span>{r.line && <span className="block truncate text-[12px] text-muted-foreground">{r.line}</span>}</span>
      <span className="text-[13px] text-[#2F5E5A]">Edit</span>
    </button>
  </li>)}</ul>;
}
