import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useQueryClient } from "@tanstack/react-query";
export type ChatActionCard = { id: string; kind: string; title: string; detail?: string | null };
export type PeopleOutcome = { message: string; link?: string; undo_available?: boolean; instruction?: string };
export function PeopleActionCard({ card, outcome, onOutcome, onChange }: { card: ChatActionCard; outcome?: PeopleOutcome; onOutcome: (result: PeopleOutcome) => void; onChange: (text: string) => void }) {
  const { session } = useAuth(); const { tenantId } = useActiveTenant(); const preview = usePreviewMode();
  const query = useQueryClient(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [undoReview, setUndoReview] = useState(false);
  const decide = async (decision: "confirm" | "change" | "cancel" | "undo") => {
    if (!session || !tenantId || preview.isPreviewActive || busy) return;
    setBusy(true); setError("");
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-assistant`, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ tenant_id: tenantId, action_id: card.id, decision }) });
      const result = await resp.json(); if (!resp.ok) throw new Error(result.error || "Nothing changed. Try again.");
      onOutcome(result); setUndoReview(false);
      if (decision === "change") onChange(`${result.instruction || card.title}\nChange: `);
      if (decision === "confirm" || decision === "undo") await query.invalidateQueries();
    } catch (e) { setError(e instanceof Error ? e.message : "Nothing changed. Try again."); }
    finally { setBusy(false); }
  };
  return <section className="my-3 min-w-0 rounded-lg border border-border bg-card p-3 text-sm text-card-foreground" aria-label="People action">
    <p className="font-medium break-words">{card.title}</p>
    {card.detail && <div className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">{card.detail}</div>}
    {outcome ? <p className="mt-2" role="status">{outcome.message} {outcome.link && <Link className="underline underline-offset-4" to={outcome.link}>View in People</Link>}</p> : <div className="mt-3 flex flex-wrap gap-2">
      <Button size="sm" disabled={busy || preview.isPreviewActive} onClick={() => void decide("confirm")}>Confirm</Button>
      <Button size="sm" variant="outline" disabled={busy || preview.isPreviewActive} onClick={() => void decide("change")}>Change</Button>
      <Button size="sm" variant="ghost" disabled={busy || preview.isPreviewActive} onClick={() => void decide("cancel")}>Cancel</Button>
    </div>}
    {outcome?.undo_available && <div className="mt-2 flex flex-wrap items-center gap-2">
      {undoReview ? <><span className="text-xs text-muted-foreground">Restore the previous rota or leave records?</span><Button size="sm" disabled={busy || preview.isPreviewActive} onClick={() => void decide("undo")}>Confirm undo</Button><Button size="sm" variant="ghost" onClick={() => setUndoReview(false)}>Cancel</Button></> : <Button size="sm" variant="outline" disabled={busy || preview.isPreviewActive} onClick={() => setUndoReview(true)}>Undo</Button>}
    </div>}
    {busy && <p role="status" className="mt-2 text-xs text-muted-foreground">Working on it…</p>}
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </section>;
}