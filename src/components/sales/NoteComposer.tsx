import { useEffect, useRef, useState } from "react";
import { NOTE_TAGS } from "@/utils/salesRecordChecks";
import "@/components/kit/kit.css";

/** Tag chips (one per note, optional). */
export function NoteTags({ value, onChange }: { value: string | null; onChange: (t: string | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tag">
      {NOTE_TAGS.map((t) => (
        <button key={t} type="button" className="kit-chip kit-chip-choice" aria-pressed={value === t} onClick={() => onChange(value === t ? null : t)}>{t}</button>
      ))}
    </div>
  );
}

/** Controlled "Note for this day" box used while adding sales. Never blocks saving. */
export function DayNoteField({ prompt, body, tag, onBody, onTag }: { prompt: string | null; body: string; tag: string | null; onBody: (v: string) => void; onTag: (t: string | null) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (prompt) ref.current?.focus({ preventScroll: false }); }, [prompt]);
  return (
    <div className="kit space-y-2">
      {prompt && <p className="text-[13px] font-medium" style={{ color: "var(--kit-amber-ink)" }}>{prompt}</p>}
      <label className="block text-xs text-muted-foreground">Note for this day (optional)</label>
      <textarea ref={ref} value={body} maxLength={1000} rows={2} onChange={(e) => onBody(e.target.value)}
        placeholder="e.g. Closed at 9pm because of the storm"
        className="w-full px-3 py-2 text-sm rounded-md border bg-white focus:outline-none focus:ring-1 focus:ring-primary"
        style={{ borderColor: prompt ? "#F3DDBF" : undefined, background: prompt ? "var(--kit-attn)" : undefined }} />
      <NoteTags value={tag} onChange={onTag} />
    </div>
  );
}

/** Add-a-note box for the detail panel. */
export function NoteComposer({ onSend }: { onSend: (body: string, tag: string | null) => Promise<boolean> }) {
  const [body, setBody] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    const ok = await onSend(body, tag);
    setBusy(false);
    if (ok) { setBody(""); setTag(null); }
  };
  return (
    <div className="space-y-2">
      <textarea value={body} maxLength={1000} rows={2} onChange={(e) => setBody(e.target.value)} placeholder="Add a note"
        aria-label="Add a note" className="w-full px-3 py-2 text-sm rounded-md border bg-white focus:outline-none focus:ring-1 focus:ring-primary" />
      <NoteTags value={tag} onChange={setTag} />
      <div className="flex justify-end">
        <button type="button" className="kit-btn kit-btn-primary" disabled={busy || !body.trim()} onClick={send}>{busy ? "Sending…" : "Send"}</button>
      </div>
    </div>
  );
}
