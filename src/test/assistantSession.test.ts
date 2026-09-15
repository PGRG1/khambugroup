import { describe, it, expect } from "vitest";
import {
  ASSISTANT_DISCLAIMER,
  ASSISTANT_SUGGESTIONS,
  buildRequestBody,
  canSend,
  conversationTitle,
  newConversation,
  sanitizeOutbound,
  sessionScopeKey,
  shouldResetForScope,
} from "@/utils/assistantSession";

describe("assistant session scope", () => {
  it("keys session state by user AND tenant", () => {
    expect(sessionScopeKey("u1", "t1")).toBe("u1::t1");
    expect(sessionScopeKey("u1", null)).toBeNull();
    expect(sessionScopeKey(null, "t1")).toBeNull();
  });

  it("resets on tenant switch and on user switch", () => {
    expect(shouldResetForScope("u1::t1", "u1::t2")).toBe(true);
    expect(shouldResetForScope("u1::t1", "u2::t1")).toBe(true);
    expect(shouldResetForScope("u1::t1", "u1::t1")).toBe(false);
    expect(shouldResetForScope("u1::t1", null)).toBe(true);
  });
});

describe("assistant request body", () => {
  it("always includes the active tenant id", () => {
    const body = buildRequestBody([{ role: "user", content: "hi" }], "tenant-9");
    expect(body.tenant_id).toBe("tenant-9");
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("strips charts and non user/assistant roles", () => {
    const out = sanitizeOutbound([
      { role: "user", content: "hi" },
      { role: "assistant", content: "there", charts: [{ any: true }] },
      { role: "system" as never, content: "leak" },
    ]);
    expect(out).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "there" },
    ]);
  });
});

describe("assistant send gating", () => {
  const base = { text: "hello", loading: false, hasSession: true, scopeReady: true };
  it("allows a normal send", () => expect(canSend(base)).toBe(true));
  it("blocks empty text", () => expect(canSend({ ...base, text: "   " })).toBe(false));
  it("blocks while loading", () => expect(canSend({ ...base, loading: true })).toBe(false));
  it("blocks without a session", () => expect(canSend({ ...base, hasSession: false })).toBe(false));
  it("blocks while the workspace scope is loading or missing", () =>
    expect(canSend({ ...base, scopeReady: false })).toBe(false));
});

describe("assistant conversations", () => {
  it("starts empty and untitled", () => {
    const c = newConversation("id-1", 1000);
    expect(c).toEqual({ id: "id-1", title: "New conversation", messages: [], createdAt: 1000 });
  });

  it("titles a conversation from the first message", () => {
    expect(conversationTitle("  Where am I losing margin  ")).toBe("Where am I losing margin");
    expect(conversationTitle("x".repeat(80))).toHaveLength(48);
    expect(conversationTitle("   ")).toBe("New conversation");
  });

  it("exposes the four approved suggestions and the disclaimer", () => {
    expect(ASSISTANT_SUGGESTIONS.map((s) => s.prompt)).toEqual([
      "Where am I losing margin this month?",
      "Which suppliers raised prices in the last 90 days?",
      "Compare labour cost against revenue",
      "What should I focus on this week?",
    ]);
    expect(ASSISTANT_DISCLAIMER).toBe("Bani can make mistakes. Verify before taking action.");
  });
});
