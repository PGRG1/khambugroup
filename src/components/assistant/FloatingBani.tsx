import { useEffect, useRef, useState, type DragEvent, type PointerEvent as RPointerEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, X, Plus, FileText, Mic, MicOff, Check, AudioLines, House, PanelLeft } from "lucide-react";
import { chatLast, chatTitle, loadChats, renameChat, saveChats, upsertChat } from "@/utils/baniChats";
import { BaniChatList, useSavedChats } from "./BaniChatsDialog";
import { useVoiceConversation, type SpeakEvent, type VoiceState } from "@/hooks/useVoiceConversation";
import { useDictation, joinDraft } from "@/hooks/useDictation";
import { LiveWaveform } from "@/components/assistant/LiveWaveform";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { AssistantChart, type ChartSpec } from "./AssistantChart";
import remarkGfm from "remark-gfm";
import { remarkFinancialTables } from "./remarkFinancialTables";
import { CalcBreakdown, FinancialTable, StatChips, SummaryRow, VarianceCell } from "./BaniRichBlocks";
import { recentBaniTurns } from "../../../supabase/functions/_shared/baniConversation";
import { BaniOrb } from "@/components/assistant/BaniOrb";
import { useAuth } from "@/hooks/useAuth";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { usePreviewMode } from "@/hooks/usePreviewMode";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { compressImageFile } from "@/utils/imageCompression";
import type { DraftProposal } from "@/utils/floatingDraft";
import { ATTACH_TYPES, attachmentError, clampPoint, moduleLabel } from "@/utils/floatingBaniUi";
import { clearSalesHandoff, clearScannerHandoff, requestSalesHandoff, requestScannerHandoff } from "@/utils/scannerHandoff";
import { applySalesChanges, sanitizeSalesChanges } from "@/utils/salesReceiptCorrections";
import { fmtHK } from "@/components/expenses/shared";
import { useVenueScope } from "@/hooks/useVenueScope";
import { useFloatingBaniStore, type BaniActionCard, type BaniAttachment, type BaniMessage } from "./FloatingBaniContext";
import { PeopleActionCard } from "./PeopleActionCard";
import { GuardedOperationCard } from "./GuardedOperationCard";
import { navigationPath, internalNavigation, SCREENS } from "../../../supabase/functions/chat-assistant/navigationRules";
import { Button } from "@/components/ui/button";
import { useBaniPending, type PendingItem } from "@/hooks/useBaniPending";
import { invokeAlertCheck } from "@/utils/invokeAlertCheck";
import { useSmartAlerts } from "@/hooks/useSmartAlerts";
import { useBaniTeamMessages } from "@/hooks/useBaniTeamMessages";
import { stageBaniStatements } from "@/utils/baniStatementHandoff";
import { supabase } from "@/integrations/supabase/client";
import { groupedPending } from "../../../supabase/functions/_shared/smartAlerts/followUp";

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
const SPHERE = 44;
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

function useHomeSlot(active: boolean) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!active) { setEl(null); return; }
    const find = () => setEl(document.getElementById("bani-home-slot"));
    find();
    const mo = new MutationObserver(find); mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [active]);
  return el;
}

