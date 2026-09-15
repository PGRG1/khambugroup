// Pure helpers for the Bani Analyst chat page.
// Conversations are SESSION-ONLY: held in React state, keyed by authenticated
// user + active tenant, never persisted to the database or browser storage.

export type AssistantRole = "user" | "assistant";

export type AssistantMessage<C = unknown> = {
  role: AssistantRole;
  content: string;
  charts?: C[];
};

export type AssistantConversation<C = unknown> = {
  id: string;
  title: string;
  messages: AssistantMessage<C>[];
  createdAt: number;
};

/** Identity of the current data scope. Null when either half is unresolved. */
export function assistantScopeKey(userId?: string | null, tenantId?: string | null): string | null {
  if (!userId || !tenantId) return null;
  return `${userId}::${tenantId}`;
}

export function scopeChanged(prev: string | null, next: string | null): boolean {
  return prev !== next;
}

/** Short title derived from the first user message. */
export function conversationTitle(text: string, maxLen = 48): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "New conversation";
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1).trimEnd()}…`;
}

export function createConversation<C = unknown>(id: string, now = Date.now()): AssistantConversation<C> {
  return { id, title: "New conversation", messages: [], createdAt: now };
}

/** Insert or replace a conversation, newest first. */
export function upsertConversation<C = unknown>(
  list: AssistantConversation<C>[],
  conv: AssistantConversation<C>,
): AssistantConversation<C>[] {
  const idx = list.findIndex((c) => c.id === conv.id);
  if (idx === -1) return [conv, ...list];
  const next = [...list];
  next[idx] = conv;
  return next;
}

/** Only conversations that actually contain messages are listed as history. */
export function visibleConversations<C = unknown>(
  list: AssistantConversation<C>[],
  activeId: string | null,
): AssistantConversation<C>[] {
  return list.filter((c) => c.messages.length > 0 || c.id === activeId).filter((c) => c.messages.length > 0);
}

/** Empty state puts the composer under the heading; an active chat pins it to the bottom. */
export function composerPlacement(messageCount: number): "welcome" | "docked" {
  return messageCount === 0 ? "welcome" : "docked";
}

export function canSend(opts: {
  text: string;
  loading: boolean;
  scopeReady: boolean;
}): boolean {
  return !!opts.text.trim() && !opts.loading && opts.scopeReady;
}

/** Only send user/assistant turns to the server; strip client-side chart payloads. */
export function toRequestMessages<C = unknown>(messages: AssistantMessage<C>[]): { role: AssistantRole; content: string }[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));
}
