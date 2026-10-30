import { useEffect, useRef, useState, type DragEvent, type PointerEvent as RPointerEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, X, Plus, FileText, Mic, MicOff, Check, AudioLines } from "lucide-react";
import { useVoiceConversation, type SpeakEvent, type VoiceState } from "@/hooks/useVoiceConversation";
import { useDictation, joinDraft } from "@/hooks/useDictation";
import { LiveWaveform } from "@/components/assistant/LiveWaveform";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { recentBaniTurns } from "../../../supabase/functions/_shared/baniConversation";
import { BaniOrb } from "@/components/assistant/BaniOrb";
import { useAuth } from "@/hooks/useAuth";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { compressImageFile } from "@/utils/imageCompression";
import type { DraftProposal } from "@/utils/floatingDraft";
import { ATTACH_TYPES, ROLE_ACTIVITY, attachmentError, clampPoint, isTap, moduleLabel, overDismiss, teamRoles, type Point } from "@/utils/floatingBaniUi";
import { clearSalesHandoff, clearScannerHandoff, requestSalesHandoff, requestScannerHandoff } from "@/utils/scannerHandoff";
import { applySalesChanges, sanitizeSalesChanges } from "@/utils/salesReceiptCorrections";
import { fmtHK } from "@/components/expenses/shared";
import { useVenueScope } from "@/hooks/useVenueScope";
import { useFloatingBaniStore, type BaniActionCard, type BaniAttachment, type BaniMessage } from "./FloatingBaniContext";

