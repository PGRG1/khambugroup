import { useRef, useState } from "react";
import { ArrowUp, Check, Loader2, Mic, Square, X } from "lucide-react";
import { BaniProcessingMark } from "@/components/brand/BaniProcessingMark";
import { useAuth } from "@/hooks/useAuth";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { useDictation, joinDraft } from "@/hooks/useDictation";
import type { SalesRecord } from "@/types/sales";
import { applySalesChanges, sanitizeSalesChanges, type SalesChange } from "@/utils/salesReceiptCorrections";
import { formatCurrency } from "@/utils/format";

type Turn = { role: "user" | "assistant"; content: string };
type Proposal = { changes: SalesChange[]; base: SalesRecord };

const LABELS: Record<string, string> = {
  date: "Date", venue: "Venue", reportNumber: "Report #", orders: "Orders", guests: "Guests",
  subtotal: "Subtotal", serviceCharge: "Service Charge", discount: "Discount", totalSales: "Total Sales",
  visa: "VISA", mastercard: "Mastercard", amex: "AMEX", unionPay: "Union Pay", jcb: "JCB", alipay: "Alipay",
  wechat: "WeChat", payme: "PayMe", cash: "Cash", cardTips: "Card Tips",
};
const show = (field: string, v: unknown) =>
  typeof v === "number" && field !== "orders" && field !== "guests" ? formatCurrency(Math.abs(v)) : String(v ?? "—");

/** Talk or type corrections to the unsaved receipt. Bani proposes; you Apply; Save stays manual. */
export function SalesReceiptBani({ record, venues, onApply }: { record: SalesRecord; venues: string[]; onApply: (next: SalesRecord) => void }) {
  const { session } = useAuth();
  const { tenantId } = useActiveTenant();
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const recordRef = useRef(record); recordRef.current = record;
  const dictation = useDictation({ getAuth: () => ({ token: session?.access_token ?? null, tenantId }), onError: setError });

  const ask = async (message: string) => {
    const q = message.trim();
    if (!q || busy || !session || !tenantId) return;
    const base = recordRef.current;
    const history = [...turns, { role: "user" as const, content: q }].slice(-8);
    setTurns(history); setText(""); setBusy(true); setError(""); setProposal(null);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-assistant`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, messages: history, sales_review: { record: base } }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body.error || "Bani could not review this receipt.");
      setTurns(t => [...t, { role: "assistant", content: String(body.answer || "") }]);
      const changes = sanitizeSalesChanges(body.changes, venues);
      if (changes?.length) setProposal({ changes, base });
    } catch (e) {
      setTurns(t => t.slice(0, -1)); setText(q);
      setError(e instanceof Error ? e.message : "Bani could not review this receipt.");
    } finally { setBusy(false); }
  };

  // A proposal is only valid for the draft it was made against.
  const stale = proposal ? JSON.stringify(proposal.base) !== JSON.stringify(record) : false;
  const preview = proposal ? applySalesChanges(proposal.base, proposal.changes) : null;

  const stopDictation = async (send: boolean) => {
    const heard = await dictation.confirm();
    if (!heard) return;
    if (send) void ask(joinDraft(text, heard)); else setText(t => joinDraft(t, heard));
  };

  return (
    <div className="rounded-xl border border-border bg-card/60 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <BaniProcessingMark className="h-4 w-4" /> Fix with Bani
        <span className="text-xs font-normal text-muted-foreground">Say or type what's wrong — e.g. "service charge is 10%, cash was 450, rest is Visa".</span>
      </div>

      {turns.length > 0 && (
        <div className="max-h-48 overflow-y-auto space-y-1.5 text-sm">
          {turns.map((t, i) => (
            <p key={i} className={t.role === "user" ? "text-muted-foreground" : "text-foreground whitespace-pre-wrap"}>
              {t.role === "user" ? "You: " : "Bani: "}{t.content}
            </p>
          ))}
        </div>
      )}

      {proposal && preview && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-2 space-y-1.5">
          <ul className="text-sm space-y-0.5">
            {proposal.changes.map((c, i) => (
              <li key={i} className="td-num">
                <span className="text-muted-foreground">{LABELS[c.field] ?? c.field}:</span>{" "}
                {show(c.field, proposal.base[c.field as keyof SalesRecord])} → <strong>{show(c.field, preview[c.field as keyof SalesRecord])}</strong>
              </li>
            ))}
          </ul>
          {stale && <p className="text-xs text-warning">The receipt changed since Bani suggested this — ask again.</p>}
          <div className="flex gap-2">
            <button type="button" disabled={stale} onClick={() => { onApply(applySalesChanges(recordRef.current, proposal.changes)); setProposal(null); }}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50">
              <Check className="h-3.5 w-3.5" /> Apply
            </button>
            <button type="button" onClick={() => setProposal(null)} className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground">Dismiss</button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center gap-2">
        {dictation.active ? (
          <>
            <button type="button" aria-label="Cancel recording" onClick={dictation.cancel} className="rounded-full border border-border p-2 text-muted-foreground"><X className="h-4 w-4" /></button>
            <span className="flex-1 text-sm text-muted-foreground">{dictation.state === "transcribing" ? "Transcribing…" : "Listening…"}</span>
            <button type="button" aria-label="Stop and edit" onClick={() => void stopDictation(false)} className="rounded-full border border-border p-2"><Square className="h-4 w-4" /></button>
            <button type="button" aria-label="Stop and send" onClick={() => void stopDictation(true)} className="rounded-full bg-primary p-2 text-primary-foreground"><ArrowUp className="h-4 w-4" /></button>
          </>
        ) : (
          <>
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void ask(text); } }}
              placeholder="What needs fixing?" disabled={busy}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            {dictation.supported && (
              <button type="button" aria-label="Speak a correction" disabled={busy} onClick={() => { setError(""); void dictation.start(); }} className="rounded-full border border-border p-2 text-muted-foreground disabled:opacity-50"><Mic className="h-4 w-4" /></button>
            )}
            <button type="button" aria-label="Send" disabled={busy || !text.trim()} onClick={() => void ask(text)} className="rounded-full bg-primary p-2 text-primary-foreground disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