export function FloatingBani({ review, openSignal = 0, hosted = false }: { review?: FloatingReview; openSignal?: number; hosted?: boolean }) {
  const store = useFloatingBaniStore();
  const venueScope = useVenueScope();
  const { user, session, isAdmin, loading: authLoading, roleLoading } = useAuth();
  const { tenantId, loading: tenantLoading } = useActiveTenant();
  const { isPreviewActive, previewUserId } = usePreviewMode();
  const { pathname, search: locationSearch } = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const effectiveId = isAdmin && isPreviewActive ? previewUserId : user?.id;
  const { canAccessPage, loading: permissionsLoading } = useUserPermissions(effectiveId || undefined);
  const [busy, setBusy] = useState(false);
  const [stepLabel, setStepLabel] = useState("");
  const [error, setError] = useState("");
  const [dropping, setDropping] = useState(false);
  const [vv, setVv] = useState({ top: 0, h: typeof window !== "undefined" ? window.innerHeight : 800 });
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const panelDrag = useRef<{ id: number; ox: number; oy: number } | null>(null);
  const panelEl = useRef<HTMLElement>(null);
  const sheet = useRef<{ id: number; sy: number; dy: number; t: number } | null>(null);
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
  const [chatId, setChatId] = store?.chatId ?? [null, () => {}];
  const openChats = () => store?.chatsOpen[1](true);
  // Chat history beside a Home conversation (desktop): open or hidden, remembered in this browser.
  const [paneOpen, setPaneOpen] = useState(() => { try { return localStorage.getItem("bani-chat-pane") !== "hidden"; } catch { return true; } });
  const togglePane = () => setPaneOpen((v) => { try { localStorage.setItem("bani-chat-pane", v ? "hidden" : "open"); } catch { /* not remembered */ } return !v; });
  const [renaming, setRenaming] = useState<string | null>(null);
  const [panelPos, setPanelPos] = store?.panel ?? [null, () => {}];
  const page = store?.page[0] ?? null;
  const host = store?.host ?? null;
  const salesDraft = review ? null : store?.sales[0] ?? null;
  const salesRef = useRef(salesDraft); salesRef.current = salesDraft;

  // Confidential content resets only when the user, client or preview identity changes.
  const identity = `${user?.id}:${tenantId}:${isPreviewActive}:${previewUserId}`;
  const allowedNow = Boolean(store && user && tenantId && !authLoading && !roleLoading && !tenantLoading && !permissionsLoading && canAccessPage("assistant") && !isPreviewActive && pathname !== "/assistant" && !pathname.startsWith("/platform") && pathname !== "/auth");
  // Once shown for this person, a background re-check (token refresh, role reload) must not make the chat bar blink out.
  const shownFor = useRef<string | null>(null);
  if (allowedNow) shownFor.current = identity;
  const rechecking = authLoading || roleLoading || tenantLoading || permissionsLoading;
  const allowed = allowedNow || (rechecking && shownFor.current === identity && !isPreviewActive && pathname !== "/assistant" && !pathname.startsWith("/platform") && pathname !== "/auth");
  const liveIdentity = useRef(identity); liveIdentity.current = identity;
  const binding = review?.binding;
  const filesRef = useRef(files); filesRef.current = files;
  const lastFilesRef = useRef(lastFiles); lastFilesRef.current = lastFiles;

  useEffect(() => {
    // Signed out: forget the conversation. Still loading: wait, so a refresh doesn't wipe a kept conversation.
    if (store && !authLoading && !user && messages.length) { setMessages([]); setScope(""); return; }
    if (!store || !user || !tenantId || authLoading || tenantLoading || scope === identity) return;
    abort.current?.abort(); revoke(filesRef.current); revoke(lastFilesRef.current); clearScannerHandoff(); clearSalesHandoff();
    voiceEndRef.current(); setVoiceMode(false);
    setMessages([]); setChatId(null); setDraft(""); setFiles([]); setLastFiles([]); setOpen(false); setError(""); setBusy(false); setScope(identity);
  }, [identity, scope, store, user, tenantId, authLoading, tenantLoading, messages.length, setMessages, setChatId, setDraft, setFiles, setLastFiles, setOpen, setScope]);
  // Every conversation is saved to "Your chats" (this browser, this person and restaurant) as it goes.
  useEffect(() => {
    if (hosted || busy || !store || !user || !tenantId || scope !== identity || !messages.some((m) => !m.hidden)) return;
    const id = chatId ?? crypto.randomUUID();
    if (!chatId) setChatId(id);
    const keep = messages.map(({ role, content, replies, teamMessageId, eventId, files, outcome, actionOutcome, charts, hidden, target, before }) =>
      ({ role, content, replies, teamMessageId, eventId, files, outcome, actionOutcome, charts, hidden, target, before }));
    const list = loadChats(scope);
    const was = list.find((c) => c.id === id);
    if (was && JSON.stringify(was.messages) === JSON.stringify(keep)) return; // just reopened, nothing new: keep its place in the list
    saveChats(scope, upsertChat(list, { id, title: chatTitle(keep), last: chatLast(keep), updated: Date.now(), messages: keep }));
  }, [messages, busy, chatId, scope, identity, hosted, store, user, tenantId, setChatId]);
  // Switching to another chat (or a new one) stops anything still running in the old one.
  const shownChat = useRef(chatId);
  useEffect(() => { if (shownChat.current === chatId) return; shownChat.current = chatId; abort.current?.abort(); setBusy(false); setError(""); }, [chatId]);
  const newChat = () => { abort.current?.abort(); setMessages([]); setChatId(null); setDraft(""); setError(""); setBusy(false); };
  useEffect(() => { abort.current?.abort(); }, [binding]);
  useEffect(() => () => { abort.current?.abort(); }, []);
  useEffect(() => { if (openSignal) setOpen(true); }, [openSignal, setOpen]);
  useEffect(() => { if (open && !isMobile && window.matchMedia?.("(pointer: fine)").matches) input.current?.focus(); }, [open, isMobile]);
  useEffect(() => { const s = end.current?.parentElement; if (s) s.scrollTop = s.scrollHeight; }, [messages, busy, open]);
  useEffect(() => {
    const v = window.visualViewport;
    const update = () => {
      setVv({ top: v?.offsetTop ?? 0, h: v?.height ?? window.innerHeight });
      const w = window.innerWidth, h = window.innerHeight;
      setPanelPos(p => p && panelEl.current ? clampPoint(p, 0, w - panelEl.current.offsetWidth, h - panelEl.current.offsetHeight, 8) : p);
    };
    update();
    v?.addEventListener("resize", update); v?.addEventListener("scroll", update); window.addEventListener("resize", update);
    return () => { v?.removeEventListener("resize", update); v?.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [setPanelPos]);

  const openedAt = useRef(0);
  useEffect(() => { if (open) openedAt.current = performance.now(); if (!open) { voiceEndRef.current(); setVoiceMode(false); } }, [open]);
  useEffect(() => () => voiceEndRef.current(), []);

  const queryClient = useQueryClient();
  const pending = useBaniPending(allowed && !review && !salesDraft);
  const teamMessages = useBaniTeamMessages(allowed);
  const displayedTeamIds = useRef(new Set<string>());
  const readingTeamIds = useRef(new Set<string>());
  useEffect(() => { displayedTeamIds.current.clear(); readingTeamIds.current.clear(); }, [identity]);
  useEffect(() => {
    if (!allowed || !open || (!hosted && host) || scope !== identity) return;
    const fresh = teamMessages.unread.filter(m => !displayedTeamIds.current.has(m.id));
    if (!fresh.length) return;
    fresh.forEach(m => displayedTeamIds.current.add(m.id));
    setMessages(prev => [...prev, ...fresh.filter(m => !prev.some(shown => shown.teamMessageId === m.id)).map(m => ({ role: 'assistant' as const, teamMessageId: m.id,
      content: `From ${m.sender_name}: ${m.title}\n\n${m.body}` }))]);
  }, [allowed, open, hosted, host, scope, identity, teamMessages.unread, setMessages]);
  useEffect(() => {
    if (!allowed || !open || (!hosted && host) || scope !== identity) return;
    const visible = new Set(messages.map(m => m.teamMessageId));
    const ids = teamMessages.unread.filter(m => visible.has(m.id) && !readingTeamIds.current.has(m.id)).map(m => m.id);
    if (!ids.length) return;
    ids.forEach(id => readingTeamIds.current.add(id));
    void teamMessages.markRead(ids).catch(() => { ids.forEach(id => readingTeamIds.current.delete(id)); });
  }, [allowed, open, hosted, host, scope, identity, messages, teamMessages.unread, teamMessages.markRead]);
  const alerts = useSmartAlerts();
  const [activeItem,setActiveItem] = useState<PendingItem|null>(null);
  const [workStart,setWorkStart] = useState<number|null>(null);
  const [finished,setFinished] = useState<string[]>([]);
  const pendingItems = pending.items.filter(a=>!finished.includes(a.kind+'|'+a.subject));
  const nextWork = (items= pendingItems) => { const item=items[0]??null;setActiveItem(item);setMessages(prev=>[...prev,{role:'assistant',content:item?`${item.title}. ${item.why}${item.payload.because?.length?' Because of this: '+item.payload.because.join(' · ')+'.':''} ${item.payload.question?'Please tell me yes, no, or not sure.':'Tell me what you would like to do, or say done once you have checked it.'}`:'That is everything pending in your scope.',eventId:item?(item.id??item.kind+'|'+item.subject):undefined}]); };
  const openWork = () => {setWorkStart(pendingItems.length);if(!activeItem)nextWork();setOpen(true);};
  const completeWork = async (item:PendingItem,decision:string) => { const {data,error}=await invokeAlertCheck({tenant_id:tenantId,work_action:{kind:item.kind,subject:item.subject,decision}});if(error)throw error;if(data.error)throw new Error(data.error);};
  const dismissEvent = async (id:string) => {try{const item=pendingItems.find(a=>a.id===id||a.kind+'|'+a.subject===id);if(item)await completeWork(item,'done');else await alerts.action(id,'done');if(item){setFinished(prev=>[...prev,item.kind+'|'+item.subject]);nextWork(pendingItems.filter(a=>a!==item));}setMessages(prev=>prev.map(m=>m.eventId===id?{...m,outcome:'Dismissed'}:m));}catch(e){setError(e instanceof Error?e.message:'Could not dismiss');}};
  const pushOpened = useRef('');
  // Home (/) hosts the conversation in the page itself; everywhere else Bani is the small sphere.
  const home = pathname === "/" && !hosted;
  const savedChats = useSavedChats(scope, !hosted && home && open);
  const shownTitle = savedChats.find((c) => c.id === chatId)?.title ?? (messages.some((m) => !m.hidden) ? chatTitle(messages) : "New chat");
  const lastPath = useRef(pathname);
  const keepOpenNav = useRef(false);
  // An ongoing conversation follows the person across screens instead of disappearing.
  const hasConversation = useRef(false);
  hasConversation.current = messages.some(m => !m.hidden);
  // On home the typing box lives inside the page (the slot under the greeting), so it scrolls with it.
  const homeSlot = useHomeSlot(home && !open);
  // Landing on another page (e.g. Bani's "Open Revenue") leaves Bani as the small sphere.
  useEffect(() => { if (hosted || lastPath.current === pathname) return; lastPath.current = pathname; if (keepOpenNav.current) { keepOpenNav.current = false; return; } if (!hasConversation.current) setOpen(false); }, [pathname, hosted, setOpen]);
  useEffect(()=>{const event=new URLSearchParams(locationSearch).get('bani_event');if(!event||!pending.data||pushOpened.current===event)return;pushOpened.current=event;const notification=[...pending.data.notifications,...pending.data.work].find(a=>'smart-'+a.id===event||a.subject===event||'deadline-'+a.kind+'-'+a.subject===event);setMessages(prev=>[...prev,{role:'assistant',content:notification?`${notification.title}. ${notification.why}`:event.startsWith('feed-')?pending.data.feed_health.filter(f=>f.line).map(f=>f.line).join(' ')||'The connection has recovered; the latest recorded data is available.':pending.data.greeting??'There are no recent business events in your permitted scope.'}]);setOpen(true);},[locationSearch,pending.data,setMessages,setOpen]);
  const [asked, setAsked] = store?.ask ?? [null, () => {}];
  useEffect(() => { if (!asked || busy || !session || !tenantId) return; setAsked(null); void sendRef.current?.({ text: asked, opts: { voice: false, voiceLanguage: "" } }); }, [asked, busy, session, tenantId, setAsked]);
  if (!allowed || (!hosted && host)) return null;
  const voiceLabel: Record<VoiceState, string> = { idle: "Listening", listening: "Listening", transcribing: "Thinking", thinking: "Thinking", speaking: "Speaking" } as Record<VoiceState, string>;
  const working = busy || (voiceMode && (voice.state === "thinking" || voice.state === "transcribing"));
  const context = working ? (stepLabel || voice.stepLabel || "Working on it") : `On: ${review ? "Scan Invoice" : salesDraft ? "Scan Receipt" : moduleLabel(pathname)}`;
  const openSphere = () => { if (open) { dictation.cancel(); setOpen(false); } else setOpen(true); };
  const enterVoice = () => { if (home) setOpen(true); else if (performance.now() - openedAt.current < 450) return; dictation.cancel(); setError(""); voice.start(); setVoiceMode(true); };
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
  const confirmCard = async (index: number, card: BaniActionCard, decision: "confirm" | "cancel" | "below_usual" | "undo", confirmation?: string) => {
    if (!session || !tenantId || isPreviewActive) return;
    const identity = liveIdentity.current;
    const setOutcome = (text: string) => setMessages(prev => prev.map((m, i) => i === index ? { ...m, outcome: text } : m));
    setOutcome(decision === "confirm" ? "Working on it…" : "Cancelled");
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-assistant`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, action_id: card.id, decision, confirmation }),
      });
      const body = await resp.json().catch(() => ({}));
      if (liveIdentity.current !== identity) return;
      if (!resp.ok) { setOutcome(body.error || "That didn't go through — ask Bani again."); return; }
      setOutcome(body.message || (decision === "confirm" ? "Done" : "Cancelled"));
      setMessages(prev => prev.map((m,i) => i === index ? {...m, actionOutcome: {message: body.message ?? "", undo_available: body.undo_available === true, link: body.link}} : m));
      if(body.receipts_changed) {queryClient.invalidateQueries({queryKey:["receipt-intakes"]});queryClient.invalidateQueries({queryKey:["bani-pending"]});}
      if(body.bills_changed) {queryClient.invalidateQueries({queryKey:["expense-bills"]});queryClient.invalidateQueries({queryKey:["yourteam"]});queryClient.invalidateQueries({queryKey:["bani-pending"]});}
      if (body.asks_changed) { queryClient.invalidateQueries({queryKey:["alert-settings"]}); queryClient.invalidateQueries({queryKey:["smart-alerts"]}); }
      if (body.closures_changed) { queryClient.invalidateQueries({ queryKey: ["venue-closures"] }); queryClient.invalidateQueries({ queryKey: ["yourteam"] }); }
      if (decision === "confirm" && typeof body.navigate === "string") navigate(body.navigate);
    } catch {
      setOutcome("That didn't go through — ask Bani again.");
    }
  };

  const send = async (turn?: { text: string; opts: VoiceOpts; hidden?: boolean }) => {
    const typed = turn ? turn.text.trim() : draft.trim();
    const attached = filesRef.current;
    if ((!typed && !attached.length) || !session || !tenantId || (busy && !turn?.opts.voice)) {
      if (turn?.opts.voice) throw new Error("Bani is not ready yet. Try again in a moment.");
      return;
    }
    const text = typed || FILES_ONLY_PROMPT;
    if(!attached.length&&/^(show|list)( me)? (everything|all)( that's| that is)? pending\??$/i.test(typed)){setDraft('');setMessages(prev=>[...prev,{role:'user',content:typed},{role:'assistant',content:groupedPending(pendingItems)}]);return;}
    if(activeItem && /^(done|dismiss|skip|checked|yes|no|not sure)$/i.test(typed) && !attached.length){
      setDraft('');setMessages(prev=>[...prev,{role:'user',content:typed}]);
            try{const answer=activeItem.payload.question?({yes:'yes',no:'no','not sure':'unsure'}[typed.toLowerCase()]??'done'):'done';await completeWork(activeItem,answer);const key=activeItem.kind+'|'+activeItem.subject;setFinished(prev=>[...prev,key]);nextWork(pendingItems.filter(a=>a!==activeItem));}catch(e){setError(e instanceof Error?e.message:'Could not update work');}return;
    }
    if(activeItem?.kind==='missing_bank_statement'&&attached.length){stageBaniStatements(`${user?.id}:${tenantId}`,attached.map(a=>a.file));setFiles([]);setOpen(false);navigate('/finance/cash?bani_statements=1');return;}

    const requestIdentity = identity;
    abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    if (turn?.opts.voice) voice.trackRequest(controller);
    // File names stay in the conversational context so a follow-up ("add it in
    // procurement") can refer to an earlier turn's attachments.
    const withNames = (role: "user" | "assistant", content: string, names?: string[]) =>
      ({ role, content: names?.length ? `${content}\n[Attached files: ${names.join(", ")}]` : content });
    const personContext = page?.path === pathname && page.person ? `\n[Untrusted page context: employee ${page.person.name}, id ${page.person.id}. Validate this person and permissions server-side. ${page.facts ?? ''}]` : '';
    const staleNote = pending.data?.feed_health?.filter(f=>f.state==='broken').map(f=>`${f.name} data stops on ${f.complete_up_to??'its last successful date'}`).join('; ');
    const history = recentBaniTurns([...messages.map(m => withNames(m.role, m.outcome ? `${m.content}\n[Actual action outcome: ${m.outcome}]` : m.content, m.files)), withNames("user" as const, text + personContext + (staleNote ? `\n[Data freshness: ${staleNote}. If the answer uses these data, add one clause saying so.]` : "") + (activeItem ? `\n[Current work: ${activeItem.title}. ${activeItem.why}. Existing page: ${activeItem.action_path}. Work is housekeeping, never a payment instruction. Do not claim a write without a confirmed existing action.]` : ""), attached.map(f => f.name))]);
    if (!turn?.hidden) setMessages(prev => [...prev, { role: "user", content: typed, files: attached.map(f => f.name) }]);
    if (attached.length) setLastFiles(attached);
    if (!turn) setDraft(""); setFiles([]);
    setBusy(true); setError(""); setStepLabel("");
    const restore = () => { setDraft(d => d || typed); setFiles(f => f.length ? f : attached); setMessages(prev => prev.slice(0, -1)); };
    try {
      if(attached.length && page?.path===pathname && page.person && page.retainFiles) {
        setStepLabel('Saving employee documents');
        await page.retainFiles(attached.map(a=>a.file));
        if(controller.signal.aborted)return;
      }
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
        body: JSON.stringify({ tenant_id: tenantId, messages: history, ...reviewBody, ...(contextVenue ? { active_venue: contextVenue } : {}), ...(attachments ? { attachments } : {}), ...(turn?.opts.voice ? { voice: true, voice_language: turn.opts.voiceLanguage || "en" } : {}) }),
      });
      if (!response.ok) { const e = await response.json().catch(() => ({})); throw new Error(e.error || e.message || "Bani is unavailable. Try again later."); }
      const reader = response.body?.getReader(); if (!reader) throw new Error("No reply received.");
      const decoder = new TextDecoder(); let buffer = "", content = ""; let proposal: DraftProposal | undefined;
      let action: { mode: "open" | "scan"; venue: string | null; files: string[] } | null = null;
      let salesAction: { files: string[] } | null = null;
      let actionCard: BaniActionCard | null = null;
      const actionCards: BaniActionCard[] = [];
      let navigation: unknown = null;
      let replies: string[] = [];
      const charts: ChartSpec[] = [];
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
          if (event.chart && Array.isArray(event.chart.data) && Array.isArray(event.chart.series) && charts.length < 4) charts.push(event.chart as ChartSpec);
          content += event.choices?.[0]?.delta?.content || "";
          if (event.review) { content = event.review.answer; proposal = event.review.proposal || undefined; }
          if (event.action?.type === "closures_changed") { queryClient.invalidateQueries({ queryKey: ["venue-closures"] }); queryClient.invalidateQueries({ queryKey: ["yourteam"] }); }
          if(event.action?.type==='preferences_changed'){queryClient.invalidateQueries({queryKey:['smart-alerts']});queryClient.invalidateQueries({queryKey:['bani-pending']});}
          if(event.action?.type==='notification_preferences'&&Array.isArray(event.action.preferences))setMessages(prev=>[...prev,...event.action.preferences.filter((p:unknown):p is {id:string;reason:string}=>typeof p==='object'&&p!==null&&'id' in p&&typeof p.id==='string'&&'reason' in p&&typeof p.reason==='string').map((p:{id:string;reason:string})=>({role:'assistant' as const,content:p.reason,preferenceId:p.id}))]);
          if(event.action?.type === "navigate") navigation = event.action.navigation;
          if (event.action?.type === "action_card" && typeof event.action.action_id === "string") { actionCard = { id: event.action.action_id, kind: event.action.kind, title: String(event.action.title ?? ""), detail: typeof event.action.detail === "string" ? event.action.detail : null, challenge: typeof event.action.challenge === "string" ? event.action.challenge : undefined, amount: typeof event.action.amount === "number" ? event.action.amount : undefined, currency: typeof event.action.currency === "string" ? event.action.currency : undefined }; actionCards.push(actionCard); }
          if (event.action?.type === "replies" && Array.isArray(event.action.options)) replies = event.action.options.filter((o: unknown): o is string => typeof o === "string" && !!o.trim()).slice(0, 4);
          if (event.action?.type === "open_sales_scanner") salesAction = { files: Array.isArray(event.action.files) ? event.action.files.filter((n: unknown) => typeof n === "string") : [] };
          if (event.action?.type === "open_invoice_scanner") action = { mode: event.action.mode === "scan" ? "scan" : "open", venue: typeof event.action.venue === "string" ? event.action.venue : null, files: Array.isArray(event.action.files) ? event.action.files : [] };
        }
      }
      if (!controller.signal.aborted && liveIdentity.current === requestIdentity) {
        if (!content.trim()) throw new Error("No answer received. Please try again.");
        revoke(attached);
        setMessages(prev => [...prev, { role: "assistant", content, proposal, before: proposal ? review?.before(proposal) : undefined, target: review ? review.label : undefined, ...(actionCard ? { actionCard } : {}), ...(replies.length ? { replies } : {}), ...(charts.length ? { charts } : {}) }]);
        if(actionCards.length>1) setMessages(prev => [...prev.slice(0,-1), ...actionCards.map((card,i) => ({role: "assistant" as const, content: i===0?content:"", actionCard:card, ...(i===actionCards.length-1&&replies.length?{replies}:{})}))]);
        const path=navigationPath(navigation);
        if(path) {const screen=(navigation as {screen:keyof typeof SCREENS}).screen;if(!isPreviewActive&&canAccessPage(SCREENS[screen].page)){keepOpenNav.current=true;navigate(path);}else setError("That screen is not available in this view.");}
        if (action) runScannerAction(action, attached);
        else if (salesAction) runSalesAction(salesAction, attached);
      }
    } catch (e) {
      if (turn?.opts.voice) { if (!controller.signal.aborted && !turn.hidden) setMessages(prev => prev.slice(0, -1)); throw e; }
      if (!controller.signal.aborted && liveIdentity.current === requestIdentity) { restore(); setError(e instanceof Error ? e.message : "Bani could not reply."); }
    } finally { if (abort.current === controller) { setBusy(false); abort.current = null; } }
  };

  sendRef.current = send;

  // Desktop: panel moves by its header. Mobile: swipe the header down to close (springs back otherwise).
  const onHeaderDown = (e: RPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button,a,input,textarea") || !panelEl.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (!isMobile && !hosted) return;
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

  const mobileH = Math.min(620, vv.h - 16);
  // Mobile: size and place inside the visible viewport so the keyboard can never push the header off-screen.
  const panelStyle = home ? undefined
    : hosted ? (isMobile ? { height: mobileH, maxHeight: mobileH, top: Math.max(8, vv.top + vv.h - 8 - mobileH), bottom: "auto" } : panelPos ? { left: panelPos.x, top: panelPos.y, right: "auto", bottom: "auto" } : undefined)
    : typeof window !== "undefined" && window.innerWidth < 700 ? { top: vv.top + 24, height: vv.h - 96, maxHeight: vv.h - 96, left: 12, right: 12, bottom: "auto", width: "auto" } : undefined;

  const surface = <div className={`floating-bani ${hosted ? "floating-bani-hosted" : ""}`}>
    {(open || home) ? (
      <section ref={panelEl} className={`floating-bani-panel ${home ? `is-home ${open ? "is-talking" : ""}` : hosted ? "" : "is-centred"} ${home && open && !isMobile ? "is-wide" : ""} ${isMobile ? "is-mobile" : ""}`} style={panelStyle} role="dialog" aria-modal="false" aria-label="Bani assistant" onKeyDown={e => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}>
        {home && open && !isMobile && paneOpen && <aside className="fb-pane" aria-label="Chat history">
          <div className="fb-pane-head"><button type="button" className="fb-pane-btn" aria-label="Hide chat history" title="Hide chat history" onClick={togglePane}><PanelLeft className="h-[18px] w-[18px]" /></button><span>Chat history</span></div>
          <BaniChatList chats={savedChats} activeId={chatId} onPick={(c) => { setMessages(c.messages as BaniMessage[]); setChatId(c.id); setDraft(""); }} onNew={newChat} />
        </aside>}
        <div className="floating-bani-main">
        {home ? (open && <div className="fb-top">
          {!isMobile && !paneOpen && <><button type="button" className="fb-pane-btn" aria-label="Show chat history" title="Show chat history" onClick={togglePane}><PanelLeft className="h-[18px] w-[18px]" /></button><span className="fb-top-sep" aria-hidden="true" /></>}
          {renaming != null
            ? <input className="fb-title fb-title-edit" autoFocus value={renaming} maxLength={90} aria-label="Chat name" onChange={e => setRenaming(e.target.value)}
                onBlur={() => { if (chatId) renameChat(scope, chatId, renaming); setRenaming(null); }}
                onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(null); }} />
            : <button type="button" className="fb-title" title={chatId ? "Rename" : undefined} disabled={!chatId} onClick={() => setRenaming(shownTitle)}>{shownTitle}</button>}
          {isMobile && <button type="button" className="fb-top-btn" onClick={openChats}>Chats</button>}
          <button type="button" className="fb-top-btn" onClick={() => setOpen(false)}><House className="h-4 w-4" />{isMobile ? "Home" : "Back to home"}</button>
        </div>) :
        <header className="floating-bani-header" onPointerDown={onHeaderDown} onPointerMove={onHeaderMove} onPointerUp={onHeaderUp} onPointerCancel={onHeaderUp}>
          {isMobile && <div className="floating-bani-grab" aria-hidden="true"><span /></div>}
          <BaniOrb size={30} mode={working ? "thinking" : "idle"} />
          <div className="min-w-0 flex-1"><div className="floating-bani-title">Bani</div><div className="floating-bani-context" title={context}>{context}</div></div>
          <Button variant="ghost" type="button" className="floating-bani-icon" aria-label="Close Bani" onClick={() => setOpen(false)}><X className="h-5 w-5" /></Button>
        </header>}
        {(open || !home) && <div className="floating-bani-transcript" aria-live="polite" onTouchMove={() => { if (document.activeElement === input.current) input.current?.blur(); }}>
          {!messages.length && !review && !salesDraft && <div className="px-1 py-3 space-y-2"><p className="text-sm">{pending.data?.greeting??'Hello. What would you like to work on?'}</p></div>}
          {messages.map((message, index) => <div dir="auto" key={index} className={message.role === "user" ? "floating-bani-user" : "floating-bani-answer"}>
            {message.outcome==='Forgotten'?<p className="text-xs text-muted-foreground">Forgotten</p>:message.content && <div className="floating-bani-prose"><ReactMarkdown remarkPlugins={[remarkGfm, remarkFinancialTables]} components={{table:({children})=><FinancialTable>{children}</FinancialTable>,td:({children,style})=><VarianceCell style={style}>{children}</VarianceCell>,tr:({children})=><SummaryRow>{children}</SummaryRow>,pre:({children})=><>{children}</>,code:({className,children})=>{const lang=/language-(\w+)/.exec(className??"")?.[1];const src=String(children??"");return lang==="stats"?<StatChips source={src}/>:lang==="calc"?<CalcBreakdown source={src}/>:lang?<pre><code>{src}</code></pre>:<code>{children}</code>;},a:({href,children})=>{const nav=href?internalNavigation(href):null;return nav?<Button variant="link" className="h-auto whitespace-normal p-0" onClick={()=>{const path=navigationPath(nav);if(path&&canAccessPage(SCREENS[nav.screen].page)){keepOpenNav.current=true;navigate(path);}}}>{children}</Button>:<span>{children}</span>;}}}>{message.content}</ReactMarkdown></div>}
            {message.charts?.map((c, ci) => <div key={ci} className="mt-2"><AssistantChart spec={c} /></div>)}
            {!!message.files?.length && <div className="floating-bani-sent-files">{message.files.map(name => <span key={name} className="floating-bani-file-chip"><FileText className="h-4 w-4" />{name}</span>)}</div>}
            {message.salesChanges && message.salesBase && (() => {
              const base = message.salesBase; const preview = applySalesChanges(base, message.salesChanges);
              const stale = !salesDraft || JSON.stringify(salesDraft.record) !== JSON.stringify(base);
              return <div dir="auto" className="floating-bani-change">
                <p className="floating-bani-change-target">{message.target}</p>
                {message.salesChanges.map((c, i) => c.field === "note" ? <p key={i} className="floating-bani-change-value">Note: {String(c.value)}</p> : <p key={i} className="floating-bani-change-value td-num">{SALES_LABELS[c.field] ?? c.field}: {showSales(c.field, base[c.field as keyof typeof base])} → {showSales(c.field, preview[c.field as keyof typeof preview])}</p>)}
                {message.outcome ? <p className="floating-bani-change-reason" role="status">{message.outcome}</p> : <div className="mt-2 flex gap-2">
                  <Button variant="ghost" type="button" className="floating-bani-apply" disabled={stale} onClick={() => {
                    const live = salesRef.current;
                    const ok = Boolean(live && JSON.stringify(live.record) === JSON.stringify(base));
                    if (ok && live) {
                      live.apply(applySalesChanges(live.record, message.salesChanges ?? []));
                      const note = message.salesChanges?.find((c) => c.field === "note");
                      if (note) live.applyNote?.(String(note.value));
                    }
                    setMessages(prev => prev.map((m, i) => i === index ? { ...m, outcome: ok ? "Applied to receipt — not saved" : "Receipt changed — ask Bani again" } : m));
                  }}>Apply</Button>
                  <Button variant="ghost" type="button" className="floating-bani-dismiss" onClick={() => setMessages(prev => prev.map((m, i) => i === index ? { ...m, outcome: "Dismissed" } : m))}>Dismiss</Button>
                </div>}
                {!message.outcome && stale && <p className="floating-bani-change-reason">Receipt changed — ask Bani again</p>}
              </div>;
            })()}
            {message.proposal && <div dir="auto" className="floating-bani-change">
              <p className="floating-bani-change-target">{message.target}</p>
              <p className="floating-bani-change-value">{message.proposal.field.replace(/_/g, " ")}: {message.before || "—"} → {message.proposal.value}</p>
              <p className="floating-bani-change-reason">{message.proposal.reason}</p>
              {message.outcome ? <p className="floating-bani-change-reason" role="status">{message.outcome}</p> : <div className="mt-2 flex gap-2">
                <Button variant="ghost" type="button" className="floating-bani-apply" disabled={!review?.editable || message.proposal.binding !== binding} onClick={() => {
                  const ok = review?.apply(message.proposal as DraftProposal) === true;
                  setMessages(prev => prev.map((m, i) => i === index ? { ...m, outcome: ok ? "Applied to review — not saved" : "Review changed — ask Bani again" } : m));
                }}>Apply</Button>
                <Button variant="ghost" type="button" className="floating-bani-dismiss" onClick={() => setMessages(prev => prev.map((m, i) => i === index ? { ...m, outcome: "Dismissed" } : m))}>Dismiss</Button>
              </div>}
              {!message.outcome && message.proposal.binding !== binding && <p className="floating-bani-change-reason">Review changed — ask Bani again</p>}
            </div>}
            {message.actionCard && ["approve_bill","resolve_receipt_intake"].includes(message.actionCard.kind) ? <GuardedOperationCard card={message.actionCard} outcome={message.outcome} undoAvailable={message.actionOutcome?.undo_available} onDecision={(decision,confirmation)=>{if(message.actionCard)void confirmCard(index,message.actionCard,decision,confirmation);}}/> : message.actionCard?.kind === "people" ? <PeopleActionCard card={message.actionCard} outcome={message.actionOutcome} onOutcome={result => setMessages(prev => prev.map((m, i) => i === index ? { ...m, outcome: result.message, actionOutcome: result } : m))} onChange={text => { setDraft(text); input.current?.focus(); }} /> : message.actionCard && <div dir="auto" className="floating-bani-change">
              <p className="floating-bani-change-target">{message.actionCard.title}</p>
              {message.actionCard.detail && <p className="floating-bani-change-reason whitespace-pre-line">{message.actionCard.detail}</p>}
              {message.outcome ? <p className="floating-bani-change-reason" role="status">{message.outcome}</p> : <div className="mt-2 flex gap-2">
                <Button variant="ghost" type="button" className="floating-bani-apply" onClick={() => { if (message.actionCard) void confirmCard(index, message.actionCard, "confirm"); }}>{message.actionCard.kind === "create_alert_ask" ? "Keep" : "Confirm"}</Button>
                {message.actionCard.kind === "create_alert_ask" && <Button variant="ghost" type="button" onClick={() => { if(message.actionCard) void confirmCard(index,message.actionCard,"below_usual"); }}>Use below usual</Button>}
                <Button variant="ghost" type="button" className="floating-bani-dismiss" onClick={() => { if (message.actionCard) void confirmCard(index, message.actionCard, "cancel"); }}>Cancel</Button>
              </div>}
            </div>}
            {message.replies?.length && index === messages.length - 1 && !busy ? <div className="floating-bani-replies" role="group" aria-label="Suggested replies">
              {message.replies.map(r => <button key={r} type="button" className="floating-bani-reply" onClick={() => void sendRef.current({ text: r, opts: { voice: false, voiceLanguage: "" } })}>{r}</button>)}
            </div> : null}
          </div>)}
          {busy && (stepLabel
            ? <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground" role="status" aria-live="polite"><span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />{stepLabel.replace(/[.…]+$/, "")}…</div>
            : <div className="floating-bani-typing" aria-label="Bani is replying"><span /><span /><span /></div>)}
          {error && <p className="floating-bani-error" role="alert">{error}</p>}
          <div ref={end} />
        </div>}
        {voiceMode && <div className="floating-bani-voice">
          <Button variant="ghost" type="button" className="floating-bani-voice-orb" onClick={voice.interrupt}
            aria-label={voice.needsTap ? "Resume voice" : voice.state === "listening" ? "Send voice recording" : "Interrupt and talk"}>
            <BaniOrb size={64} mode={voice.state === "listening" ? "listening" : voice.state === "speaking" ? "speaking" : voice.state === "idle" ? "idle" : "thinking"} getLevel={voice.getLevel} />
          </Button>
          <p className="floating-bani-voice-status" role="status">{voice.needsTap ? "Tap the orb to resume audio" : voice.muted && voice.state === "listening" ? "Mic muted" : voiceLabel[voice.state] ?? ""}</p>
          <LiveWaveform getLevel={voice.getLevel} color="var(--fb-wave)" className="floating-bani-waveform" />
          <p className="floating-bani-voice-hint">Tap the orb to stop · speak any language</p>
          {voice.userWords && <p className="floating-bani-voice-words">{voice.userWords}</p>}
          {voice.notice && voice.notice !== "Tap the orb to talk" && <p className="floating-bani-error" role="alert">{voice.notice}</p>}
        </div>}
        {home && !open && hasConversation.current && <button type="button" className="floating-bani-resume" onClick={() => setOpen(true)}><ArrowUp className="h-4 w-4 rotate-45" />Back to your conversation</button>}
        <form className={`floating-bani-composer ${dropping ? "is-dropping" : ""}`} onDragEnter={onDrag} onDragOver={onDrag} onDragLeave={onDrag} onDrop={onDrop} onSubmit={e => { e.preventDefault(); if (home && (draft.trim() || files.length)) setOpen(true); if (!voiceMode) void send(); }}>
          {!!files.length && <div className="floating-bani-attachments">{files.map(f => <div key={f.id} className="floating-bani-attachment">
            {f.url ? <img src={f.url} alt="" /> : <FileText className="h-5 w-5" />}
            <span className="truncate">{f.name}</span>
            <Button variant="ghost" type="button" aria-label={`Remove ${f.name}`} onClick={() => removeFile(f.id)}><X className="h-3.5 w-3.5" /></Button>
          </div>)}</div>}
          {voiceMode ? <div className="floating-bani-voice-row">
            <div className="floating-bani-voice-pill">
              <Button variant="ghost" type="button" className="floating-bani-plus" aria-label="Attach files" onClick={() => picker.current?.click()}><Plus className="h-5 w-5" /></Button>
              <input ref={picker} type="file" hidden multiple accept={ATTACH_TYPES.join(",")} onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
              <textarea dir="auto" ref={input} rows={1} value={draft} maxLength={2000} onChange={e => setDraft(e.target.value)} placeholder="Type instead" aria-label="Type to Bani during voice" className="floating-bani-input"
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (draft.trim() && voice.sendTyped(draft)) setDraft(""); } }} />
              {draft.trim() && <Button variant="ghost" type="button" className="floating-bani-send" aria-label="Send to Bani" onClick={() => { if (voice.sendTyped(draft)) setDraft(""); }}><ArrowUp className="h-5 w-5" /></Button>}
            </div>
            <Button variant="ghost" type="button" className="floating-bani-voice-mute" aria-label={voice.muted ? "Unmute microphone" : "Mute microphone"} aria-pressed={voice.muted} onClick={voice.toggleMute}>{voice.muted ? <MicOff className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}</Button>
            <Button variant="ghost" type="button" className="floating-bani-voice-end" aria-label="End voice conversation" onClick={exitVoice}><X className="h-[18px] w-[18px]" /></Button>
          </div> : dictation.active ? <div className="floating-bani-row">
            <Button variant="ghost" type="button" className="floating-bani-plus" aria-label="Cancel dictation" onClick={() => dictation.cancel()}><X className="h-5 w-5" /></Button>
            <div className="flex min-h-[40px] flex-1 items-center px-1">
              {dictation.state === "transcribing" ? <span className="text-sm" style={{ color: "var(--fb-muted)" }}>Transcribing…</span> : <LiveWaveform getLevel={dictation.getLevel} color="var(--fb-wave)" className="h-7 w-full" />}
            </div>
            <Button variant="ghost" type="button" className="floating-bani-send" aria-label="Finish dictation" disabled={dictation.state !== "recording"} onClick={async () => { const t = await dictation.confirm(); if (t) setDraft(d => joinDraft(d, t)); input.current?.focus(); }}><Check className="h-5 w-5" /></Button>
          </div> : <div className="floating-bani-row">
            <Button variant="ghost" type="button" className="floating-bani-plus" aria-label="Attach files" disabled={busy} onClick={() => picker.current?.click()}><Plus className="h-5 w-5" /></Button>
            <input ref={picker} type="file" hidden multiple accept={ATTACH_TYPES.join(",")} onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
            {/* The hint is drawn over the box so it can end in "…" instead of wrapping. */}
            <span className="floating-bani-field">
              <textarea dir="auto" ref={input} rows={1} value={draft} maxLength={2000} onChange={e => setDraft(e.target.value)} aria-label={home ? "Chat with your finance team" : "Ask Bani"} className="floating-bani-input" onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !isMobile) { e.preventDefault(); if (home && (draft.trim() || files.length)) setOpen(true); void send(); } }} />
              {!draft && <span className="floating-bani-hint" aria-hidden="true">{home ? (open ? "Reply to your finance team" : "Chat with your finance team") : "Ask Bani, or drop a file"}</span>}
            </span>
            {dictation.supported && <Button variant="ghost" type="button" className="floating-bani-mic" aria-label="Start dictation" disabled={busy} onClick={() => dictation.start()}><Mic className="h-[18px] w-[18px]" /></Button>}
            {!busy && !draft.trim() && !files.length
              ? <Button variant="ghost" type="button" className="floating-bani-send" aria-label="Start voice conversation" onClick={enterVoice}><AudioLines className="h-5 w-5" /></Button>
              : <Button variant="ghost" type="submit" className="floating-bani-send" disabled={busy || (!draft.trim() && !files.length)} aria-label="Send to Bani"><ArrowUp className="h-5 w-5" /></Button>}
          </div>}
        </form>
        </div>
      </section>
    ) : null}
    {!home && (!open || !hosted) && (
      <Button variant="ghost" type="button" className="floating-bani-sphere" aria-label="Open Bani" title="Ask Bani" onClick={() => openSphere()}>
        <BaniOrb size={SPHERE} mode="idle" />
      </Button>
    )}
  </div>;
  // A modal owns focus and inertness: portal into that modal, never above it.
  if (homeSlot) return createPortal(surface, homeSlot);
  return hosted ? createPortal(surface, host?.node.closest('[role="dialog"]') || document.body) : surface;
}
