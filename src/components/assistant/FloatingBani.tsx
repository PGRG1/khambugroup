import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, X, ExternalLink } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BaniLoginMark } from "@/components/brand/BaniLoginMark";
import { BaniProcessingMark } from "@/components/brand/BaniProcessingMark";
import { useAuth } from "@/hooks/useAuth";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { supabase } from "@/integrations/supabase/client";
import type { DraftProposal } from "@/utils/floatingDraft";
import { useFloatingBaniHost } from "./FloatingBaniContext";

export type FloatingReview = {
  scope: string; binding: string; draftId: string; lineId: string; supplierId: string;
  header: Record<string, string | number | boolean | null>;
  line: Record<string, unknown> | null; issues: string[]; candidateIds: string[];
  label: string; editable: boolean;
  before: (proposal: DraftProposal) => string;
  apply: (proposal: DraftProposal) => boolean;
};
type Message = { role: "user" | "assistant"; content: string; proposal?: DraftProposal; outcome?: string };
export function FloatingBani({ review, openSignal = 0, hosted = false }: { review?: FloatingReview; openSignal?: number; hosted?: boolean }) {
  const { user, session, isAdmin, loading: authLoading, roleLoading } = useAuth();
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const { isPreviewActive, previewUserId } = usePreviewMode();
  const { pathname } = useLocation();
  const effectiveId = isAdmin && isPreviewActive ? previewUserId : user?.id;
  const { canAccessPage, loading: permissionsLoading } = useUserPermissions(effectiveId || undefined);
  const { host } = useFloatingBaniHost();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const allowed = Boolean(user && tenantId && !authLoading && !roleLoading && !tenantLoading && !permissionsLoading && canAccessPage("assistant") && !isPreviewActive && pathname !== "/assistant" && !pathname.startsWith("/platform") && pathname !== "/auth");
  const scope = `${user?.id}:${tenantId}:${pathname}:${isPreviewActive}:${review?.scope || "general"}`;
  const liveScope = useRef(scope); liveScope.current = scope;
  const binding = review?.binding;
  useEffect(() => { abort.current?.abort(); setMessages([]); setDraft(""); setError(""); setBusy(false); setOpen(false); return () => abort.current?.abort(); }, [scope]);
  useEffect(() => { abort.current?.abort(); setBusy(false); }, [binding]);
  useEffect(() => { if (openSignal) setOpen(true); }, [openSignal]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { const scroller = end.current?.parentElement; if (scroller) scroller.scrollTop = scroller.scrollHeight; }, [messages, busy]);
  if (!allowed || (!hosted && host)) return null;
  const module = pathname.startsWith("/procurement") ? "Procurement" : pathname.startsWith("/hr") ? "People" : pathname.startsWith("/revenue") ? "Revenue" : pathname.startsWith("/finance") ? "Finance" : "Portal";
  const send = async () => {
    const text = draft.trim();
    if (!text || busy || !session || !tenantId) return;
    const requestScope = scope;
    const controller = new AbortController(); abort.current = controller;
    const history = [...messages.map(({ role, content }) => ({ role, content })), { role: "user" as const, content: text }].slice(-12);
    setMessages(prev => [...prev, { role: "user", content: text }]); setDraft(""); setBusy(true); setError("");
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-assistant`, {
        method: "POST", signal: controller.signal,
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, messages: history, ...(review ? { draft_review: { binding: review.binding, draftId: review.draftId, lineId: review.lineId, supplierId: review.supplierId, header: review.header, line: review.line, issues: review.issues, candidateIds: review.candidateIds } } : { floating: true }) }),
      });
      if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e.error || e.message || "Bani is unavailable. Try again later."); }
      const reader = response.body?.getReader(); if (!reader) throw new Error("No reply received.");
      const decoder = new TextDecoder(); let buffer = "", content = ""; let proposal: DraftProposal | undefined;
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
          const event = JSON.parse(line.slice(6));
          if (event.error) throw new Error(event.error);
          content += event.choices?.[0]?.delta?.content || "";
          if (event.review) { content = event.review.answer; proposal = event.review.proposal || undefined; }
        }
      }
      if (!controller.signal.aborted && liveScope.current === requestScope) {
        if (!content.trim()) throw new Error("No answer received. Please try again.");
        setMessages(prev => [...prev, { role: "assistant", content, proposal }]);
      }
    } catch (e) { if (!controller.signal.aborted && liveScope.current === requestScope) setError(e instanceof Error ? e.message : "Bani could not reply."); }
    finally { if (abort.current === controller) { setBusy(false); abort.current = null; } }
  };
  const surface = <div className={`floating-bani ${hosted ? "floating-bani-hosted" : ""}`}>
    {open ? <section className="floating-bani-panel" aria-label="Bani assistant" onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}>
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2"><BaniLoginMark className="h-6 w-3 text-primary" /><span className="font-display font-semibold">Bani</span></div>
        <div className="flex gap-1"><Button variant="ghost" size="icon" asChild title="Open full Bani"><Link to="/assistant" aria-label="Open full Bani"><ExternalLink className="h-4 w-4" /></Link></Button><Button variant="ghost" size="icon" aria-label="Close Bani" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button></div>
      </header>
      <div className="px-4 pt-2"><span className="inline-block max-w-full truncate rounded border border-border px-2 py-1 text-xs text-muted-foreground">{review?.label || module}</span></div>
      <div className="floating-bani-transcript px-4 py-3" aria-live="polite">
        {messages.map((message, index) => <div key={index} className={`mb-4 min-w-0 text-sm ${message.role === "user" ? "ml-6 rounded-lg bg-muted/60 p-2" : ""}`}>
          <div className="floating-bani-prose"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>
          {message.proposal && <div className="mt-3 rounded-lg border border-border bg-background p-3">
            <p className="text-xs font-medium">{review?.header.invoice_number || "Invoice review"} · selected line</p>
            <p className="mt-1 break-words text-sm">{message.proposal.field.replace(/_/g, " ")}: {review?.before(message.proposal) || "—"} → {message.proposal.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{message.proposal.reason}</p>
            {message.outcome ? <p className="mt-2 text-xs" role="status">{message.outcome}</p> : <div className="mt-2 flex gap-2">
              <Button size="sm" disabled={!review?.editable || message.proposal.binding !== binding} onClick={() => {
                const ok = review?.apply(message.proposal as DraftProposal) === true;
                setMessages(prev => prev.map((m, i) => i === index ? { ...m, outcome: ok ? "Applied to review — not saved" : "Review changed — ask Bani again" } : m));
              }}>Apply</Button>
              <Button size="sm" variant="ghost" onClick={() => setMessages(prev => prev.map((m, i) => i === index ? { ...m, outcome: "Dismissed" } : m))}>Dismiss</Button>
            </div>}
            {!message.outcome && message.proposal.binding !== binding && <p className="mt-2 text-xs text-muted-foreground">Review changed — ask Bani again</p>}
          </div>}
        </div>)}
        {busy && <BaniProcessingMark size={20} />}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div ref={end} />
      </div>
      <form className="flex shrink-0 items-end gap-2 border-t border-border p-3" onSubmit={e => { e.preventDefault(); void send(); }}>
        <Textarea ref={input} value={draft} maxLength={2000} onChange={e => setDraft(e.target.value)} placeholder="Ask Bani" aria-label="Ask floating Bani" className="min-h-11 max-h-28 resize-none" onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
        <Button type="submit" size="icon" disabled={busy || !draft.trim()} aria-label="Send to Bani"><ArrowUp className="h-4 w-4" /></Button>
      </form>
    </section> : <Button className="floating-bani-launcher" size="icon" aria-label="Open Bani" title="Ask Bani" onClick={() => setOpen(true)}><BaniLoginMark className="h-7 w-4" /></Button>}
  </div>;
  // A modal owns focus and inertness: portal into that modal, never above it.
  // The current scanner is inline; body avoids its transformed/clipped card ancestor.
  return hosted ? createPortal(surface, host?.node.closest('[role="dialog"]') || document.body) : surface;
}