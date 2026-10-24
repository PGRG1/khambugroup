import { useEffect, useRef, useState, type DragEvent, type PointerEvent as RPointerEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, X, Plus, FileText } from "lucide-react";
import { useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BaniOrb } from "@/components/assistant/BaniOrb";
import { useAuth } from "@/hooks/useAuth";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { compressImageFile } from "@/utils/imageCompression";
import type { DraftProposal } from "@/utils/floatingDraft";
import { ATTACH_TYPES, attachmentError, clampPoint, isTap, moduleLabel, overDismiss, type Point } from "@/utils/floatingBaniUi";
import { useFloatingBaniStore, type BaniAttachment, type BaniMessage } from "./FloatingBaniContext";

export type FloatingReview = {
  scope: string; binding: string; draftId: string; lineId: string; supplierId: string;
  header: Record<string, string | number | boolean | null>;
  line: Record<string, unknown> | null; issues: string[]; candidateIds: string[];
  label: string; editable: boolean;
  before: (proposal: DraftProposal) => string;
  apply: (proposal: DraftProposal) => boolean;
};
const SPHERE = 48;
const HOLD_MS = 320;
const FILES_ONLY_PROMPT = "Please read the attached file(s), summarise what they show, and ask me what I would like to do with them.";

const toBase64 = (file: File, signal: AbortSignal) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  const stop = () => { reader.abort(); reject(new DOMException("Aborted", "AbortError")); };
  signal.addEventListener("abort", stop, { once: true });
  reader.onload = () => { signal.removeEventListener("abort", stop); resolve(String(reader.result).split(",")[1] || ""); };
  reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
  reader.readAsDataURL(file);
});
const revoke = (files: BaniAttachment[]) => files.forEach(f => f.url && URL.revokeObjectURL(f.url));