export type FloatingReview = {
  scope: string; binding: string; draftId: string; lineId: string; supplierId: string;
  header: Record<string, string | number | boolean | null>;
  line: Record<string, unknown> | null; issues: string[]; candidateIds: string[];
  label: string; editable: boolean;
  before: (proposal: DraftProposal) => string;
  apply: (proposal: DraftProposal) => boolean;
};
const SALES_LABELS: Record<string, string> = {
  date: "Date", venue: "Venue", reportNumber: "Report #", orders: "Orders", guests: "Guests",
  subtotal: "Subtotal", serviceCharge: "Service Charge", discount: "Discount", totalSales: "Total Sales",
  visa: "VISA", mastercard: "Mastercard", amex: "AMEX", unionPay: "Union Pay", jcb: "JCB", alipay: "Alipay",
  wechat: "WeChat", payme: "PayMe", cash: "Cash", cardTips: "Card Tips",
};
const showSales = (field: string, v: unknown) => typeof v === "number" && field !== "orders" && field !== "guests" ? fmtHK(Math.abs(v)) : String(v ?? "—");
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
  const venueScope = useVenueScope();
  const { user, session, isAdmin, loading: authLoading, roleLoading } = useAuth();
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const { isPreviewActive, previewUserId } = usePreviewMode();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const effectiveId = isAdmin && isPreviewActive ? previewUserId : user?.id;
  const { canAccessPage, loading: permissionsLoading } = useUserPermissions(effectiveId || undefined);
  const [busy, setBusy] = useState(false);
  const [stepLabel, setStepLabel] = useState("");
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
  const springRaf = useRef(0);
  const vel = useRef({ x: 0, y: 0, t: 0, px: 0, py: 0 });
  const sheet = useRef<{ id: number; sy: number; dy: number; t: number } | null>(null);
  useEffect(() => () => cancelAnimationFrame(springRaf.current), []);
  const dictation = useDictation({ getAuth: () => ({ token: session?.access_token ?? null, tenantId }), onError: msg => setError(msg) });
  dictation.setOnAutoFinish(t => setDraft(d => joinDraft(d, t)));
  // In-card voice conversation: the same voice loop as the Bani AI page, never navigating away.
  const [voiceMode, setVoiceMode] = useState(false);
  type VoiceOpts = { voice: boolean; voiceLanguage: string; onSpeak?: (s: SpeakEvent) => void; onStatus?: (label: string) => void };
  const sendRef = useRef<(turn?: { text: string; opts: VoiceOpts; hidden?: boolean }) => Promise<void>>(async () => {});
  const voice = useVoiceConversation({
    active: voiceMode,
    getAuth: () => ({ token: session?.access_token ?? null, tenantId }),
    sendQuestion: (text, opts) => sendRef.current({ text, opts }),
    onError: msg => setError(msg),
  });
  const voiceEndRef = useRef(voice.end); voiceEndRef.current = voice.end;

  const [scope, setScope] = store?.scope ?? ["", () => {}];
  const [messages, setMessages] = store?.messages ?? [[], () => {}];
  const [draft, setDraft] = store?.draft ?? ["", () => {}];
  const [files, setFiles] = store?.files ?? [[], () => {}];
  const [lastFiles, setLastFiles] = store?.lastFiles ?? [[], () => {}];
  const [open, setOpen] = store?.open ?? [false, () => {}];
  const [hidden, setHidden] = store?.hidden ?? [false, () => {}];
  const [sphere, setSphere] = store?.sphere ?? [null, () => {}];
  const [panelPos, setPanelPos] = store?.panel ?? [null, () => {}];
  const page = store?.page[0] ?? null;
  const host = store?.host ?? null;
  const salesDraft = review ? null : store?.sales[0] ?? null;
  const salesRef = useRef(salesDraft); salesRef.current = salesDraft;

  const allowed = Boolean(store && user && tenantId && !authLoading && !roleLoading && !tenantLoading && !permissionsLoading && canAccessPage("assistant") && !isPreviewActive && pathname !== "/assistant" && !pathname.startsWith("/platform") && pathname !== "/auth");
  // Confidential content resets only when the user, client or preview identity changes.
  const identity = `${user?.id}:${tenantId}:${isPreviewActive}`;
  const liveIdentity = useRef(identity); liveIdentity.current = identity;
  const binding = review?.binding;
  const filesRef = useRef(files); filesRef.current = files;
  const lastFilesRef = useRef(lastFiles); lastFilesRef.current = lastFiles;

  useEffect(() => {
    if (!store || scope === identity) return;
    abort.current?.abort(); revoke(filesRef.current); revoke(lastFilesRef.current); clearScannerHandoff(); clearSalesHandoff();
    voiceEndRef.current(); setVoiceMode(false);
    setMessages([]); setDraft(""); setFiles([]); setLastFiles([]); setOpen(false); setHidden(false); setError(""); setBusy(false); setScope(identity);
  }, [identity, scope, store, setMessages, setDraft, setFiles, setLastFiles, setOpen, setHidden, setScope]);
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

  const openedAt = useRef(0);
  useEffect(() => { if (open) openedAt.current = performance.now(); if (!open || hidden) { voiceEndRef.current(); setVoiceMode(false); } }, [open, hidden]);
  useEffect(() => () => voiceEndRef.current(), []);

  // Proactive briefing: the first time Bani is opened each day with an empty
  // conversation, it briefs you on what needs attention — no prompt needed.
  // (Hooks must stay above the early return below.)
  const briefedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!allowed || !open || hidden || busy || messages.length || review || salesDraft || !session || !tenantId) return;
    const key = `${identity}:${new Date().toISOString().slice(0, 10)}`;
    if (briefedFor.current === key) return;
    briefedFor.current = key;
    void sendRef.current({
      text: "Morning briefing: look over the workspace and tell me, in 3–5 short bullets, what needs my attention today — missing sales days, figures that don't add up, supplier price moves, bills due. Lead with the most urgent. If you spot something I can fix with one tap, attach an action card for it. If nothing needs attention, say so in one line.",
      opts: { voice: false, voiceLanguage: "en" },
      hidden: true,
    }).catch(() => {});
  }, [allowed, open, hidden, busy, messages.length, review, salesDraft, session, tenantId, identity]);

  if (!allowed || (!hosted && host)) return null;
  // Visual only: the team is the default; specialists appear only while working on a question.
  const voiceLabel: Record<VoiceState, string> = { idle: "Tap the orb to talk", listening: "Listening", transcribing: "Thinking", thinking: "Thinking", speaking: "Speaking" } as Record<VoiceState, string>;
  const working = busy || (voiceMode && (voice.state === "thinking" || voice.state === "transcribing"));
  const lastQuestion = [...messages].reverse().find(m => m.role === "user")?.content ?? "";
  const roles = review ? ["Procurement Analyst" as const] : salesDraft ? ["Revenue Manager" as const] : teamRoles(lastQuestion, pathname);
  const context = working && roles.length
    ? `${roles.join(" & ")} · ${voice.stepLabel && voiceMode ? voice.stepLabel : ROLE_ACTIVITY[roles[0]]}`
    : working ? "Working on it" : moduleLabel(pathname);
  const enterVoice = () => { if (performance.now() - openedAt.current < 450) return; dictation.cancel(); setError(""); voice.start(); setVoiceMode(true); };
  const exitVoice = () => { voice.end(); abort.current?.abort(); setVoiceMode(false); };

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

  // Server-approved navigation handoff: open the real scanner, optionally with files.
  const queryClient = useQueryClient();
  const runScannerAction = (action: { mode: "open" | "scan"; venue: string | null; files: string[] }, turnFiles: BaniAttachment[]) => {
    const say = (content: string) => setMessages(prev => [...prev, { role: "assistant" as const, content }]);
    if (!canAccessPage("invoices")) {
      say("You don't have access to Procurement, so I can't open Scan Invoice. Ask an admin to grant you access.");
      return;
    }
    let handoffFiles: File[] = [];
    if (action.mode === "scan") {
      const pool = turnFiles.length ? turnFiles : lastFilesRef.current;
      if (!pool.length) { say("I couldn't find the invoice file — please attach it again and I'll scan it."); return; }
      if (action.files.length) {
        // Exact names only — never fall back to whatever happens to be attached.
        const wanted = action.files.map(n => pool.find(f => f.name === n)).filter((f): f is BaniAttachment => Boolean(f));
        if (!wanted.length) { say(`I couldn't find ${action.files.join(", ")} in our recent attachments — please re-attach the file you want scanned.`); return; }
        handoffFiles = wanted.map(f => f.file);
      } else if (pool.length === 1) {
        handoffFiles = [pool[0].file];
      } else {
        say(`Which file should I scan: ${pool.map(f => f.name).join(", ")}? You can also say "all".`);
        return;
      }
    }
    requestScannerHandoff({ id: crypto.randomUUID(), mode: action.mode, files: handoffFiles, venue: action.venue, scope: identity });
    navigate("/procurement/invoices");
  };

  // Sales receipts go to Sales Data → Scan Receipt, never to procurement.
  const runSalesAction = (action: { files: string[] }, turnFiles: BaniAttachment[]) => {
    const say = (content: string) => setMessages(prev => [...prev, { role: "assistant" as const, content }]);
    if (!canAccessPage("revenue")) { say("You don't have access to Sales Data, so I can't open Scan Receipt. Ask an admin to grant you access."); return; }
    const pool = turnFiles.length ? turnFiles : lastFilesRef.current;
    if (!pool.length) { say("I couldn't find the receipt — please attach it again."); return; }
    const named = action.files.map(n => pool.find(f => f.name === n)).filter((f): f is BaniAttachment => Boolean(f));
    const pick = named.length === 1 ? named[0] : !action.files.length && pool.length === 1 ? pool[0] : null;
    if (!pick) { say(`Scan Receipt takes one receipt at a time. Which one first: ${pool.map(f => f.name).join(", ")}?`); return; }
    requestSalesHandoff({ id: crypto.randomUUID(), file: pick.file, scope: identity });
    navigate("/sales-data?view=daily");
  };

  // Confirm/cancel an action card Bani proposed. The server re-validates and executes.
  const confirmCard = async (index: number, card: BaniActionCard, decision: "confirm" | "cancel") => {
    if (!session || !tenantId) return;
    const setOutcome = (text: string) => setMessages(prev => prev.map((m, i) => i === index ? { ...m, outcome: text } : m));
    setOutcome(decision === "confirm" ? "Working on it…" : "Cancelled");
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-assistant`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, action_id: card.id, decision }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) { setOutcome(body.error || "That didn't go through — ask Bani again."); return; }
      setOutcome(body.message || (decision === "confirm" ? "Done" : "Cancelled"));
      if (body.closures_changed) { queryClient.invalidateQueries({ queryKey: ["venue-closures"] }); queryClient.invalidateQueries({ queryKey: ["yourteam"] }); }
      if (decision === "confirm" && typeof body.navigate === "string") navigate(body.navigate);
    } catch {
      setOutcome("That didn't go through — ask Bani again.");
    }
  };

  const send = async (turn?: { text: string; opts: VoiceOpts; hidden?: boolean }) => {
    const typed = turn ? turn.text.trim() : draft.trim();
    const attached = filesRef.current;
    if ((!typed && !attached.length) || !session || !tenantId || (busy && !turn)) {
      if (turn) throw new Error("Bani is not ready yet. Try again in a moment.");
      return;
    }
    const text = typed || FILES_ONLY_PROMPT;
    const requestIdentity = identity;
    abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    if (turn) voice.trackRequest(controller);
    // File names stay in the conversational context so a follow-up ("add it in
    // procurement") can refer to an earlier turn's attachments.
    const withNames = (role: "user" | "assistant", content: string, names?: string[]) =>
      ({ role, content: names?.length ? `${content}\n[Attached files: ${names.join(", ")}]` : content });
    const history = recentBaniTurns([...messages.map(m => withNames(m.role, m.outcome ? `${m.content}\n[Actual action outcome: ${m.outcome}]` : m.content, m.files)), withNames("user" as const, text, attached.map(f => f.name))]);
    if (!turn?.hidden) setMessages(prev => [...prev, { role: "user", content: typed, files: attached.map(f => f.name) }]);
    if (attached.length) setLastFiles(attached);
    if (!turn) setDraft(""); setFiles([]);
    setBusy(true); setError(""); setStepLabel("");
    const restore = () => { setDraft(d => d || typed); setFiles(f => f.length ? f : attached); setMessages(prev => prev.slice(0, -1)); };
    try {
      const attachments = attached.length ? await Promise.all(attached.map(async f => {
        const prepared = f.type.startsWith("image/") ? await compressImageFile(f.file) : f.file;
        return { name: f.name, type: prepared.type || f.type, data: await toBase64(prepared, controller.signal) };
      })) : undefined;
      if (controller.signal.aborted) return;
      const sales = salesRef.current;
      if (sales && !attachments && !turn) {
        const base = sales.record;
        setStepLabel("Checking the receipt");
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-assistant`, {
          method: "POST", signal: controller.signal,
          headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ tenant_id: tenantId, messages: history, sales_review: { record: base, note: sales.note ?? "" } }),
        });
        const body = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(body.error || "Bani could not review this receipt.");
        if (controller.signal.aborted || liveIdentity.current !== requestIdentity) return;
        const answer = String(body.answer || "").trim();
        if (!answer) throw new Error("No answer received. Please try again.");
        const changes = sanitizeSalesChanges(body.changes, sales.venues);
        setMessages(prev => [...prev, { role: "assistant", content: answer, ...(changes?.length ? { salesChanges: changes, salesBase: base, target: "Scan Receipt" } : {}) }]);
        return;
      }
      const reviewBody = review && !turn ? { draft_review: { binding: review.binding, draftId: review.draftId, lineId: review.lineId, supplierId: review.supplierId, header: review.header, line: review.line, issues: review.issues, candidateIds: review.candidateIds } } : { floating: true };
      // Current concrete venue as untrusted UI context — the server validates it
      // against tenant venues and the user's explicit text always wins.
      const pageVenue = page && page.path === pathname && page.detail && page.detail !== "All venues" ? page.detail : null;
      const contextVenue = pageVenue ?? (venueScope.selectedNames.length === 1 && !venueScope.isAll ? venueScope.selectedNames[0] : null);
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-assistant`, {
        method: "POST", signal: controller.signal,
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, messages: history, ...reviewBody, ...(contextVenue ? { active_venue: contextVenue } : {}), ...(attachments ? { attachments } : {}), ...(turn ? { voice: true, voice_language: turn.opts.voiceLanguage || "en" } : {}) }),
      });
      if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e.error || e.message || "Bani is unavailable. Try again later."); }
      const reader = response.body?.getReader(); if (!reader) throw new Error("No reply received.");
      const decoder = new TextDecoder(); let buffer = "", content = ""; let proposal: DraftProposal | undefined;
      let action: { mode: "open" | "scan"; venue: string | null; files: string[] } | null = null;
      let salesAction: { files: string[] } | null = null;
      let actionCard: BaniActionCard | null = null;
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
          const event = JSON.parse(line.slice(6));
          if (event.error) throw new Error(typeof event.error === "string" ? event.error : event.error.message || "Bani could not reply.");
          if (event.status && typeof event.status.label === "string") { setStepLabel(event.status.label); turn?.opts.onStatus?.(event.status.label); }
          if (event.speak && typeof event.speak.text === "string") turn?.opts.onSpeak?.(event.speak as SpeakEvent);
          content += event.choices?.[0]?.delta?.content || "";
          if (event.review) { content = event.review.answer; proposal = event.review.proposal || undefined; }
          if (event.action?.type === "closures_changed") { queryClient.invalidateQueries({ queryKey: ["venue-closures"] }); queryClient.invalidateQueries({ queryKey: ["yourteam"] }); }
          if (event.action?.type === "action_card" && typeof event.action.action_id === "string") actionCard = { id: event.action.action_id, kind: event.action.kind, title: String(event.action.title ?? ""), detail: typeof event.action.detail === "string" ? event.action.detail : null };
          if (event.action?.type === "open_sales_scanner") salesAction = { files: Array.isArray(event.action.files) ? event.action.files.filter((n: unknown) => typeof n === "string") : [] };
          if (event.action?.type === "open_invoice_scanner") action = { mode: event.action.mode === "scan" ? "scan" : "open", venue: typeof event.action.venue === "string" ? event.action.venue : null, files: Array.isArray(event.action.files) ? event.action.files : [] };
        }
      }
      if (!controller.signal.aborted && liveIdentity.current === requestIdentity) {
        if (!content.trim()) throw new Error("No answer received. Please try again.");
        revoke(attached);
        setMessages(prev => [...prev, { role: "assistant", content, proposal, before: proposal ? review?.before(proposal) : undefined, target: review ? review.label : undefined, ...(actionCard ? { actionCard } : {}) }]);
        if (action) runScannerAction(action, attached);
        else if (salesAction) runSalesAction(salesAction, attached);
      }
    } catch (e) {
      if (turn) { if (!controller.signal.aborted && !turn.hidden) setMessages(prev => prev.slice(0, -1)); throw e; }
      if (!controller.signal.aborted && liveIdentity.current === requestIdentity) { restore(); setError(e instanceof Error ? e.message : "Bani could not reply."); }
    } finally { if (abort.current === controller) { setBusy(false); abort.current = null; } }
  };

  sendRef.current = send;

  // Sphere: tap opens; moving past the slop drags it immediately (direct DOM, no React per frame).
  // Release springs to the nearest side edge with carried velocity; near the × it is pulled in.
  const dismissCentre = () => ({ x: window.innerWidth / 2, y: window.innerHeight - 72 });
  const place = (p: Point, scale = 1) => { const el = sphereEl.current; if (!el) return; el.style.left = `${p.x}px`; el.style.top = `${p.y}px`; el.style.right = "auto"; el.style.bottom = "auto"; el.style.transform = `scale(${scale})`; };
  const resetGesture = () => { const g = gesture.current; if (g) clearTimeout(g.timer); gesture.current = null; setHolding(false); setOverX(false); setDrag(null); };
  const springTo = (from: Point, v: Point, to: Point, done: () => void, endScale = 1) => {
    cancelAnimationFrame(springRaf.current);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { place(to, endScale); done(); return; }
    let x = from.x, y = from.y, vx = v.x, vy = v.y, s = 1, last = performance.now();
    const k = 260, c = 22; // slightly under-damped: a soft elastic settle
    const tick = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000); last = now;
      vx += (k * (to.x - x) - c * vx) * dt; vy += (k * (to.y - y) - c * vy) * dt;
      x += vx * dt; y += vy * dt; s += (endScale - s) * Math.min(1, dt * 14);
      if (Math.hypot(to.x - x, to.y - y) < 0.5 && Math.hypot(vx, vy) < 10 && Math.abs(endScale - s) < 0.02) { place(to, endScale); done(); return; }
      place({ x, y }, s); springRaf.current = requestAnimationFrame(tick);
    };
    springRaf.current = requestAnimationFrame(tick);
  };
  const onSphereDown = (e: RPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || !sphereEl.current) return;
    cancelAnimationFrame(springRaf.current);
    const r = sphereEl.current.getBoundingClientRect();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* unsupported */ }
    const start = { x: r.left, y: r.top };
    gesture.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, t: performance.now(), held: false, moved: 0, last: start, over: false, timer: 0 };
    vel.current = { x: 0, y: 0, t: e.timeStamp, px: e.clientX, py: e.clientY };
  };
  const onSphereMove = (e: RPointerEvent<HTMLButtonElement>) => {
    const g = gesture.current; if (!g || g.id !== e.pointerId) return;
    g.moved = Math.max(g.moved, Math.hypot(e.clientX - g.sx, e.clientY - g.sy));
    if (!g.held) { if (g.moved < 8) return; g.held = true; setHolding(true); setDrag(g.last); }
    const dt = Math.max(1, e.timeStamp - vel.current.t);
    vel.current = { x: 0.6 * vel.current.x + 0.4 * ((e.clientX - vel.current.px) * 1000 / dt), y: 0.6 * vel.current.y + 0.4 * ((e.clientY - vel.current.py) * 1000 / dt), t: e.timeStamp, px: e.clientX, py: e.clientY };
    let p = clampPoint({ x: e.clientX - g.ox, y: e.clientY - g.oy }, SPHERE, window.innerWidth, window.innerHeight);
    const c = dismissCentre(); const target = { x: c.x - SPHERE / 2, y: c.y - SPHERE / 2 };
    const d = Math.hypot(p.x - target.x, p.y - target.y);
    if (d < 90) { const pull = 1 - d / 90; p = { x: p.x + (target.x - p.x) * pull * 0.7, y: p.y + (target.y - p.y) * pull * 0.7 }; }
    g.last = p; const over = overDismiss(p, SPHERE, c.x, c.y) || d < 40;
    place(p, over ? 0.92 : 1.08);
    if (over !== g.over) { g.over = over; setOverX(over); }
  };
  const onSphereUp = (e: RPointerEvent<HTMLButtonElement>, cancelled = false) => {
    const g = gesture.current; if (!g || g.id !== e.pointerId) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (!cancelled && g.held) {
      const w = window.innerWidth, h = window.innerHeight; const v = { x: vel.current.x, y: vel.current.y };
      if (g.over) {
        const c = dismissCentre(); gesture.current = null; setOverX(true);
        springTo(g.last, { x: 0, y: 0 }, { x: c.x - SPHERE / 2, y: c.y - SPHERE / 2 }, () => { resetGesture(); setHidden(true); setOpen(false); }, 0.01);
        return;
      }
      const projX = g.last.x + SPHERE / 2 + v.x * 0.18;
      const to = clampPoint({ x: projX < w / 2 ? 0 : w, y: g.last.y + v.y * 0.18 }, SPHERE, w, h);
      gesture.current = null; setHolding(false); setOverX(false);
      springTo(g.last, v, to, () => { setSphere(to); setDrag(null); });
      return;
    }
    if (!cancelled && isTap(g.moved, performance.now() - g.t, HOLD_MS)) setOpen(true);
    resetGesture();
  };
  // Desktop: panel moves by its header. Mobile: swipe the header down to close (springs back otherwise).
  const onHeaderDown = (e: RPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button,a,input,textarea") || !panelEl.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (isMobile) { sheet.current = { id: e.pointerId, sy: e.clientY, dy: 0, t: performance.now() }; panelEl.current.style.transition = "none"; return; }
    const r = panelEl.current.getBoundingClientRect();
    panelDrag.current = { id: e.pointerId, ox: e.clientX - r.left, oy: e.clientY - r.top };
  };
  const onHeaderMove = (e: RPointerEvent<HTMLElement>) => {
    const s = sheet.current;
    if (s && s.id === e.pointerId && panelEl.current) {
      const raw = e.clientY - s.sy; s.dy = raw > 0 ? raw : raw / 6; // rubber-band upward
      panelEl.current.style.transform = `translateY(${s.dy}px)`;
      return;
    }
    const d = panelDrag.current; if (!d || d.id !== e.pointerId || !panelEl.current) return;
    const el = panelEl.current;
    setPanelPos(clampPoint({ x: e.clientX - d.ox, y: e.clientY - d.oy }, 0, window.innerWidth - el.offsetWidth, window.innerHeight - el.offsetHeight, 8));
  };
  const onHeaderUp = (e: RPointerEvent<HTMLElement>) => {
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* released */ }
    const s = sheet.current;
    if (s && s.id === e.pointerId && panelEl.current) {
      sheet.current = null; const el = panelEl.current;
      const v = s.dy / Math.max(1, performance.now() - s.t);
      const close = s.dy > 90 || (s.dy > 30 && v > 0.6);
      el.style.transition = close ? "transform 200ms ease-in, opacity 200ms ease-in" : "transform 320ms cubic-bezier(.34,1.56,.64,1)";
      el.style.transform = close ? `translateY(${el.offsetHeight + 40}px)` : "translateY(0)";
      if (close) { el.style.opacity = "0"; window.setTimeout(() => { dictation.cancel(); setOpen(false); }, 190); }
      return;
    }
    if (panelDrag.current?.id === e.pointerId) panelDrag.current = null;
  };

  const onDrag = (e: DragEvent) => { if (!Array.from(e.dataTransfer.types).includes("Files")) return; e.preventDefault(); setDropping(e.type !== "dragleave"); };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDropping(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); };

  const sphereStyle = drag ? { left: drag.x, top: drag.y } : sphere ? { left: sphere.x, top: sphere.y } : undefined;
  const mobileH = Math.min(540, vv.h - 16);
  // Mobile: size and place inside the visible viewport so the keyboard can never push the header off-screen.
  const panelStyle = isMobile ? { height: mobileH, maxHeight: mobileH, top: Math.max(8, vv.top + vv.h - 8 - mobileH), bottom: "auto" } : panelPos ? { left: panelPos.x, top: panelPos.y, right: "auto", bottom: "auto" } : undefined;
  const restore = <button type="button" className="floating-bani-restore" aria-label="Show Bani assistant" title="Show Bani" onClick={() => { setHidden(false); setOpen(true); }}><BaniOrb size={24} mode="idle" /></button>;
  const restoreSlot = !hosted ? document.getElementById("floating-bani-restore") : null;

  const surface = <div className={`floating-bani ${hosted ? "floating-bani-hosted" : ""}`}>
    {hidden ? (restoreSlot ? createPortal(restore, restoreSlot) : <div className="floating-bani-restore-fixed">{restore}</div>) : open ? (
      <section ref={panelEl} className={`floating-bani-panel ${isMobile ? "is-mobile" : ""}`} style={panelStyle} role="dialog" aria-modal="false" aria-label="Bani assistant" onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}>
        <header className="floating-bani-header" onPointerDown={onHeaderDown} onPointerMove={onHeaderMove} onPointerUp={onHeaderUp} onPointerCancel={onHeaderUp}>
          <BaniOrb size={36} mode={working ? "thinking" : "idle"} />
          <div className="min-w-0 flex-1"><div className="floating-bani-title">Bani Finance Team</div><div className="floating-bani-context" title={context}>{context}</div></div>
          <button type="button" className="floating-bani-icon" aria-label="Close Bani" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
        </header>
        <div className="floating-bani-transcript" aria-live="polite" onTouchMove={() => { if (document.activeElement === input.current) input.current?.blur(); }}>
          {messages.map((message, index) => <div key={index} className={message.role === "user" ? "floating-bani-user" : "floating-bani-answer"}>
            {message.content && <div className="floating-bani-prose"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown></div>}
            {!!message.files?.length && <div className="floating-bani-sent-files">{message.files.map(name => <span key={name} className="floating-bani-file-chip"><FileText className="h-4 w-4" />{name}</span>)}</div>}
            {message.salesChanges && message.salesBase && (() => {
              const base = message.salesBase; const preview = applySalesChanges(base, message.salesChanges);
              const stale = !salesDraft || JSON.stringify(salesDraft.record) !== JSON.stringify(base);
              return <div className="floating-bani-change">
                <p className="floating-bani-change-target">{message.target}</p>
                {message.salesChanges.map((c, i) => c.field === "note" ? <p key={i} className="floating-bani-change-value">Note: {String(c.value)}</p> : <p key={i} className="floating-bani-change-value td-num">{SALES_LABELS[c.field] ?? c.field}: {showSales(c.field, base[c.field as keyof typeof base])} → {showSales(c.field, preview[c.field as keyof typeof preview])}</p>)}
                {message.outcome ? <p className="floating-bani-change-reason" role="status">{message.outcome}</p> : <div className="mt-2 flex gap-2">
                  <button type="button" className="floating-bani-apply" disabled={stale} onClick={() => {
                    const live = salesRef.current;
                    const ok = Boolean(live && JSON.stringify(live.record) === JSON.stringify(base));
                    if (ok && live) {
                      live.apply(applySalesChanges(live.record, message.salesChanges!));
                      const note = message.salesChanges!.find((c) => c.field === "note");
                      if (note) live.applyNote?.(String(note.value));
                    }
                    setMessages(prev => prev.map((m, i) => i === index ? { ...m, outcome: ok ? "Applied to receipt — not saved" : "Receipt changed — ask Bani again" } : m));
                  }}>Apply</button>
                  <button type="button" className="floating-bani-dismiss" onClick={() => setMessages(prev => prev.map((m, i) => i === index ? { ...m, outcome: "Dismissed" } : m))}>Dismiss</button>
                </div>}
                {!message.outcome && stale && <p className="floating-bani-change-reason">Receipt changed — ask Bani again</p>}
              </div>;
            })()}
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
            {message.actionCard && <div className="floating-bani-change">
              <p className="floating-bani-change-target">{message.actionCard.title}</p>
              {message.actionCard.detail && <p className="floating-bani-change-reason">{message.actionCard.detail}</p>}
              {message.outcome ? <p className="floating-bani-change-reason" role="status">{message.outcome}</p> : <div className="mt-2 flex gap-2">
                <button type="button" className="floating-bani-apply" onClick={() => void confirmCard(index, message.actionCard!, "confirm")}>Confirm</button>
                <button type="button" className="floating-bani-dismiss" onClick={() => void confirmCard(index, message.actionCard!, "cancel")}>Cancel</button>
              </div>}
            </div>}
          </div>)}
          {busy && (stepLabel
            ? <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground" role="status" aria-live="polite"><span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />{stepLabel.replace(/[.…]+$/, "")}…</div>
            : <div className="floating-bani-typing" aria-label="Bani is replying"><span /><span /><span /></div>)}
          {error && <p className="floating-bani-error" role="alert">{error}</p>}
          <div ref={end} />
        </div>
        {voiceMode && <div className="floating-bani-voice">
          <button type="button" className="floating-bani-voice-orb" onClick={voice.interrupt}
            aria-label={voice.needsTap ? "Resume voice" : voice.state === "listening" ? "Send voice recording" : "Interrupt and talk"}>
            <BaniOrb size={52} mode={voice.state === "listening" ? "listening" : voice.state === "speaking" ? "speaking" : voice.state === "idle" ? "idle" : "thinking"} getLevel={voice.getLevel} />
          </button>
          <p className="floating-bani-voice-status" role="status">{voice.needsTap ? "Tap the orb to resume audio" : voice.muted && voice.state === "listening" ? "Mic muted" : voiceLabel[voice.state] ?? ""}</p>
          {voice.userWords && <p className="floating-bani-voice-words">{voice.userWords}</p>}
          {voice.notice && voice.notice !== "Tap the orb to talk" && <p className="floating-bani-error" role="alert">{voice.notice}</p>}
        </div>}
        <form className={`floating-bani-composer ${dropping ? "is-dropping" : ""}`} onDragEnter={onDrag} onDragOver={onDrag} onDragLeave={onDrag} onDrop={onDrop} onSubmit={e => { e.preventDefault(); if (!voiceMode) void send(); }}>
          {!!files.length && <div className="floating-bani-attachments">{files.map(f => <div key={f.id} className="floating-bani-attachment">
            {f.url ? <img src={f.url} alt="" /> : <FileText className="h-5 w-5" />}
            <span className="truncate">{f.name}</span>
            <button type="button" aria-label={`Remove ${f.name}`} onClick={() => removeFile(f.id)}><X className="h-3.5 w-3.5" /></button>
          </div>)}</div>}
          {voiceMode ? <div className="floating-bani-voice-row">
            <div className="floating-bani-voice-pill">
              <button type="button" className="floating-bani-plus" aria-label="Attach files" onClick={() => picker.current?.click()}><Plus className="h-5 w-5" /></button>
              <input ref={picker} type="file" hidden multiple accept={ATTACH_TYPES.join(",")} onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
              <textarea ref={input} rows={1} value={draft} maxLength={2000} onChange={e => setDraft(e.target.value)} placeholder="Ask Bani…" aria-label="Type to Bani during voice" className="floating-bani-input"
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (draft.trim() && voice.sendTyped(draft)) setDraft(""); } }} />
              {draft.trim() && <button type="button" className="floating-bani-send" aria-label="Send to Bani" onClick={() => { if (voice.sendTyped(draft)) setDraft(""); }}><ArrowUp className="h-5 w-5" /></button>}
            </div>
            <button type="button" className="floating-bani-voice-mute" aria-label={voice.muted ? "Unmute microphone" : "Mute microphone"} aria-pressed={voice.muted} onClick={voice.toggleMute}>{voice.muted ? <MicOff className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}</button>
            <button type="button" className="floating-bani-voice-end" aria-label="End voice conversation" onClick={exitVoice}><X className="h-[18px] w-[18px]" /></button>
          </div> : dictation.active ? <div className="floating-bani-row">
            <button type="button" className="floating-bani-plus" aria-label="Cancel dictation" onClick={() => dictation.cancel()}><X className="h-5 w-5" /></button>
            <div className="flex min-h-[40px] flex-1 items-center px-1">
              {dictation.state === "transcribing" ? <span className="text-sm" style={{ color: "var(--fb-muted)" }}>Transcribing…</span> : <LiveWaveform getLevel={dictation.getLevel} color="#A9C2A0" className="h-7 w-full" />}
            </div>
            <button type="button" className="floating-bani-send" aria-label="Finish dictation" disabled={dictation.state !== "recording"} onClick={async () => { const t = await dictation.confirm(); if (t) setDraft(d => joinDraft(d, t)); input.current?.focus(); }}><Check className="h-5 w-5" /></button>
          </div> : <div className="floating-bani-row">
            <button type="button" className="floating-bani-plus" aria-label="Attach files" disabled={busy} onClick={() => picker.current?.click()}><Plus className="h-5 w-5" /></button>
            <input ref={picker} type="file" hidden multiple accept={ATTACH_TYPES.join(",")} onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
            <textarea ref={input} rows={1} value={draft} maxLength={2000} onChange={e => setDraft(e.target.value)} placeholder="Ask Bani…" aria-label="Ask floating Bani" className="floating-bani-input" onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !isMobile) { e.preventDefault(); void send(); } }} />
            {dictation.supported && <button type="button" className="floating-bani-mic" aria-label="Start dictation" disabled={busy} onClick={() => dictation.start()}><Mic className="h-[18px] w-[18px]" /></button>}
            {!busy && !draft.trim() && !files.length
              ? <button type="button" className="floating-bani-send" aria-label="Start voice conversation" onClick={enterVoice}><AudioLines className="h-5 w-5" /></button>
              : <button type="submit" className="floating-bani-send" disabled={busy || (!draft.trim() && !files.length)} aria-label="Send to Bani"><ArrowUp className="h-5 w-5" /></button>}
          </div>}
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
