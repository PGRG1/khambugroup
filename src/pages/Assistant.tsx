import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BaniOrb } from "@/components/assistant/BaniOrb";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, AudioLines, Mic, MicOff, Square, Plus, History, X, ChevronRight, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSpeechInput } from "@/hooks/useSpeechInput";
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

  const startNewConversation = () => {
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
    const trimmed = text.trim();
    if (!canSendFn({ text: trimmed, loading, scopeReady }) || !session || !active) return;

    const convId = active.id;
    const sentScope = scopeKey;
    requestScopeRef.current = sentScope;

    setInput("");
    const userMsg: Msg = { role: "user", content: trimmed };
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
      send(input);
    }
  };

  // Two-way voice conversation: MediaRecorder + bani-stt/bani-tts edge functions.
  // The loop (listening → thinking → speaking → listening) lives in the hook;
  // questions go through the normal send() path with voice flags, so the chat
  // history is identical to text mode.
  const [voiceMode, setVoiceMode] = useState(false);
  // Dictation (small mic): browser speech recognition fills the text box only.
  const dictationBaseRef = useRef("");
  const dictation = useSpeechInput({
    onTranscript: (t) => setInput(dictationBaseRef.current ? `${dictationBaseRef.current} ${t}` : t),
    onError: () => toast({ title: "Microphone unavailable. Check your browser permissions.", variant: "destructive" }),
  });
  const toggleDictation = () => {
    if (dictation.listening) { dictation.stop(); return; }
    dictationBaseRef.current = input.trim();
    dictation.start();
  };
  const dictationStopRef = useRef(dictation.stop);
  dictationStopRef.current = dictation.stop;
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
  const enterVoice = () => { dictation.stop(); voice.start(); setVoiceMode(true); };
  const cancelVoice = () => { voice.end(); setVoiceMode(false); };
  useEffect(() => {
    if (!voiceMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cancelVoice(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Voice mode is a calm full screen: hide the sidebar trigger and top-bar icons.
  useEffect(() => {
    document.body.classList.toggle("bani-voice-mode", voiceMode);
    return () => document.body.classList.remove("bani-voice-mode");
  }, [voiceMode]);

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
  const placement = composerPlacement(messages.length);
  const hasText = !!input.trim();

  const canSendNow = canSendFn({ text: input, loading, scopeReady });

  const Composer = (
    <div className="relative w-full">
      <div className="bani-glass bani-composer flex items-end gap-1 rounded-[24px] py-2 pl-[18px] pr-2">
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
        {dictation.supported && (
          <button
            type="button"
            onClick={toggleDictation}
            disabled={!scopeReady || loading}
            aria-label={dictation.listening ? "Stop dictation" : "Start dictation"}
            className={`bani-mic relative mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full disabled:opacity-40 ${dictation.listening ? "bani-mic-pulse" : ""}`}
            style={{ color: dictation.listening ? "#1F3A37" : "#5B706B" }}
          >
            {dictation.listening ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
        <button
          type="button"
          onClick={loading ? stop : hasText ? () => { dictation.stop(); send(input); } : enterVoice}
          disabled={loading ? false : hasText ? !canSendNow : !scopeReady}
          aria-label={loading ? "Stop generating" : hasText ? "Send question" : "Start voice conversation"}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-opacity"
          style={{ background: "#1F3A37", opacity: loading || !hasText || canSendNow ? 1 : 0.45 }}
        >
          <span className="bani-ico" style={{ opacity: loading ? 1 : 0 }}><Square className="h-3.5 w-3.5 fill-current" /></span>
          <span className="bani-ico" style={{ opacity: !loading && hasText ? 1 : 0 }}><ArrowUp className="h-4 w-4" /></span>
          <span className="bani-ico" style={{ opacity: !loading && !hasText ? 1 : 0 }}><AudioLines className="h-4 w-4" /></span>
        </button>
      </div>
      {!scopeReady && (
        <p className="mt-2 text-center text-xs text-white/80">
          {tenantLoading ? "Loading your workspace…" : "Select a workspace to ask questions."}
        </p>
      )}
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
    <div className="relative flex min-h-0 w-full flex-col" style={{ height: "calc(100dvh - 4rem)" }}>
      <style>{`
        .bani-glass{background:rgba(255,255,255,0.84);-webkit-backdrop-filter:blur(16px) saturate(140%);backdrop-filter:blur(16px) saturate(140%);border:1px solid rgba(255,255,255,0.65);box-shadow:inset 0 1px 0 rgba(255,255,255,0.8),0 14px 36px -12px rgba(20,45,43,0.30);}
        .bani-composer{transition:border-color 150ms,box-shadow 150ms}
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
        body.bani-voice-mode [data-sidebar="trigger"]{display:none}
        @media (prefers-reduced-motion: reduce){.bani-mic-pulse,.bani-fade,.bani-dots,.bani-orb-speaking{animation:none}.bani-orb-level{transform:none !important}}
      `}</style>

      {topbarTarget && !voiceMode && createPortal(topbarActions, topbarTarget)}


      {voiceMode ? (
        <VoicePanel
          state={voice.state}
          level={voice.level}
          muted={voice.muted}
          needsTap={voice.needsTap}
          userWords={voice.userWords}
          userWordsLive={voice.userWordsLive}
          stepLabel={voice.stepLabel}
          reveal={voice.reveal}
          notice={voice.notice}
          onToggleMute={voice.toggleMute}
          onEnd={cancelVoice}
          onOrbTap={voice.interrupt}
        />
      ) : placement === "welcome" ? (
        <div className="flex min-h-0 flex-1 flex-col px-4">
          <div style={{ flex: 42 }} />
          <div className="mx-auto w-full max-w-[640px]">
            {Composer}
            <div className="mt-3 min-h-[30px]">
              {focused && !input && (
                <div className="bani-fade flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map(({ text, label }) => (
                    <button
                      key={text}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => send(text)}
                      disabled={!scopeReady || loading}
                      className="rounded-full px-3 py-1.5 text-xs disabled:opacity-50"
                      style={{ background: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.7)", color: "#1F3A37" }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
            style={{ paddingBottom: "calc(150px + env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto w-full max-w-[720px] space-y-5">
              {messages.map((m, i) => {
                const inFlight = loading && i === messages.length - 1 && m.role === "assistant" && !m.content;
                if (inFlight) return <ThinkingLine key={i} label={m.steps?.[m.steps.length - 1]?.label} />;
                return <MessageBlock key={i} msg={m} />;
              })}
              {loading && messages[messages.length - 1]?.role === "user" && <ThinkingLine />}
            </div>
          </div>
          <div
            className="pointer-events-none absolute inset-x-0 px-4"
            style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}
          >
            <div className="pointer-events-auto mx-auto w-full max-w-[640px]">
              {Composer}
              <p className="mt-2 text-center text-[10px]" style={{ color: "rgba(20,45,43,0.5)" }}>{DISCLAIMER}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MessageBlock({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[80%] px-4 py-2.5 text-sm text-white"
          style={{ background: "rgba(255,255,255,0.28)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: "18px 18px 4px 18px" }}
        >
          <p className="whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bani-glass bani-fade rounded-[18px] px-[18px] py-4" style={{ color: "#14302D" }}>
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
                <div className="my-3 overflow-x-auto">
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

/** Reveals Bani's words one by one, roughly in sync with the audio clip. */
function RevealWords({ text, durationMs }: { text: string; durationMs: number }) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(0);
    if (!words.length) return;
    const per = Math.max(70, durationMs / words.length);
    const iv = setInterval(() => setCount((c) => Math.min(words.length, c + 1)), per);
    return () => clearInterval(iv);
  }, [text, durationMs, words.length]);
  return <span>{words.slice(0, count).join(" ")}</span>;
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
      <button
        type="button"
        aria-label={muted ? "Unmute microphone" : "Mute microphone"}
        aria-pressed={muted}
        onClick={onToggleMute}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white"
        style={{ background: muted ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.22)" }}
      >
        {muted ? <MicOff className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}
      </button>
      <button
        type="button"
        aria-label="End voice conversation"
        onClick={onEnd}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white"
        style={{ background: "rgba(220,80,80,0.85)" }}
      >
        <X className="h-[18px] w-[18px]" />
      </button>
    </>
  );
}

function VoicePanel({ state, level, muted, needsTap, userWords, userWordsLive, reveal, notice, onOrbTap, onCollapse, footer }: {
  state: VoiceState;
  level: number;
  muted: boolean;
  needsTap: boolean;
  userWords: string;
  userWordsLive: boolean;
  reveal: Reveal;
  notice: string;
  onOrbTap: () => void;
  onCollapse: () => void;
  footer: React.ReactNode;
}) {
  const listening = state === "listening";
  const speaking = state === "speaking";
  const thinking = state === "thinking" || state === "transcribing";
  const orbMode = thinking ? "thinking" : listening || speaking ? "listening" : "idle";
  const scale = listening ? 1 + Math.min(1, Math.max(0, level)) * 0.15 : 1;
  const orbLabel =
    thinking || speaking ? "Interrupt and talk"
      : state === "idle" ? "Tap the orb to talk"
      : "Listening";
  const isPhone = typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px)").matches;
  // Drag-down to collapse: only the handle captures the pointer, so the rest
  // of the screen (and the transcript later) scrolls normally.
  const [dy, setDy] = useState(0);
  const dragRef = useRef<{ y: number; id: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    dragRef.current = { y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current || dragRef.current.id !== e.pointerId) return;
    setDy(Math.max(0, e.clientY - dragRef.current.y));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    const moved = Math.max(0, e.clientY - dragRef.current.y);
    dragRef.current = null;
    setDy(0);
    if (moved > 70) onCollapse();
  };
  return (
    <div
      className="bani-fade flex min-h-0 flex-1 flex-col items-center px-4"
      style={{
        paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
        transform: dy ? `translateY(${dy}px)` : undefined,
        opacity: dy ? Math.max(0.4, 1 - dy / 400) : 1,
        transition: dy ? "none" : "transform 200ms ease, opacity 200ms ease",
      }}
    >
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { dragRef.current = null; setDy(0); }}
        onClick={(e) => { if (e.detail === 0) onCollapse(); }}
        aria-label="Show chat (voice stays on)"
        title="Drag down or click to show chat"
        className="flex w-full max-w-[240px] flex-col items-center gap-1 pb-2 pt-1 text-white"
        style={{ touchAction: "none", cursor: "grab" }}
      >
        <span className="block h-1.5 w-11 rounded-full" style={{ background: "rgba(255,255,255,0.55)" }} />
      </button>
      <button
        type="button"
        onClick={onCollapse}
        className="flex items-center gap-1 rounded-full px-3 py-1 text-[12px] text-white"
        style={{ background: "rgba(255,255,255,0.14)" }}
      >
        <ChevronDown className="h-3.5 w-3.5" /> Show chat
      </button>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
        <button
          type="button"
          onClick={onOrbTap}
          aria-label={orbLabel}
          className={`bani-orb-level rounded-full transition-transform duration-200 ${speaking ? "bani-orb-speaking" : ""}`}
          style={speaking ? undefined : { transform: `scale(${scale})` }}
        >
          <BaniOrb size={isPhone ? 120 : 140} mode={orbMode} />
        </button>
        <p className="text-[13px] font-medium tracking-wide text-white" style={{ opacity: 0.75 }} role="status" aria-live="polite">
          {voiceStatusWord(state, muted)}
        </p>
        <div className="w-full max-w-[520px] text-center" style={{ minHeight: 84 }}>
          {speaking && reveal ? (
            <p className="line-clamp-4 text-[17px] leading-[1.5] text-white">
              {reveal.prior ? <span>{reveal.prior} </span> : null}
              <RevealWords key={reveal.id} text={reveal.text} durationMs={reveal.durationMs} />
            </p>
          ) : notice ? (
            <p className="bani-fade text-[15px] text-white" style={{ opacity: 0.8 }}>{notice}</p>
          ) : needsTap ? (
            <p className="bani-fade text-[15px] text-white" style={{ opacity: 0.8 }}>Tap the orb to talk</p>
          ) : userWords ? (
            <p className="line-clamp-4 text-[17px] leading-[1.5] text-white" style={{ opacity: userWordsLive ? 0.7 : 0.85 }}>
              {userWords}
            </p>
          ) : null}
        </div>
      </div>
      <div className="w-full max-w-[640px]">{footer}</div>
    </div>
  );
}
