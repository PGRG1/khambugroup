import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { BaniProcessingMark } from "@/components/brand/BaniProcessingMark";
import { BaniLoginMark } from "@/components/brand/BaniLoginMark";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send,
  Square,
  User,
  Sparkles,
  TrendingDown,
  Truck,
  Users,
  Compass,
  Plus,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useActiveTenant } from "@/hooks/useActiveTenant";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { AssistantChart, type ChartSpec } from "@/components/assistant/AssistantChart";
import {
  ASSISTANT_DISCLAIMER,
  ASSISTANT_SUGGESTIONS,
  buildRequestBody,
  canSend as canSendMessage,
  conversationTitle,
  newConversation,
  sessionScopeKey,
  shouldResetForScope,
  type AssistantConversation,
  type AssistantMessage,
} from "@/utils/assistantSession";

const SUGGESTION_ICONS: Record<string, typeof TrendingDown> = {
  margin: TrendingDown,
  suppliers: Truck,
  labour: Users,
  focus: Compass,
};

type Msg = AssistantMessage & { charts?: ChartSpec[] };

const makeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `c-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function Assistant() {
  const { session, user } = useAuth();
  const { tenantId, loading: tenantLoading } = useActiveTenant();

  const [conversations, setConversations] = useState<AssistantConversation[]>(() => [newConversation(makeId())]);
  const [activeId, setActiveId] = useState<string>(() => "");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const requestSeq = useRef(0);
  const scopeRef = useRef<string | null>(null);

  const scopeKey = sessionScopeKey(user?.id, tenantId);
  const scopeReady = !tenantLoading && !!tenantId;

  // Keep an active conversation id in sync with the list.
  useEffect(() => {
    if (!conversations.some((c) => c.id === activeId)) {
      setActiveId(conversations[0]?.id ?? "");
    }
  }, [conversations, activeId]);

  // Any user or tenant change wipes every session conversation, aborts the
  // in-flight request and invalidates late responses.
  useEffect(() => {
    if (!shouldResetForScope(scopeRef.current, scopeKey)) return;
    scopeRef.current = scopeKey;
    requestSeq.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setInput("");
    const fresh = newConversation(makeId());
    setConversations([fresh]);
    setActiveId(fresh.id);
  }, [scopeKey]);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? conversations[0],
    [conversations, activeId],
  );
  const messages = (active?.messages ?? []) as Msg[];
  const isEmpty = messages.length === 0;

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    if (!pinnedRef.current) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const patchActive = useCallback(
    (id: string, updater: (c: AssistantConversation) => AssistantConversation) => {
      setConversations((prev) => prev.map((c) => (c.id === id ? updater(c) : c)));
    },
    [],
  );

  const startNewConversation = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    requestSeq.current += 1;
    setLoading(false);
    setInput("");
    const fresh = newConversation(makeId());
    setConversations((prev) => [fresh, ...prev.filter((c) => c.messages.length > 0)]);
    setActiveId(fresh.id);
  };

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!canSendMessage({ text: trimmed, loading, hasSession: !!session, scopeReady })) {
      if (!scopeReady && !!session && trimmed) {
        toast({
          title: "No workspace selected",
          description: "Select a workspace before asking Bani a question.",
          variant: "destructive",
        });
      }
      return;
    }
    const convId = active?.id;
    if (!convId) return;

    setInput("");
    pinnedRef.current = true;
    const userMsg: Msg = { role: "user", content: trimmed };
    const nextMessages: Msg[] = [...messages, userMsg];
    patchActive(convId, (c) => ({
      ...c,
      title: c.messages.length === 0 ? conversationTitle(trimmed) : c.title,
      messages: nextMessages,
    }));
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++requestSeq.current;
    const isStale = () => seq !== requestSeq.current;

    let assistantSoFar = "";
    const collectedCharts: ChartSpec[] = [];
    const upsert = (chunk: string, chart?: ChartSpec) => {
      if (isStale()) return;
      if (chunk) assistantSoFar += chunk;
      if (chart) collectedCharts.push(chart);
      patchActive(convId, (c) => {
        const last = c.messages[c.messages.length - 1];
        const payload: Msg = {
          role: "assistant",
          content: assistantSoFar,
          charts: [...collectedCharts],
        };
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
          Authorization: `Bearer ${session!.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(buildRequestBody(nextMessages, tenantId!)),
        signal: controller.signal,
      });

      if (isStale()) return;

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({ error: "Request failed" }));
        if (isStale()) return;
        if (resp.status === 429) toast({ title: "Rate limited", description: errBody.error, variant: "destructive" });
        else if (resp.status === 402)
          toast({ title: "Credits exhausted", description: errBody.error, variant: "destructive" });
        else toast({ title: "Assistant error", description: errBody.error || "Try again.", variant: "destructive" });
        return;
      }

      if (!resp.body) throw new Error("No response body");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;

      while (!done) {
        const { done: d, value } = await reader.read();
        if (d || isStale()) break;
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
            if (parsed.chart) upsert("", parsed.chart as ChartSpec);
            else {
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
      if (e?.name !== "AbortError" && !isStale()) {
        console.error(e);
        toast({ title: "Assistant error", description: e?.message, variant: "destructive" });
      }
    } finally {
      if (!isStale()) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  };

  const recent = conversations.filter((c) => c.messages.length > 0);
  const sendDisabled = !canSendMessage({ text: input, loading, hasSession: !!session, scopeReady });

  const composer = (
    <div className="w-full">
      <div className="flex items-end gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, except while an IME composition is active.
            const composing = (e.nativeEvent as KeyboardEvent).isComposing;
            if (e.key === "Enter" && !e.shiftKey && !composing) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={
            scopeReady ? "Ask about revenue, margins, suppliers, labour, or cash flow…" : "Loading your workspace…"
          }
          aria-label="Ask Bani Analyst"
          rows={isEmpty ? 3 : 1}
          className={cn(
            "resize-none rounded-xl border-border/70 bg-card/60 text-sm backdrop-blur",
            isEmpty ? "min-h-[92px] max-h-[220px]" : "min-h-[48px] max-h-[180px]",
          )}
          disabled={loading || !scopeReady}
        />
        {loading ? (
          <Button
            type="button"
            onClick={stop}
            variant="outline"
            aria-label="Stop generating"
            className="h-11 shrink-0 gap-2 rounded-xl px-3"
          >
            <Square className="h-3.5 w-3.5" />
            <span className="hidden text-xs sm:inline">Stop</span>
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => send(input)}
            disabled={sendDisabled}
            aria-label="Send message"
            className="h-11 shrink-0 gap-2 rounded-xl px-3"
          >
            <Send className="h-4 w-4" />
            <span className="hidden text-xs sm:inline">Send</span>
          </Button>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">{ASSISTANT_DISCLAIMER}</p>
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-0 w-full flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <BaniLoginMark className="h-6 w-auto text-primary" />
          <div className="leading-tight">
            <span className="font-display text-sm font-semibold tracking-[0.18em] text-foreground">BANI</span>
            <span className="ml-2 text-xs text-muted-foreground">AI Analyst</span>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={startNewConversation} className="gap-2 text-xs">
          <Plus className="h-3.5 w-3.5" />
          New conversation
        </Button>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        data-testid="assistant-scroll"
        className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6"
      >
        {isEmpty ? (
          <div className="mx-auto w-full max-w-[820px] pt-4 sm:pt-8">
            <span className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/70 bg-card/60">
              <Sparkles className="h-4 w-4 text-primary" />
            </span>
            <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
              What would you like to understand?
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask about revenue, margins, suppliers, labour, or cash flow.
            </p>

            <div className="mt-6">{composer}</div>

            <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ASSISTANT_SUGGESTIONS.map((s) => {
                const Icon = SUGGESTION_ICONS[s.id] ?? Sparkles;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => send(s.prompt)}
                    disabled={!scopeReady || loading}
                    className="flex items-start gap-3 rounded-xl border border-border/70 bg-card/50 px-4 py-3 text-left text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-card disabled:opacity-50"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{s.prompt}</span>
                  </button>
                );
              })}
            </div>

            {recent.length > 0 && (
              <div className="mt-8">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Recent conversations · This session
                </p>
                <ul className="mt-2 space-y-1">
                  {recent.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setActiveId(c.id)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                      >
                        <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{c.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[820px] space-y-6">
            {messages.map((m, i) => (
              <MessageBlock key={i} msg={m} />
            ))}
            {loading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex gap-3">
                <BaniProcessingMark size={20} className="mt-0.5" />
                <span className="text-sm text-muted-foreground">Working…</span>
              </div>
            )}
          </div>
        )}
      </div>

      {!isEmpty && (
        <div className="border-t border-border/70 bg-background px-4 pb-4 pt-3 sm:px-6">
          <div className="mx-auto w-full max-w-[820px]">{composer}</div>
        </div>
      )}
    </div>
  );
}

function MessageBlock({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end gap-3">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          <p className="whitespace-pre-wrap">{msg.content}</p>
        </div>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <BaniLoginMark className="mt-1 h-4 w-auto shrink-0 text-primary" />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="prose prose-sm dark:prose-invert max-w-none
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
                <div className="my-3 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full border-collapse text-sm" {...props} />
                </div>
              ),
              thead: ({ node, ...props }) => <thead className="bg-muted/60" {...props} />,
              th: ({ node, ...props }) => (
                <th className="border-b border-border px-3 py-2 text-left font-semibold text-foreground" {...props} />
              ),
              td: ({ node, ...props }) => (
                <td className="border-b border-border/50 px-3 py-2 last:border-0" {...props} />
              ),
              tr: ({ node, ...props }) => <tr className="even:bg-muted/20" {...props} />,
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
