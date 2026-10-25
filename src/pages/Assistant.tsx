import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BaniOrb, type BaniOrbMode } from "@/components/assistant/BaniOrb";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, AudioLines, Mic, MicOff, Square, Plus, History, X, ChevronRight, Check, FileText } from "lucide-react";
import { ATTACH_TYPES, attachmentError } from "@/utils/floatingBaniUi";
import { compressImageFile } from "@/utils/imageCompression";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDictation, joinDraft } from "@/hooks/useDictation";
import { VoiceStage } from "@/components/assistant/VoiceStage";
import { LiveWaveform } from "@/components/assistant/LiveWaveform";
import BaniProcessingMark from "@/components/brand/BaniProcessingMark";
import { useVoiceConversation, type Reveal, type SpeakEvent, type VoiceState } from "@/hooks/useVoiceConversation";
import { useAuth } from "@/hooks/useAuth";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { toast } from "@/hooks/use-toast";
import { AssistantChart, type ChartSpec } from "@/components/assistant/AssistantChart";
import {
  assistantScopeKey,
  canSend as canSendFn,
  checkedCategories,
  composerPlacement,
  conversationTitle,
  createConversation,
  toRequestMessages,
  upsertConversation,
  visibleConversations,
  type AssistantConversation,
  type AssistantMessage,
  type AssistantStep,
} from "@/utils/assistantSession";

type Msg = AssistantMessage<ChartSpec>;
type Conversation = AssistantConversation<ChartSpec>;

const SUGGESTIONS: { text: string; label: string }[] = [
  { text: "Where am I losing margin this month?", label: "Margin leaks" },
  { text: "Which suppliers raised prices in the last 90 days?", label: "Supplier prices" },
  { text: "Compare labour cost against revenue", label: "Labour vs revenue" },
  { text: "What should I focus on this week?", label: "Focus this week" },
];

const DISCLAIMER = "Bani can make mistakes. Verify before acting.";

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `c-${Date.now()}-${Math.random()}`;

