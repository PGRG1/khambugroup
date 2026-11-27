import { useId, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

// Settings pieces, built like Revenue and Purchasing: a SettingsCard is a kit card with its title on top and one Edit;
// saved values (Row) read as a grid of label-over-value, lists run full width, Choice shows options side by side.
// "Edit" turns that card alone into fields with Cancel and Save. No lines.

export function SettingsCard({ title, onEdit, action, editing, children }: { title?: string; onEdit?: () => void; action?: ReactNode; editing?: boolean; children: ReactNode }) {
  return <section className={`settings-card ${title ? 'has-title' : 'no-title'} ${editing ? 'is-editing' : ''}`} aria-label={title}>
    {(title || onEdit || action) && <div className="settings-card-head">
      {title && <h3 className="settings-card-title">{title}</h3>}
      {!editing && onEdit && <button type="button" className="settings-edit" onClick={onEdit}>Edit</button>}
      {!editing && !onEdit && action}
    </div>}
    {children}
  </section>;
}

/** One saved value. Missing ones read in orange. */
/** wide: takes the whole card width and wraps (addresses, notes) instead of cutting off. */
export function Row({ label, value, missing, wide }: { label: string; value?: ReactNode; missing?: string; wide?: boolean }) {
  return <div className={`settings-row ${wide ? 'is-wide' : ''}`}>
    <span className="settings-row-label">{label}</span>
    <span className={`settings-row-value ${!value && missing ? 'is-missing' : ''}`}>{value || missing || '—'}</span>
  </div>;
}

export function Field({ label, hint, htmlFor, missing, children }: { label: string; hint?: string; htmlFor?: string; missing?: boolean; children: ReactNode }) {
  return <div className={`settings-field ${missing ? 'is-missing' : ''}`}>
    <label htmlFor={htmlFor} className="settings-row-label">{label}{hint && <span className="block text-[12px] text-muted-foreground">{hint}</span>}</label>
    <div className="min-w-0 max-w-[420px]">{children}</div>
  </div>;
}

export function SaveBar({ dirty, saving, onSave, onCancel, label = 'Save' }: { dirty: boolean; saving?: boolean; onSave: () => void; onCancel?: () => void; label?: string }) {
  return <div className="settings-save">
    {onCancel && <Button type="button" variant="outline" className="rounded-full" disabled={saving} onClick={onCancel}>Cancel</Button>}
    <Button type="button" className="rounded-full" disabled={!dirty || saving} onClick={onSave}>{saving ? 'Saving…' : label}</Button>
  </div>;
}

/** One choice in its own card, saved as soon as it is tapped. Every option visible with one short line. */
export function Choice<K extends string>({ label, value, options, onChange, disabled }: { label: string; value: K; options: { key: K; title: string; line: string }[]; onChange: (k: K) => void; disabled?: boolean }) {
  const id = useId();
  return <section className="settings-card has-title" aria-labelledby={id}>
    <h3 id={id} className="settings-card-title">{label}</h3>
    <fieldset disabled={disabled} aria-labelledby={id} className="min-w-0">
      <div className="settings-choice-options">{options.map(o => <label key={o.key} className="settings-choice">
        <input type="radio" className="mt-0.5 h-4 w-4 accent-[#1F6B5E]" checked={value === o.key} onChange={() => onChange(o.key)} />
        <span className="min-w-0"><span className={`block text-[13px] ${value === o.key ? 'font-semibold' : ''}`}>{o.title}</span><span className="block text-[12.5px] text-muted-foreground">{o.line}</span></span>
      </label>)}</div>
    </fieldset>
  </section>;
}

/** Plain list for added things: name, one grey line, Edit. No lines between rows. */
export function PlainList({ rows, empty }: { rows: { id: string; name: string; line?: string; onOpen: () => void }[]; empty: string }) {
  if (!rows.length) return <p className="py-2 text-[13px] text-muted-foreground">{empty}</p>;
  return <ul>{rows.map(r => <li key={r.id}>
    <button type="button" onClick={r.onOpen} className="settings-list-row">
      <span className="min-w-0 flex-1"><span className="block truncate text-[13px]">{r.name}</span>{r.line && <span className="block truncate text-[12px] text-muted-foreground">{r.line}</span>}</span>
      <span className="text-[13px] text-[#1F6B5E]">Edit</span>
    </button>
  </li>)}</ul>;
}

/** Top-right action beside the page title (Add, Invite). */
export const PageAction = ({ children }: { children: ReactNode }) => <div className="settings-action">{children}</div>;
