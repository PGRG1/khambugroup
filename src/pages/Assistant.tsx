import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BaniProcessingMark } from "@/components/brand/BaniProcessingMark";
import { BaniLoginMark } from "@/components/brand/BaniLoginMark";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Mic, Square, Plus, History } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSpeechInput } from "@/hooks/useSpeechInput";
import { useAuth } from "@/hooks/useAuth";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { toast } from "@/hooks/use-toast";
import { AssistantChart, type ChartSpec } from "@/components/assistant/AssistantChart";
import {
  assistantScopeKey,
  canSend as canSendFn,
  composerPlacement,
  conversationTitle,
  createConversation,
  toRequestMessages,
  upsertConversation,
  visibleConversations,
  type AssistantConversation,
  type AssistantMessage,
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

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  };

  const send = async (text: string) => {
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

    let assistantSoFar = "";
    const collectedCharts: ChartSpec[] = [];
    const stale = () => requestScopeRef.current !== sentScope || controller.signal.aborted;
    const upsert = (chunk: string, chart?: ChartSpec) => {
      if (stale()) return;
      if (chunk) assistantSoFar += chunk;
      if (chart) collectedCharts.push(chart);
      patchActive(convId, (c) => {
        const payload: Msg = { role: "assistant", content: assistantSoFar, charts: [...collectedCharts] };
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
            break;
          }
          try {
            const parsed = JSON.parse(json);
            if (parsed.chart) {
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
      speech.stop();
      send(input);
    }
  };

  // Voice input (browser only, never auto-sends).
  const voiceBaseRef = useRef("");
  const speech = useSpeechInput({
    onTranscript: (t) => {
      const base = voiceBaseRef.current;
      setInput(base ? `${base} ${t}` : t);
    },
    onError: () =>
      toast({ title: "Microphone unavailable. Check your browser permissions.", variant: "destructive" }),
  });
  const speechStopRef = useRef(speech.stop);
  speechStopRef.current = speech.stop;
  useEffect(() => { speechStopRef.current(); }, [scopeKey]);

  const [focused, setFocused] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [input]);

  const history = visibleConversations(conversations, activeId);
  const placement = composerPlacement(messages.length);
  const hasText = !!input.trim();

  const actionButton = () => {
    if (loading)
      return { icon: <Square className="h-3.5 w-3.5 fill-current" />, label: "Stop generating", onClick: stop, disabled: false };
    if (speech.listening)
      return { icon: <Square className="h-3.5 w-3.5 fill-current" />, label: "Stop voice input", onClick: speech.stop, disabled: false };
    if (!hasText && speech.supported)
      return {
        icon: <Mic className="h-4 w-4" />,
        label: "Start voice input",
        onClick: () => { voiceBaseRef.current = input.trim(); speech.start(); },
        disabled: !scopeReady,
      };
    return {
      icon: <ArrowUp className="h-4 w-4" />,
      label: "Send question",
      onClick: () => send(input),
      disabled: !canSendFn({ text: input, loading, scopeReady }),
    };
  };
  const btn = actionButton();

  const Composer = (
    <div className="relative w-full">
      <div className="bani-glass flex items-end gap-2 rounded-[24px] py-2 pl-[18px] pr-2 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-white/70">
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
          className="bani-input min-h-[36px] flex-1 resize-none self-center border-0 bg-transparent py-[7px] text-[15px] leading-[22px] outline-none"
        />
        <button
          type="button"
          onClick={btn.onClick}
          disabled={btn.disabled}
          aria-label={btn.label}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-40"
          style={{ background: "#1F3A37" }}
        >
          {speech.listening && <span className="bani-mic-pulse pointer-events-none absolute inset-0 rounded-full" />}
          {btn.icon}
        </button>
      </div>
      {!scopeReady && (
        <p className="mt-2 text-center text-xs text-white/80">
          {tenantLoading ? "Loading your workspace…" : "Select a workspace to ask questions."}
        </p>
      )}
    </div>
  );

  return (
    <div className="relative flex min-h-0 w-full flex-col" style={{ height: "calc(100dvh - 4rem)" }}>
      <style>{`
        .bani-glass{background:rgba(255,255,255,0.84);-webkit-backdrop-filter:blur(16px) saturate(140%);backdrop-filter:blur(16px) saturate(140%);border:1px solid rgba(255,255,255,0.65);box-shadow:inset 0 1px 0 rgba(255,255,255,0.8),0 14px 36px -12px rgba(20,45,43,0.30);}
        .bani-input{color:#14302D}.bani-input::placeholder{color:#7A8C88}
        @keyframes bani-pulse{0%{box-shadow:0 0 0 0 rgba(255,255,255,0.55)}100%{box-shadow:0 0 0 9px rgba(255,255,255,0)}}
        .bani-mic-pulse{animation:bani-pulse 1.4s ease-out infinite}
        @keyframes bani-fade{from{opacity:0}to{opacity:1}}
        .bani-fade{animation:bani-fade 150ms ease-out}
        @media (prefers-reduced-motion: reduce){.bani-mic-pulse,.bani-fade{animation:none}}
      `}</style>

      {/* Top-right controls */}
      <div className="absolute right-2 top-2 z-20 flex gap-2 sm:right-4 sm:top-3">
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" aria-label="Recent chats" className="flex h-8 w-8 items-center justify-center rounded-full text-white/90" style={{ background: "rgba(255,255,255,0.16)" }}>
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
          onClick={() => { speech.stop(); startNewConversation(); }}
          className="flex h-8 w-8 items-center justify-center rounded-full text-white/90"
          style={{ background: "rgba(255,255,255,0.16)" }}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {placement === "welcome" ? (
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
                      className="rounded-full px-3 py-1.5 text-xs text-white disabled:opacity-50"
                      style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.55)" }}
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
              {messages.map((m, i) => (
                <MessageBlock key={i} msg={m} />
              ))}
              {loading && messages[messages.length - 1]?.role === "user" && (
                <div className="bani-glass inline-flex rounded-[18px] px-[18px] py-4">
                  <BaniProcessingMark size={22} />
                </div>
              )}
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
    <div className="bani-glass rounded-[18px] px-[18px] py-4" style={{ color: "#14302D" }}>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <BaniLoginMark className="h-3.5 w-[7px] shrink-0 text-sage" />
        <span>Bani</span>
      </div>
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
