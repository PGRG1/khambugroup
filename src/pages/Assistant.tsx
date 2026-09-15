import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BaniProcessingMark } from "@/components/brand/BaniProcessingMark";
import { BaniLoginMark } from "@/components/brand/BaniLoginMark";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send,
  Sparkles,
  User,
  Square,
  Plus,
  TrendingDown,
  Truck,
  Users,
  Target,
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

const SUGGESTIONS: { text: string; Icon: typeof TrendingDown }[] = [
  { text: "Where am I losing margin this month?", Icon: TrendingDown },
  { text: "Which suppliers raised prices in the last 90 days?", Icon: Truck },
  { text: "Compare labour cost against revenue", Icon: Users },
  { text: "What should I focus on this week?", Icon: Target },
];

const DISCLAIMER = "Bani can make mistakes. Verify before taking action.";

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
      send(input);
    }
  };

  const history = visibleConversations(conversations, activeId);
  const placement = composerPlacement(messages.length);

  const Composer = (
    <div className="w-full">
      <div className="flex items-end gap-2 rounded-2xl border border-border bg-card/70 p-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; }}
          onKeyDown={onKeyDown}
          placeholder="Ask about revenue, margins, suppliers, labour, or cash flow…"
          aria-label="Ask Bani Analyst a question"
          rows={1}
          className="min-h-[44px] max-h-[180px] resize-none border-0 bg-transparent text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        {loading ? (
          <Button onClick={stop} variant="secondary" className="h-10 shrink-0 gap-1.5 rounded-xl" aria-label="Stop generating">
            <Square className="h-3.5 w-3.5" />
            Stop
          </Button>
        ) : (
          <Button
            onClick={() => send(input)}
            disabled={!canSendFn({ text: input, loading, scopeReady })}
            className="h-10 shrink-0 gap-1.5 rounded-xl"
            aria-label="Send question"
          >
            <Send className="h-3.5 w-3.5" />
            Ask
          </Button>
        )}
      </div>
      {!scopeReady && (
        <p className="mt-2 text-xs text-muted-foreground">
          {tenantLoading ? "Loading your workspace…" : "Select a workspace to ask questions."}
        </p>
      )}
      <p className="mt-2 text-center text-[11px] text-muted-foreground">{DISCLAIMER}</p>
    </div>
  );

  return (
    <div className="flex min-h-0 w-full flex-col" style={{ height: "calc(100dvh - 4rem)" }}>
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <BaniLoginMark className="h-5 w-[11px] shrink-0 text-foreground" />
          <span className="font-display text-sm tracking-tight">BANI</span>
          <span className="text-xs text-muted-foreground">AI Analyst</span>
        </div>
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={startNewConversation} aria-label="Start a new conversation">
          <Plus className="h-3.5 w-3.5" />
          New
        </Button>
      </header>

      {/* Scrollable body */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        data-testid="assistant-scroll"
        className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6"
      >
        {placement === "welcome" ? (
          <div className="mx-auto w-full max-w-[820px]">
            <div className="mb-6 flex items-center gap-2 text-sage">
              <Sparkles className="h-4 w-4" />
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Bani Analyst</span>
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              What would you like to understand?
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask about revenue, margins, suppliers, labour, or cash flow.
            </p>

            <div className="mt-7">{Composer}</div>

            <div className="mt-7 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map(({ text, Icon }) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => send(text)}
                  disabled={!scopeReady || loading}
                  className={cn(
                    "flex items-start gap-2.5 rounded-xl border border-border bg-card/60 px-4 py-3 text-left text-sm transition-colors",
                    "hover:border-sage/40 hover:bg-card disabled:opacity-50",
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-sage" />
                  <span>{text}</span>
                </button>
              ))}
            </div>

            {history.length > 0 && (
              <div className="mt-9">
                <p className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Recent conversations · This session
                </p>
                <div className="flex flex-col gap-1">
                  {history.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setActiveId(c.id)}
                      className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{c.title}</span>
                    </button>
                  ))}
                </div>
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
                <BaniLoginMark className="mt-1 h-4 w-[9px] shrink-0 text-sage" />
                <BaniProcessingMark size={22} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Docked composer during an active chat */}
      {placement === "docked" && (
        <div className="shrink-0 border-t border-border bg-background px-4 pb-4 pt-3 sm:px-6">
          <div className="mx-auto w-full max-w-[820px]">{Composer}</div>
        </div>
      )}
    </div>
  );
}

function MessageBlock({ msg }: { msg: Msg }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end gap-3">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-secondary px-4 py-2.5 text-sm text-secondary-foreground">
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
      <BaniLoginMark className="mt-1.5 h-4 w-[9px] shrink-0 text-sage" />
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