export function FloatingBani({ review, openSignal = 0, hosted = false }: { review?: FloatingReview; openSignal?: number; hosted?: boolean }) {
  const store = useFloatingBaniStore();
  const { user, session, isAdmin, loading: authLoading, roleLoading } = useAuth();
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const { isPreviewActive, previewUserId } = usePreviewMode();
  const { pathname } = useLocation();
  const isMobile = useIsMobile();
  const effectiveId = isAdmin && isPreviewActive ? previewUserId : user?.id;
  const { canAccessPage, loading: permissionsLoading } = useUserPermissions(effectiveId || undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dropping, setDropping] = useState(false);
  const [drag, setDrag] = useState<Point | null>(null);
  const [holding, setHolding] = useState(false);
  const [overX, setOverX] = useState(false);
  const [vv, setVv] = useState({ top: 0, h: typeof window !== "undefined" ? window.innerHeight : 800 });
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const sphereEl = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; t: number; held: boolean; moved: number; timer: number; last: Point; over: boolean } | null>(null);
  const panelDrag = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const panelEl = useRef<HTMLElement>(null);

  const [scope, setScope] = store?.scope ?? ["", () => {}];
  const [messages, setMessages] = store?.messages ?? [[], () => {}];
  const [draft, setDraft] = store?.draft ?? ["", () => {}];
  const [files, setFiles] = store?.files ?? [[], () => {}];
  const [open, setOpen] = store?.open ?? [false, () => {}];
  const [hidden, setHidden] = store?.hidden ?? [false, () => {}];
  const [sphere, setSphere] = store?.sphere ?? [null, () => {}];
  const [panelPos, setPanelPos] = store?.panel ?? [null, () => {}];
  const page = store?.page[0] ?? null;
  const host = store?.host ?? null;

  const allowed = Boolean(store && user && tenantId && !authLoading && !roleLoading && !tenantLoading && !permissionsLoading && canAccessPage("assistant") && !isPreviewActive && pathname !== "/assistant" && !pathname.startsWith("/platform") && pathname !== "/auth");
  // Confidential content resets only when the user, client or preview identity changes.
  const identity = `${user?.id}:${tenantId}:${isPreviewActive}`;
  const liveIdentity = useRef(identity); liveIdentity.current = identity;
  const binding = review?.binding;
  const filesRef = useRef(files); filesRef.current = files;

  useEffect(() => {
    if (!store || scope === identity) return;
    abort.current?.abort(); revoke(filesRef.current);
    setMessages([]); setDraft(""); setFiles([]); setOpen(false); setHidden(false); setError(""); setBusy(false); setScope(identity);
  }, [identity, scope, store, setMessages, setDraft, setFiles, setOpen, setHidden, setScope]);
  useEffect(() => { abort.current?.abort(); }, [binding]);
  useEffect(() => () => { abort.current?.abort(); if (gesture.current) clearTimeout(gesture.current.timer); }, []);
  useEffect(() => { if (openSignal) { setHidden(false); setOpen(true); } }, [openSignal, setHidden, setOpen]);
  useEffect(() => { if (open && !isMobile && window.matchMedia?.("(pointer: fine)").matches) input.current?.focus(); }, [open, isMobile]);
  useEffect(() => { const s = end.current?.parentElement; if (s) s.scrollTop = s.scrollHeight; }, [messages, busy, open]);
  useEffect(() => {
    const v = window.visualViewport;
    const update = () => {
      setVv({ top: v?.offsetTop ?? 0, h: v?.height ?? window.innerHeight });
      const w = window.innerWidth, h = window.innerHeight;
      setSphere(p => p ? clampPoint(p, SPHERE, w, h) : p);
      setPanelPos(p => p && panelEl.current ? clampPoint(p, 0, w - panelEl.current.offsetWidth, h - panelEl.current.offsetHeight, 8) : p);
    };
    update();
    v?.addEventListener("resize", update); v?.addEventListener("scroll", update); window.addEventListener("resize", update);
    return () => { v?.removeEventListener("resize", update); v?.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [setSphere, setPanelPos]);

  if (!allowed || (!hosted && host)) return null;
  const module = moduleLabel(pathname);
  const context = review?.label || (page && page.path === pathname ? `${module} · ${page.detail}` : module);

  const addFiles = (list: FileList | File[]) => {
    let next = [...filesRef.current]; let message = "";
    for (const file of Array.from(list)) {
      const problem = attachmentError(file, next);
      if (problem) { message = problem; continue; }
      next = [...next, { id: crypto.randomUUID(), file, name: file.name, type: file.type, size: file.size, url: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined }];
    }
    setFiles(next); setError(message);
  };
  const removeFile = (id: string) => setFiles(prev => { revoke(prev.filter(f => f.id === id)); return prev.filter(f => f.id !== id); });

  const send = async () => {
    const typed = draft.trim();
    const attached = filesRef.current;
    if ((!typed && !attached.length) || busy || !session || !tenantId) return;
    const text = typed || FILES_ONLY_PROMPT;
    const requestIdentity = identity;
    const controller = new AbortController(); abort.current = controller;
    const history = [...messages.map(({ role, content }) => ({ role, content })), { role: "user" as const, content: text }].slice(-12);
    setMessages(prev => [...prev, { role: "user", content: typed, files: attached.map(f => f.name) }]);
    setDraft(""); setFiles([]); setBusy(true); setError("");
    const restore = () => { setDraft(d => d || typed); setFiles(f => f.length ? f : attached); setMessages(prev => prev.slice(0, -1)); };
    try {
      const attachments = attached.length ? await Promise.all(attached.map(async f => {
        const prepared = f.type.startsWith("image/") ? await compressImageFile(f.file) : f.file;
        return { name: f.name, type: prepared.type || f.type, data: await toBase64(prepared, controller.signal) };
      })) : undefined;
      if (controller.signal.aborted) return;
      const reviewBody = review ? { draft_review: { binding: review.binding, draftId: review.draftId, lineId: review.lineId, supplierId: review.supplierId, header: review.header, line: review.line, issues: review.issues, candidateIds: review.candidateIds } } : { floating: true };
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-assistant`, {
        method: "POST", signal: controller.signal,
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, messages: history, ...reviewBody, ...(attachments ? { attachments } : {}) }),
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
          if (event.error) throw new Error(typeof event.error === "string" ? event.error : event.error.message || "Bani could not reply.");
          content += event.choices?.[0]?.delta?.content || "";
          if (event.review) { content = event.review.answer; proposal = event.review.proposal || undefined; }
        }
      }
      if (!controller.signal.aborted && liveIdentity.current === requestIdentity) {
        if (!content.trim()) throw new Error("No answer received. Please try again.");
        revoke(attached);
        setMessages(prev => [...prev, { role: "assistant", content, proposal, before: proposal ? review?.before(proposal) : undefined, target: review ? review.label : undefined }]);
      }
    } catch (e) {
      if (!controller.signal.aborted && liveIdentity.current === requestIdentity) { restore(); setError(e instanceof Error ? e.message : "Bani could not reply."); }
    } finally { if (abort.current === controller) { setBusy(false); abort.current = null; } }
  };

  // Sphere: tap opens; press-and-hold reveals the bottom × and lets the sphere follow the pointer.
  const dismissCentre = () => ({ x: window.innerWidth / 2, y: window.innerHeight - 72 });
  const resetGesture = () => { const g = gesture.current; if (g) clearTimeout(g.timer); gesture.current = null; setHolding(false); setOverX(false); setDrag(null); };
  const onSphereDown = (e: RPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !sphereEl.current) return;
    const r = sphereEl.current.getBoundingClientRect();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    const start = { x: r.left, y: r.top };
    gesture.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, t: performance.now(), held: false, moved: 0, last: start, over: false,
      timer: window.setTimeout(() => { const g = gesture.current; if (g && g.moved < 8) { g.held = true; setHolding(true); setDrag(g.last); } }, HOLD_MS) };
  };
  const onSphereMove = (e: RPointerEvent<HTMLButtonElement>) => {
    const g = gesture.current; if (!g || g.id !== e.pointerId) return;
    g.moved = Math.max(g.moved, Math.hypot(e.clientX - g.sx, e.clientY - g.sy));
    if (!g.held) { if (g.moved >= 8) clearTimeout(g.timer); return; }
    const p = clampPoint({ x: e.clientX - g.ox, y: e.clientY - g.oy }, SPHERE, window.innerWidth, window.innerHeight);
    const c = dismissCentre(); g.last = p; g.over = overDismiss(p, SPHERE, c.x, c.y);
    setDrag(p); setOverX(g.over);
  };
  const onSphereUp = (e: RPointerEvent<HTMLButtonElement>, cancelled = false) => {
    const g = gesture.current; if (!g || g.id !== e.pointerId) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (!cancelled) {
      if (g.held) { if (g.over) { setHidden(true); setOpen(false); } else setSphere(g.last); }
      else if (isTap(g.moved, performance.now() - g.t, HOLD_MS)) setOpen(true);
    }
    resetGesture();
  };
  // Desktop panel moves by its header only (never input, buttons or transcript).
  const onHeaderDown = (e: RPointerEvent<HTMLElement>) => {
    if (isMobile || e.button !== 0 || (e.target as HTMLElement).closest("button,a,input,textarea") || !panelEl.current) return;
    const r = panelEl.current.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    panelDrag.current = { id: e.pointerId, ox: e.clientX - r.left, oy: e.clientY - r.top };
  };
  const onHeaderMove = (e: RPointerEvent<HTMLElement>) => {
    const d = panelDrag.current; if (!d || d.id !== e.pointerId || !panelEl.current) return;
    const el = panelEl.current;
    setPanelPos(clampPoint({ x: e.clientX - d.ox, y: e.clientY - d.oy }, 0, window.innerWidth - el.offsetWidth, window.innerHeight - el.offsetHeight, 8));
  };
  const onHeaderUp = (e: RPointerEvent<HTMLElement>) => { if (panelDrag.current?.id === e.pointerId) { panelDrag.current = null; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* released */ } } };

  const onDrag = (e: DragEvent) => { if (!Array.from(e.dataTransfer.types).includes("Files")) return; e.preventDefault(); setDropping(e.type !== "dragleave"); };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDropping(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); };

  const sphereStyle = drag ? { left: drag.x, top: drag.y } : sphere ? { left: sphere.x, top: sphere.y } : undefined;
  const panelStyle = isMobile ? { maxHeight: vv.h - 16, bottom: `max(.75rem, calc(${Math.max(0, window.innerHeight - vv.h - vv.top)}px + .5rem))` } : panelPos ? { left: panelPos.x, top: panelPos.y, right: "auto", bottom: "auto" } : undefined;
  const restore = <button type="button" className="floating-bani-restore" aria-label="Show Bani assistant" title="Show Bani" onClick={() => { setHidden(false); setOpen(true); }}><BaniOrb size={24} mode="idle" /></button>;
  const restoreSlot = !hosted ? document.getElementById("floating-bani-restore") : null;

  const surface = <div className={`floating-bani ${hosted ? "floating-bani-hosted" : ""}`}>
    {hidden ? (restoreSlot ? createPortal(restore, restoreSlot) : <div className="floating-bani-restore-fixed">{restore}</div>) : open ? (
      <section ref={panelEl} className={`floating-bani-panel ${isMobile ? "is-mobile" : ""}`} style={panelStyle} role="dialog" aria-modal="false" aria-label="Bani assistant" onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}>
        <header className="floating-bani-header" onPointerDown={onHeaderDown} onPointerMove={onHeaderMove} onPointerUp={onHeaderUp} onPointerCancel={onHeaderUp}>
          <BaniOrb size={36} mode={busy ? "thinking" : "idle"} />
          <div className="min-w-0 flex-1"><div className="floating-bani-title">Bani</div><div className="floating-bani-context" title={context}>{context}</div></div>
          <button type="button" className="floating-bani-icon" aria-label="Close Bani" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
        </header>
        <div className="floating-bani-transcript" aria-live="polite">
          {messages.map((message, index) => <div key={index} className={message.role === "user" ? "floating-bani-user" : "floating-bani-answer"}>
            {message.content && <div className="floating-bani-prose"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>}
            {!!message.files?.length && <div className="floating-bani-sent-files">{message.files.map(name => <span key={name} className="floating-bani-file-chip"><FileText className="h-4 w-4" />{name}</span>)}</div>}
            {message.proposal && <div className="floating-bani-change">
              <p className="floating-bani-change-target">{message.target}</p>
              <p className="floating-bani-change-value">{message.proposal.field.replace(/_/g, " ")}: {message.before || "—"} → {message.proposal.value}</p>
              <p className="floating-bani-change-reason">{message.proposal.reason}</p>
              {message.outcome ? <p className="floating-bani-change-reason" role="status">{message.outcome}</p> : <div className="mt-2 flex gap-2">
                <button type="button" className="floating-bani-apply" disabled={!review?.editable || message.proposal.binding !== binding} onClick={() => {
                  const ok = review?.apply(message.proposal as DraftProposal) === true;
                  setMessages(prev => prev.map((m, i) => i === index ? { ...m, outcome: ok ? "Applied to review — not saved" : "Review changed — ask Bani again" } : m));
                }}>Apply</button>
                <button type="button" className="floating-bani-dismiss" onClick={() => setMessages(prev => prev.map((m, i) => i === index ? { ...m, outcome: "Dismissed" } : m))}>Dismiss</button>
              </div>}
              {!message.outcome && message.proposal.binding !== binding && <p className="floating-bani-change-reason">Review changed — ask Bani again</p>}
            </div>}
          </div>)}
          {busy && <div className="floating-bani-typing" aria-label="Bani is replying"><span /><span /><span /></div>}
          {error && <p className="floating-bani-error" role="alert">{error}</p>}
          <div ref={end} />
        </div>
        <form className={`floating-bani-composer ${dropping ? "is-dropping" : ""}`} onDragEnter={onDrag} onDragOver={onDrag} onDragLeave={onDrag} onDrop={onDrop} onSubmit={e => { e.preventDefault(); void send(); }}>
          {!!files.length && <div className="floating-bani-attachments">{files.map(f => <div key={f.id} className="floating-bani-attachment">
            {f.url ? <img src={f.url} alt="" /> : <FileText className="h-5 w-5" />}
            <span className="truncate">{f.name}</span>
            <button type="button" aria-label={`Remove ${f.name}`} onClick={() => removeFile(f.id)}><X className="h-3.5 w-3.5" /></button>
          </div>)}</div>}
          <div className="floating-bani-row">
            <button type="button" className="floating-bani-plus" aria-label="Attach files" disabled={busy} onClick={() => picker.current?.click()}><Plus className="h-5 w-5" /></button>
            <input ref={picker} type="file" hidden multiple accept={ATTACH_TYPES.join(",")} onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
            <textarea ref={input} rows={1} value={draft} maxLength={2000} onChange={e => setDraft(e.target.value)} placeholder="Ask Bani…" aria-label="Ask floating Bani" className="floating-bani-input" onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !isMobile) { e.preventDefault(); void send(); } }} />
            <button type="submit" className="floating-bani-send" disabled={busy || (!draft.trim() && !files.length)} aria-label="Send to Bani"><ArrowUp className="h-5 w-5" /></button>
          </div>
        </form>
      </section>
    ) : <>
      <button ref={sphereEl} type="button" className={`floating-bani-sphere ${drag ? "is-dragging" : ""} ${overX ? "is-over" : ""}`} style={sphereStyle} aria-label="Open Bani" title="Ask Bani"
        onPointerDown={onSphereDown} onPointerMove={onSphereMove} onPointerUp={e => onSphereUp(e)} onPointerCancel={e => onSphereUp(e, true)} onLostPointerCapture={() => { if (gesture.current) resetGesture(); }}
        onContextMenu={e => e.preventDefault()} onClick={e => { if (e.detail === 0) setOpen(true); }}>
        <BaniOrb size={SPHERE} mode="idle" />
      </button>
      <button type="button" className="floating-bani-hide sr-only focus:not-sr-only" onClick={() => { setHidden(true); setOpen(false); }}>Hide assistant</button>
      {holding && <div className={`floating-bani-target ${overX ? "is-active" : ""}`} aria-hidden="true"><X className="h-6 w-6" /></div>}
    </>}
  </div>;
  // A modal owns focus and inertness: portal into that modal, never above it.
  return hosted ? createPortal(surface, host?.node.closest('[role="dialog"]') || document.body) : surface;
}