export default function Assistant() {
  const { session, user } = useAuth();
  const { tenantId, loading: tenantLoading } = useActiveTenant();

  const scopeKey = assistantScopeKey(user?.id, tenantId);
  const scopeReady = !!scopeKey && !tenantLoading;

  const [conversations, setConversations] = useState<Conversation[]>(() => [createConversation<ChartSpec>(newId())]);
  const [activeId, setActiveId] = useState<string>(() => "");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const trackRequestRef = useRef<((c: AbortController | null) => void) | null>(null);
  const requestScopeRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const composingRef = useRef(false);

  // Ensure there is always an active conversation.
  useEffect(() => {
    if (!activeId && conversations[0]) setActiveId(conversations[0].id);
  }, [activeId, conversations]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? conversations[0],
    [conversations, activeId],
  );
  const messages = active?.messages ?? [];

  // Session state is scoped to user + tenant. Any switch aborts in-flight work
  // and wipes all conversation state so nothing leaks across workspaces.
  const prevScope = useRef<string | null>(scopeKey);
  useEffect(() => {
    if (prevScope.current === scopeKey) return;
    prevScope.current = scopeKey;
    abortRef.current?.abort();
    abortRef.current = null;
    requestScopeRef.current = null;
    setLoading(false);
    setInput("");
    const fresh = createConversation<ChartSpec>(newId());
    setConversations([fresh]);
    setActiveId(fresh.id);
  }, [scopeKey]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Only auto-scroll when the user is already at the bottom.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useEffect(() => {
    if (!pinnedRef.current) return;
    const el = scrollRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const patchActive = useCallback(
    (id: string, updater: (c: Conversation) => Conversation) => {
      setConversations((prev) => {
        const target = prev.find((c) => c.id === id);
        if (!target) return prev;
        return upsertConversation(prev, updater(target));
      });
    },
    [],
  );

  // "+" attaches files (read-only analysis, same server path as floating Bani).
  const [files, setFiles] = useState<File[]>([]);
  const pickerRef = useRef<HTMLInputElement>(null);
  const addFiles = (list: FileList) => {
    const next = [...files];
    for (const f of Array.from(list)) {
      const problem = attachmentError(f, next);
      if (problem) { toast({ title: problem, variant: "destructive" }); continue; }
      next.push(f);
    }
    setFiles(next);
  };
  const startNewConversation = () => {
    setFiles([]);
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    const fresh = createConversation<ChartSpec>(newId());
    setConversations((prev) => [fresh, ...prev.filter((c) => c.messages.length > 0)]);
    setActiveId(fresh.id);
    setInput("");
  };

  // Remove a trailing assistant message that never got any content (e.g. the
  // stream was stopped during the thinking phase), so no empty bubble remains.
  const dropEmptyTail = useCallback(
    (convId: string) => {
      patchActive(convId, (c) => {
        const last = c.messages[c.messages.length - 1];
        return last?.role === "assistant" && !last.content && !(last.charts?.length)
          ? { ...c, messages: c.messages.slice(0, -1) }
          : c;
      });
    },
    [patchActive],
  );

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    if (active) dropEmptyTail(active.id);
  };

  const send = async (text: string, opts?: {
    voice?: boolean;
    voiceLanguage?: string;
    onSpeak?: (s: SpeakEvent) => void;
    onStatus?: (label: string) => void;
  }) => {
    const attached = opts?.voice ? [] : files;
    const trimmed = text.trim() || (attached.length ? "Please read the attached file(s), summarise what they show, and ask me what I would like to do with them." : "");
    if (!canSendFn({ text: trimmed, loading, scopeReady }) || !session || !active) {
      if (opts?.voice) throw new Error("Bani is not ready to send. Wait for the current reply or reopen this workspace.");
      return;
    }

    const convId = active.id;
    const sentScope = scopeKey;
    requestScopeRef.current = sentScope;

    setInput("");
    if (attached.length) setFiles([]);
    const userMsg: Msg = { role: "user", content: attached.length ? `${trimmed}\n\n_Attached: ${attached.map(f => f.name).join(", ")}_` : trimmed };
    const nextMessages = [...active.messages, userMsg];
    patchActive(convId, (c) => ({
      ...c,
      title: c.messages.length === 0 ? conversationTitle(trimmed) : c.title,
      messages: nextMessages,
    }));
    setLoading(true);
    pinnedRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;
    trackRequestRef.current?.(controller);

    let assistantSoFar = "";
    const collectedCharts: ChartSpec[] = [];
    const collectedSteps: AssistantStep[] = [];
    const startedAt = Date.now();
    let durationMs: number | undefined;
    const stale = () => requestScopeRef.current !== sentScope || controller.signal.aborted;
    const upsert = (chunk: string, chart?: ChartSpec, step?: AssistantStep) => {
      if (stale()) return;
      if (chunk) assistantSoFar += chunk;
      if (chart) collectedCharts.push(chart);
      if (step) collectedSteps.push(step);
      patchActive(convId, (c) => {
        const payload: Msg = {
          role: "assistant",
          content: assistantSoFar,
          charts: [...collectedCharts],
          steps: [...collectedSteps],
          ...(durationMs !== undefined ? { durationMs } : {}),
        };
        const last = c.messages[c.messages.length - 1];
        const msgs =
          last?.role === "assistant"
            ? c.messages.map((m, i) => (i === c.messages.length - 1 ? payload : m))
            : [...c.messages, payload];
        return { ...c, messages: msgs };
      });
    };

    try {
      const attachments = attached.length ? await Promise.all(attached.map(async (f) => {
        const prepared = f.type.startsWith("image/") ? await compressImageFile(f) : f;
        const data = await new Promise<string>((res, rej) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result).split(",")[1] || ""); rd.onerror = () => rej(new Error(`Could not read ${f.name}.`)); rd.readAsDataURL(prepared); });
        return { name: f.name, type: prepared.type || f.type, data };
      })) : undefined;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-assistant`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          messages: toRequestMessages(nextMessages),
          tenant_id: tenantId,
          ...(attachments ? { floating: true, attachments } : {}),
          ...(opts?.voice ? { voice: true, voice_language: opts.voiceLanguage || "en" } : {}),
        }),
        signal: controller.signal,
      });

      if (stale()) return;

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({ error: "Request failed" }));
        if (resp.status === 429) toast({ title: "Rate limited", description: errBody.error, variant: "destructive" });
        else if (resp.status === 402) toast({ title: "Credits exhausted", description: errBody.error, variant: "destructive" });
        else toast({ title: "Assistant error", description: errBody.error || "Try again.", variant: "destructive" });
        setLoading(false);
        return;
      }

      if (!resp.body) throw new Error("No response body");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        if (stale()) return;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") {
            done = true;
            if (assistantSoFar) {
              durationMs = Date.now() - startedAt;
              upsert("");
            }
            break;
          }
          try {
            const parsed = JSON.parse(json);
            if (parsed.error) {
              done = true;
              const msg = String(parsed.error);
              const title = /rate limit/i.test(msg) ? "Rate limited" : /credits/i.test(msg) ? "Credits exhausted" : "Assistant error";
              toast({ title, description: msg, variant: "destructive" });
              if (!assistantSoFar && !stale()) {
                patchActive(convId, (c) => {
                  const last = c.messages[c.messages.length - 1];
                  return last?.role === "assistant" && !last.content ? { ...c, messages: c.messages.slice(0, -1) } : c;
                });
              }
              break;
            } else if (parsed.status && typeof parsed.status.label === "string") {
              upsert("", undefined, { label: parsed.status.label, kind: parsed.status.kind });
              opts?.onStatus?.(parsed.status.label);
            } else if (parsed.speak && typeof parsed.speak.text === "string") {
              opts?.onSpeak?.(parsed.speak as SpeakEvent);
            } else if (parsed.chart) {
              upsert("", parsed.chart as ChartSpec);
            } else {
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) upsert(delta);
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e: any) {
      if (e?.name !== "AbortError" && !stale()) {
        console.error(e);
        toast({ title: "Assistant error", description: e?.message, variant: "destructive" });
      }
    } finally {
      // Covers stop(), network drops and scope changes: never leave an empty bubble.
      dropEmptyTail(convId);
      if (!stale()) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (composingRef.current) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (voiceMode) sendVoiceTyped();
      else send(input);
    }
  };

  // Two-way voice conversation: MediaRecorder + bani-stt/bani-tts edge functions.
  // The loop (listening → thinking → speaking → listening) lives in the hook;
  // questions go through the normal send() path with voice flags, so the chat
  // history is identical to text mode.
  const [voiceMode, setVoiceMode] = useState(false);
  // Dictation (small mic): one recorder + live waveform; transcript lands in the box for editing.
  const dictation = useDictation({
    getAuth: () => ({ token: session?.access_token ?? null, tenantId }),
    onError: (msg) => toast({ title: msg, variant: "destructive" }),
  });
  const toggleDictation = () => { if (dictation.active) dictation.cancel(); else dictation.start(); };
  dictation.setOnAutoFinish((t) => setInput((prev) => joinDraft(prev, t)));
  /** Stop: transcript goes into the editable draft. */
  const finishDictation = async () => { const t = await dictation.confirm(); if (t) setInput((prev) => joinDraft(prev, t)); };
  /** Send: transcribe, then submit once through the normal chat path. */
  const sendDictation = async () => {
    const t = await dictation.confirm();
    if (!t) return;
    const text = joinDraft(input, t);
    setInput(text);
    if (canSendFn({ text, loading, scopeReady })) send(text);
  };
  const dictationStopRef = useRef(dictation.cancel);
  dictationStopRef.current = dictation.cancel;
  useEffect(() => { dictationStopRef.current(); }, [scopeKey, activeId]);
  const voice = useVoiceConversation({
    active: voiceMode,
    getAuth: () => ({ token: session?.access_token ?? null, tenantId }),
    sendQuestion: (text, opts) => send(text, opts),
    onError: (msg) => toast({ title: msg, variant: "destructive" }),
  });
  trackRequestRef.current = voice.trackRequest;
  const voiceEndRef = useRef(voice.end);
  voiceEndRef.current = voice.end;
  useEffect(() => { voiceEndRef.current(); setVoiceMode(false); }, [scopeKey]);

  // Must run inside the tap: start() marks voice active and requests the mic synchronously.
  // Expanded/collapsed is view-only: the hook (mic stream, playback, mute) keeps running.
  const [voiceExpanded, setVoiceExpanded] = useState(true);
  const enterVoice = () => { dictation.cancel(); voice.start(); setVoiceExpanded(true); setVoiceMode(true); };
  // Floating Bani's voice button opens this page with ?voice=1 (navigation keeps the tap's user activation).
  const voiceHandoff = useRef(typeof window !== "undefined" && new URLSearchParams(window.location.search).get("voice") === "1");
  useEffect(() => {
    if (!voiceHandoff.current || !scopeReady) return;
    voiceHandoff.current = false;
    window.history.replaceState(null, "", window.location.pathname);
    enterVoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeReady]);
  const cancelVoice = () => { voice.end(); stop(); setVoiceMode(false); };
  // Esc collapses the expanded view; only ✕ ends voice.
  useEffect(() => {
    if (!voiceMode || !voiceExpanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setVoiceExpanded(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [voiceMode, voiceExpanded]);

  // Expanded voice is a calm full screen: hide the sidebar trigger and top-bar icons.
  useEffect(() => {
    document.body.classList.toggle("bani-voice-mode", voiceMode);
    return () => document.body.classList.remove("bani-voice-mode");
  }, [voiceMode, voiceExpanded]);

  // Typed question during voice: goes through the voice turn (spoken reply).
  const voiceBusy = loading || voice.state === "thinking" || voice.state === "transcribing";
  const sendVoiceTyped = () => {
    if (voiceBusy || !scopeReady || !input.trim()) return;
    if (voice.sendTyped(input)) setInput("");
  };

  const [focused, setFocused] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [input]);

  const history = visibleConversations(conversations, activeId);
  const [topbarTarget, setTopbarTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setTopbarTarget(document.getElementById("assistant-topbar-actions")); }, []);
  // Once a recording starts, the composer docks at the bottom and stays there after
  // Stop and edit; Cancel (or an empty new chat) restores the welcome layout.
  const [dictationDocked, setDictationDocked] = useState(false);
  useEffect(() => { if (dictation.active) setDictationDocked(true); }, [dictation.active]);
  useEffect(() => { if (!dictation.active && !input.trim() && messages.length === 0) setDictationDocked(false); }, [dictation.active, input, messages.length]);
  const placement = dictationDocked || dictation.active ? "bottom" : composerPlacement(messages.length);
  const hasText = !!input.trim() || files.length > 0;

  const canSendNow = canSendFn({ text: input.trim() || (files.length ? "files" : ""), loading, scopeReady });

  const Composer = (
    <div className="relative w-full">
      {!voiceMode && dictation.active ? (
      <div className="bani-glass bani-composer bani-recorder flex items-center gap-1 rounded-[24px] px-1 py-1">
        <button type="button" onClick={() => { dictation.cancel(); setDictationDocked(false); }} aria-label="Cancel dictation"
          className="bani-mic flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ color: "#3F5652" }}>
          <X className="h-[18px] w-[18px]" />
        </button>
        <div className="flex h-11 min-w-0 flex-1 items-center justify-center px-1">
          {dictation.state === "transcribing"
            ? <BaniProcessingMark size={20} label="Transcribing" />
            : <LiveWaveform getLevel={dictation.getLevel} className="h-8 w-full" />}
        </div>
        <button type="button" onClick={() => void finishDictation()} disabled={dictation.state !== "recording"}
          aria-label="Stop and edit"
          className="bani-mic flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40" style={{ color: "#1F3A37" }}>
          <Square className="h-3.5 w-3.5 fill-current" />
        </button>
        <button type="button" onClick={() => void sendDictation()} disabled={dictation.state !== "recording" || loading || !scopeReady}
          aria-label="Send dictation"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40" style={{ background: "#1F3A37" }}>
          <ArrowUp className="h-[18px] w-[18px]" />
        </button>
      </div>
      ) : (
      <>
      {!voiceMode && files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="bani-glass flex max-w-[220px] items-center gap-1.5 rounded-full py-1 pl-3 pr-1 text-xs">
              <FileText className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="flex h-5 w-5 items-center justify-center rounded-full"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className={`bani-glass bani-composer flex min-h-[54px] items-end gap-1 rounded-[24px] py-2 pr-2 ${voiceMode ? "pl-[18px]" : "pl-2"}`}>
        {!voiceMode && (
          <input ref={pickerRef} type="file" hidden multiple accept={ATTACH_TYPES.join(",")} onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        )}
        {!voiceMode && (
          <button
            type="button"
            onClick={() => pickerRef.current?.click()}
            disabled={loading}
            aria-label="Attach files"
            className="bani-mic mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ color: "#5B706B" }}
          >
            <Plus className="h-[18px] w-[18px]" />
          </button>
        )}
        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; }}
          onKeyDown={onKeyDown}
          placeholder="Ask Bani…"
          aria-label="Ask Bani a question"
          rows={1}
          className="bani-input bani-ask-input min-h-[36px] flex-1 resize-none self-center py-[7px] text-[15px] leading-[22px]"
        />
        {voiceMode ? (
          hasText && (
            <Button variant="ghost"
              type="button"
              onClick={sendVoiceTyped}
              disabled={voiceBusy || !scopeReady}
              aria-label="Send question"
              className="bani-voice-end bani-fade relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full p-0 disabled:opacity-45"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          )
        ) : (
          <>
            {dictation.supported && (
              <button
                type="button"
                onClick={toggleDictation}
                disabled={!scopeReady || loading}
                aria-label="Start dictation"
                className="bani-mic relative mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
                style={{ color: "#5B706B" }}
              >
                <Mic className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={loading ? stop : hasText ? () => send(input) : enterVoice}
              disabled={loading ? false : hasText ? !canSendNow : !scopeReady}
              aria-label={loading ? "Stop generating" : hasText ? "Send question" : "Start voice conversation"}
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-opacity"
              style={{ background: "#1F3A37", opacity: loading || !hasText || canSendNow ? 1 : 0.45 }}
            >
              <span className="bani-ico" style={{ opacity: loading ? 1 : 0 }}><Square className="h-3.5 w-3.5 fill-current" /></span>
              <span className="bani-ico" style={{ opacity: !loading && hasText ? 1 : 0 }}><ArrowUp className="h-4 w-4" /></span>
              <span className="bani-ico" style={{ opacity: !loading && !hasText ? 1 : 0 }}><AudioLines className="h-4 w-4" /></span>
            </button>
          </>
        )}
      </div>
      )}
      {!scopeReady && (
        <p className="mt-2 text-center text-xs text-white/80">
          {tenantLoading ? "Loading your workspace…" : "Select a workspace to ask questions."}
        </p>
      )}
    </div>
  );

  // Voice mode bottom row: pill composer + mute + end (same in both views).
  const VoiceComposerRow = (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">{Composer}</div>
      <div className="flex items-center gap-2 pb-[3px]">
        <VoiceControls muted={voice.muted} onToggleMute={voice.toggleMute} onEnd={cancelVoice} />
      </div>
    </div>
  );

  const topbarActions = (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-label="Recent chats" className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ background: "rgba(255,255,255,0.16)" }}>
            <History className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 bg-white p-1.5">
          {history.length === 0 ? (
            <p className="px-2 py-2 text-sm text-muted-foreground">No recent chats</p>
          ) : (
            history.map((c) => (
              <button key={c.id} type="button" onClick={() => setActiveId(c.id)} className="block w-full truncate rounded-md px-2 py-2 text-left text-sm hover:bg-muted">
                {c.title}
              </button>
            ))
          )}
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label="New chat"
        onClick={() => { cancelVoice(); startNewConversation(); }}
        className="flex h-8 w-8 items-center justify-center rounded-full text-white"
        style={{ background: "rgba(255,255,255,0.16)" }}
      >
        <Plus className="h-4 w-4" />
      </button>
    </>
  );

  return (
    <div className={`relative flex min-h-0 w-full flex-col ${voiceMode ? "bani-voice-surface" : ""}`} style={{ height: voiceMode ? "calc(100dvh - 1rem)" : "calc(100dvh - 4rem)" }}>
      <style>{`
        .bani-glass{background:rgba(255,255,255,0.84);-webkit-backdrop-filter:blur(16px) saturate(140%);backdrop-filter:blur(16px) saturate(140%);border:1px solid rgba(255,255,255,0.65);box-shadow:inset 0 1px 0 rgba(255,255,255,0.8),0 14px 36px -12px rgba(20,45,43,0.30);}
        .bani-composer{transition:border-color 150ms,box-shadow 150ms}@keyframes bani-dock{from{opacity:.6;transform:translateY(-24px)}to{opacity:1;transform:none}}.bani-dock{animation:bani-dock 220ms ease-out}.bani-suggest{scrollbar-width:none;overscroll-behavior-x:contain}.bani-suggest::-webkit-scrollbar{display:none}.bani-answer .bani-table,.bani-voice-answer .bani-table{background:rgba(250,252,251,0.82);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border-radius:12px;color:#10302C}.bani-table th{color:#3F5652!important;font-weight:600}.bani-table td,.bani-table td strong{color:#10302C!important}.bani-table tr:last-child td{border-bottom:0!important}.bani-recorder{min-height:54px;animation:bani-fade 180ms ease-out}
        .bani-answer{color:#10302C;max-width:68ch;font-size:15.5px;line-height:1.6}.bani-answer .prose{font-size:15.5px;line-height:1.6;color:inherit}.bani-answer .prose p{margin:0 0 .75em}
        .bani-composer:focus-within{outline:none;border-color:rgba(255,255,255,0.95);box-shadow:inset 0 1px 0 rgba(255,255,255,0.8),0 0 0 4px rgba(255,255,255,0.18),0 14px 36px -12px rgba(20,45,43,0.30)}
        html:not(.dark) .tenant-portal .app-shell textarea.bani-ask-input,textarea.bani-ask-input{background:transparent !important;border:0 !important;box-shadow:none !important;border-radius:0 !important;outline:none !important}
        textarea.bani-ask-input:focus,textarea.bani-ask-input:focus-visible{outline:none !important;box-shadow:none !important;border:0 !important}
        .bani-ico{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transition:opacity 150ms ease}
        .bani-mic{background:transparent}.bani-mic:hover:not(:disabled){background:rgba(20,45,43,0.06)}
        .bani-input{color:#14302D}.bani-input::placeholder{color:#7A8C88}
        @keyframes bani-pulse{0%{box-shadow:0 0 0 0 rgba(31,58,55,0.35)}100%{box-shadow:0 0 0 7px rgba(31,58,55,0)}}
        .bani-mic-pulse{animation:bani-pulse 1.4s ease-out infinite}
        @keyframes bani-fade{from{opacity:0}to{opacity:1}}
        .bani-fade{animation:bani-fade 200ms ease-out}
        @keyframes bani-dots{0%,100%{opacity:.25}50%{opacity:1}}
        .bani-dots{animation:bani-dots 1.4s ease-in-out infinite}
        @keyframes bani-speak-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
        .bani-orb-speaking{animation:bani-speak-pulse 1.6s ease-in-out infinite}
        body.bani-voice-mode .tenant-topbar{display:none}
        body.bani-voice-mode [data-sidebar="trigger"]{display:none}
        .bani-voice-surface{color:hsl(var(--bani-voice-ink))}
        .bani-voice-surface:before{content:"";position:fixed;inset:0;background:var(--bani-voice-atmosphere);z-index:-1;pointer-events:none}
        .bani-voice-surface .bani-composer{background:hsl(var(--bani-voice-paper)/.88);border:0;box-shadow:none;border-radius:32px;padding:6px 10px 6px 18px}
        .bani-voice-surface .bani-composer:focus-within{box-shadow:0 0 0 3px hsl(var(--bani-voice-paper)/.2)}
        .bani-voice-title{color:hsl(var(--bani-voice-paper));font-size:22px;font-weight:500}
        .bani-voice-mic{background:hsl(var(--bani-voice-paper)/.94);color:hsl(var(--bani-voice-ink));width:48px;height:48px}
        .bani-voice-end{background:hsl(var(--bani-voice-forest));color:hsl(var(--bani-voice-paper));width:48px;height:48px}
        .bani-voice-orb{background:transparent!important;box-shadow:none;padding:0;flex-shrink:0}
        .bani-voice-surface .bani-user-message{background:hsl(var(--bani-voice-paper)/.65)!important;color:hsl(var(--bani-voice-ink));border:0!important;border-radius:18px!important}
        .bani-voice-answer{color:hsl(var(--bani-voice-ink));font-size:17px;padding:0;background:none;border:0;box-shadow:none}
        .bani-voice-answer .prose{font-size:17px;color:inherit}
        @media (prefers-reduced-motion: reduce){.bani-dock,.bani-recorder,.bani-mic-pulse,.bani-fade,.bani-dots,.bani-orb-speaking{animation:none}.bani-orb-level{transform:none !important}}
      `}</style>

      {topbarTarget && !voiceMode && createPortal(topbarActions, topbarTarget)}
      {voiceMode && <div className="bani-voice-title absolute left-4 top-2 z-10">Bani</div>}

      {voiceMode ? (
        <VoiceStage
          expanded={voiceExpanded}
          onExpandedChange={(x) => { setVoiceExpanded(x); if (x && voice.needsTap) voice.interrupt(); }}
          onOrbTap={voice.interrupt}
          orbLabel={voice.needsTap ? "Resume voice" : voice.state === "listening" ? "Send voice recording" : "Interrupt and talk"}
          orb={<BaniOrb size={176} mode={orbModeFor(voice.state)} getLevel={voice.getLevel} />}
          transcript={
            <div ref={scrollRef} onScroll={onScroll} data-testid="assistant-scroll" className="min-h-0 flex-1 overflow-y-auto px-4 pt-14"
              style={{ paddingBottom: "calc(230px + env(safe-area-inset-bottom))" }}>
              <div className="mx-auto w-full max-w-[720px] space-y-5">
                {messages.map((m, i) => {
                  const inFlight = loading && i === messages.length - 1 && m.role === "assistant" && !m.content;
                  return inFlight ? null : <MessageBlock key={i} msg={m} voiceMode />;
                })}
              </div>
            </div>
          }
          bottom={<>
            {voice.needsTap && <p className="mb-2 text-center text-sm" role="status">Tap the orb to resume audio.</p>}
            {voice.notice && voice.notice !== "Tap the orb to talk" && <p className="mb-2 text-center text-sm" role="alert">{voice.notice}</p>}
            {VoiceComposerRow}
          </>}
        />
      ) : placement === "welcome" ? (
        <div className="flex min-h-0 flex-1 flex-col px-4">
          <div style={{ flex: 42 }} />
          <div className="mx-auto w-full max-w-[640px]">
            <div className="mb-2 min-h-[36px]">
              {!input && !dictation.active && (
                <div className="bani-suggest -mx-4 flex gap-2 overflow-x-auto px-4" role="list" aria-label="Suggested questions">
                  {SUGGESTIONS.map(({ text, label }) => (
                    <button
                      key={text}
                      type="button"
                      role="listitem"
                      title={text}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => send(text)}
                      disabled={!scopeReady || loading}
                      className="h-9 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13px] disabled:opacity-50"
                      style={{ background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.38)", color: "#F2F7F4" }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {Composer}
          </div>
          <div style={{ flex: 58 }} />
        </div>
      ) : (
        <>
          <div
            ref={scrollRef}
            onScroll={onScroll}
            data-testid="assistant-scroll"
            className="min-h-0 flex-1 overflow-y-auto px-4 pt-14"
            style={{ paddingBottom: voiceMode ? "calc(210px + env(safe-area-inset-bottom))" : "calc(150px + env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto w-full max-w-[720px] space-y-5">
              {messages.map((m, i) => {
                const inFlight = loading && i === messages.length - 1 && m.role === "assistant" && !m.content;
                if (inFlight) return voiceMode ? null : <ThinkingLine key={i} />;
                return <MessageBlock key={i} msg={m} voiceMode={voiceMode} />;
              })}
              {!voiceMode && loading && messages[messages.length - 1]?.role === "user" && <ThinkingLine />}
            </div>
          </div>
          <div
            className="pointer-events-none absolute inset-x-0 px-4"
            style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}
          >
            <div className={`pointer-events-auto mx-auto w-full max-w-[640px] ${dictationDocked && messages.length === 0 ? "bani-dock" : ""}`}>
                <>
                  {Composer}
                  <p className="mt-2 text-center text-[10px]" style={{ color: "rgba(20,45,43,0.5)" }}>{DISCLAIMER}</p>
                </>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MessageBlock({ msg, voiceMode = false }: { msg: Msg; voiceMode?: boolean }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="bani-user-message max-w-[75%] px-3.5 py-2 text-[14.5px] leading-[1.45]"
          style={{ background: "rgba(255,255,255,0.42)", color: "#10302C", borderRadius: "18px 18px 4px 18px" }}
        >
          <p className="whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={voiceMode ? "bani-voice-answer bani-fade" : "bani-answer bani-fade"}>
      <CheckedLine steps={msg.steps} durationMs={msg.durationMs} />
      <div className="min-w-0 space-y-3">
        <div className="prose prose-sm max-w-none text-inherit
          prose-p:my-2 prose-p:leading-relaxed
          prose-headings:font-display prose-headings:mt-4 prose-headings:mb-2
          prose-h1:text-lg prose-h2:text-base prose-h3:text-sm
          prose-strong:text-foreground prose-strong:font-semibold
          prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5
          prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
          prose-hr:my-3
        ">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ node, ...props }) => (
                <div className="bani-table my-3 overflow-x-auto">
                  <table className="w-full border-collapse text-sm" {...props} />
                </div>
              ),
              thead: ({ node, ...props }) => <thead {...props} />,
              th: ({ node, ...props }) => (
                <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground" style={{ borderBottom: "1px solid rgba(20,45,43,0.08)" }} {...props} />
              ),
              td: ({ node, ...props }) => (
                <td className="px-3 py-2" style={{ borderBottom: "1px solid rgba(20,45,43,0.08)" }} {...props} />
              ),
              tr: ({ node, ...props }) => <tr {...props} />,
            }}
          >
            {msg.content || "…"}
          </ReactMarkdown>
        </div>
        {msg.charts?.map((c, ci) => (
          <AssistantChart key={ci} spec={c} />
        ))}
      </div>
    </div>
  );
}

function ThinkingLine() {
  // Tool steps stay in the answer's "Checked …" detail; the live line is calm.
  const target = "Thinking";
  const [shown, setShown] = useState(target);
  const [fading, setFading] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (target === shown) return;
    setFading(true);
    const t = setTimeout(() => { setShown(target); setFading(false); }, 300);
    return () => clearTimeout(t);
  }, [target, shown]);
  useEffect(() => {
    setSlow(false);
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, [shown]);
  return (
    <div className="bani-fade flex items-center gap-[10px]" role="status" aria-live="polite">
      <BaniOrb size={22} mode="thinking" />
      <span
        className="text-[13px] transition-all duration-300"
        style={{ color: "rgba(255,255,255,0.92)", opacity: fading ? 0 : 1, transform: fading ? "translateY(-4px)" : "none" }}
      >
        {shown}
        {slow && <span className="bani-dots">…</span>}
      </span>
    </div>
  );
}

function CheckedLine({ steps, durationMs }: { steps?: AssistantStep[]; durationMs?: number }) {
  const [open, setOpen] = useState(false);
  const cats = checkedCategories(steps);
  if (!cats || !steps) return null;
  const items = steps.filter((s) => s.kind && s.kind !== "chart");
  const secs = durationMs !== undefined ? ` · ${Math.max(1, Math.round(durationMs / 1000))}s` : "";
  return (
    <div className="mb-2">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-1 text-[11px]" style={{ color: "#7A8C88" }}>
        <ChevronRight className="h-3 w-3 transition-transform" style={{ transform: open ? "rotate(90deg)" : "none" }} />
        <span>Checked {cats}{secs}</span>
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1 pl-4">
          {items.map((s, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11.5px] text-muted-foreground">
              <Check className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Simple status word for voice mode (no raw tool progress). */
export function voiceStatusWord(state: VoiceState, muted: boolean): string {
  if (state === "listening") return muted ? "Muted" : "Listening";
  if (state === "speaking") return "Speaking";
  if (state === "idle") return "Paused";
  return "Thinking";
}

/** Mute + end controls shared by expanded and collapsed voice views. */
function VoiceControls({ muted, onToggleMute, onEnd }: { muted: boolean; onToggleMute: () => void; onEnd: () => void }) {
  return (
    <>
      <Button variant="ghost"
        type="button"
        aria-label={muted ? "Unmute microphone" : "Mute microphone"}
        aria-pressed={muted}
        onClick={onToggleMute}
        className="bani-voice-mic shrink-0 rounded-full p-0"
      >
        {muted ? <MicOff className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}
      </Button>
      <Button variant="ghost"
        type="button"
        aria-label="End voice conversation"
        onClick={onEnd}
        className="bani-voice-end shrink-0 rounded-full p-0"
      >
        <X className="h-[18px] w-[18px]" />
      </Button>
    </>
  );
}

/** Orb mode from voice state: listening and speaking stay distinct. */
export function orbModeFor(state: VoiceState): BaniOrbMode {
  if (state === "thinking" || state === "transcribing") return "thinking";
  if (state === "speaking") return "speaking";
  if (state === "listening") return "listening";
  return "idle";
}
