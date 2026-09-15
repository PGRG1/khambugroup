// Session-only conversation state for Bani Analyst.
// Finance chats are never persisted to the database or to browser storage —
// they live in memory for the current tab session only, scoped to the
// authenticated user AND the active tenant.

export type AssistantRole = "user" | "assistant";

export type AssistantMessage = {
  role: AssistantRole;
  content: string;
  charts?: unknown[];
};

export type AssistantConversation = {
  id: string;
  title: string;
  messages: AssistantMessage[];
  createdAt: number;
};

/** Identity of the current data scope. Any change must reset chat state. */
export function sessionScopeKey(userId?: string | null, tenantId?: string | null): string | null {
  if (!userId || !tenantId) return null;
  return `${userId}::${tenantId}`;
}

export function shouldResetForScope(previous: string | null, next: string | null): boolean {
  return previous !== next;
}

export function newConversation(id: string, now = Date.now()): AssistantConversation {
  return { id, title: "New conversation", messages: [], createdAt: now };
}

export function conversationTitle(firstUserMessage: string): string {
  const clean = firstUserMessage.replace(/\s+/g, " ").trim();
  if (!clean) return "New conversation";
  return clean.length > 48 ? `${clean.slice(0, 47)}…` : clean;
}

/** Strip charts and any non user/assistant role before sending to the server. */
export function sanitizeOutbound(messages: AssistantMessage[]): { role: AssistantRole; content: string }[] {
  return messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content }));
}

export function buildRequestBody(
  messages: AssistantMessage[],
  tenantId: string,
): { messages: { role: AssistantRole; content: string }[]; tenant_id: string } {
  return { messages: sanitizeOutbound(messages), tenant_id: tenantId };
}

export function canSend(args: {
  text: string;
  loading: boolean;
  hasSession: boolean;
  scopeReady: boolean;
}): boolean {
  return args.text.trim().length > 0 && !args.loading && args.hasSession && args.scopeReady;
}

export const ASSISTANT_SUGGESTIONS = [
  { id: "margin", prompt: "Where am I losing margin this month?" },
  { id: "suppliers", prompt: "Which suppliers raised prices in the last 90 days?" },
  { id: "labour", prompt: "Compare labour cost against revenue" },
  { id: "focus", prompt: "What should I focus on this week?" },
] as const;

export const ASSISTANT_DISCLAIMER = "Bani can make mistakes. Verify before taking action.";
