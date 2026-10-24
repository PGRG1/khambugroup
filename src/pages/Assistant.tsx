import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BaniOrb } from "@/components/assistant/BaniOrb";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Mic, Square, Plus, History, X, ChevronRight, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useVoiceConversation, type SpeakEvent } from "@/hooks/useVoiceConversation";
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

  const enterVoice = () => { setVoiceMode(true); voice.start(); };
  const cancelVoice = () => { voice.end(); setVoiceMode(false); };
  useEffect(() => {
    if (!voiceMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cancelVoice(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
          placeholder={speech.listening ? "Listening…" : "Ask Bani…"}
          aria-label="Ask Bani a question"
          rows={1}
          className="bani-input bani-ask-input min-h-[36px] flex-1 resize-none self-center py-[7px] text-[15px] leading-[22px]"
        />
        {speech.supported && (
          <button
            type="button"
            onClick={speech.listening ? speech.stop : enterVoice}
            disabled={!speech.listening && (!scopeReady || loading)}
            aria-label={speech.listening ? "Stop voice input" : "Start voice input"}
            className="bani-mic relative mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
            style={{ color: speech.listening ? "#1F3A37" : "#5B706B" }}
          >
            {speech.listening && <span className="bani-mic-pulse pointer-events-none absolute inset-0 rounded-full" />}
            {speech.listening ? <Square className="h-3.5 w-3.5 fill-current" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
        <button
          type="button"
          onClick={loading ? stop : () => send(input)}
          disabled={!loading && !canSendNow}
          aria-label={loading ? "Stop generating" : "Send question"}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-opacity"
          style={{ background: "#1F3A37", opacity: loading || canSendNow ? 1 : 0.45, pointerEvents: loading || canSendNow ? "auto" : "none" }}
        >
          {loading ? <Square className="h-3.5 w-3.5 fill-current" /> : <ArrowUp className="h-4 w-4" />}
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
        .bani-mic{background:transparent}.bani-mic:hover:not(:disabled){background:rgba(20,45,43,0.06)}
        .bani-input{color:#14302D}.bani-input::placeholder{color:#7A8C88}
        @keyframes bani-pulse{0%{box-shadow:0 0 0 0 rgba(31,58,55,0.35)}100%{box-shadow:0 0 0 7px rgba(31,58,55,0)}}
        .bani-mic-pulse{animation:bani-pulse 1.4s ease-out infinite}
        @keyframes bani-fade{from{opacity:0}to{opacity:1}}
        .bani-fade{animation:bani-fade 200ms ease-out}
        @keyframes bani-dots{0%,100%{opacity:.25}50%{opacity:1}}
        .bani-dots{animation:bani-dots 1.4s ease-in-out infinite}
        @media (prefers-reduced-motion: reduce){.bani-mic-pulse,.bani-fade,.bani-dots{animation:none}}
      `}</style>

      {topbarTarget && createPortal(topbarActions, topbarTarget)}


      {voiceMode ? (
        <VoicePanel listening={speech.listening} transcript={voiceText} onCancel={cancelVoice} onSend={sendVoice} />
      ) : placement === "welcome" ? (
        <div className="flex min-h-0 flex-1 flex-col px-4">
          <div style={{ flex: 42 }} />
          <div className="mx-auto w-full max-w-[640px]">
            {Composer}
            <div className="mt-3 min-h-[30px]">
              {focused && !input && !speech.listening && (
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

function ThinkingLine({ label }: { label?: string }) {
  const target = label || "Reading your question";
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

function VoicePanel({ listening, transcript, onCancel, onSend }: { listening: boolean; transcript: string; onCancel: () => void; onSend: () => void }) {
  const has = !!transcript.trim();
  return (
    <div className="bani-fade flex min-h-0 flex-1 flex-col items-center px-6" style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}>
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <BaniOrb size={110} mode={listening ? "listening" : "idle"} />
        <p className="text-[14px] text-white">{listening ? "Listening…" : has ? "Ready to send" : "Listening…"}</p>
        <p className="line-clamp-3 max-w-[480px] text-center text-[13px]" style={{ color: "rgba(255,255,255,0.85)", minHeight: 20 }}>{transcript}</p>
      </div>
      <div className="flex items-center gap-6">
        <button type="button" aria-label="Cancel voice input" onClick={onCancel} className="flex h-11 w-11 items-center justify-center rounded-full text-white" style={{ background: "rgba(255,255,255,0.3)" }}>
          <X className="h-5 w-5" />
        </button>
        <button type="button" aria-label="Send" onClick={onSend} disabled={!has} className="flex h-11 w-11 items-center justify-center rounded-full text-white" style={{ background: "#1F3A37", opacity: has ? 1 : 0.45 }}>
          <ArrowUp className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
