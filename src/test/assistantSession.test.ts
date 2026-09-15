import { describe, it, expect } from "vitest";
import {
  assistantScopeKey,
  canSend,
  composerPlacement,
  conversationTitle,
  createConversation,
  scopeChanged,
  toRequestMessages,
  upsertConversation,
  visibleConversations,
} from "@/utils/assistantSession";

describe("assistant scope", () => {
  it("requires both user and tenant", () => {
    expect(assistantScopeKey("u1", "t1")).toBe("u1::t1");
    expect(assistantScopeKey("u1", null)).toBeNull();
    expect(assistantScopeKey(null, "t1")).toBeNull();
  });

  it("detects tenant and user switches", () => {
    expect(scopeChanged("u1::t1", "u1::t2")).toBe(true);
    expect(scopeChanged("u1::t1", "u2::t1")).toBe(true);
    expect(scopeChanged("u1::t1", "u1::t1")).toBe(false);
  });

  it("blocks sending until the scope is ready", () => {
    expect(canSend({ text: "hi", loading: false, scopeReady: false })).toBe(false);
    expect(canSend({ text: "hi", loading: true, scopeReady: true })).toBe(false);
    expect(canSend({ text: "   ", loading: false, scopeReady: true })).toBe(false);
    expect(canSend({ text: "hi", loading: false, scopeReady: true })).toBe(true);
  });
});

describe("composer placement", () => {
  it("sits under the heading when empty and docks during a chat", () => {
    expect(composerPlacement(0)).toBe("welcome");
    expect(composerPlacement(1)).toBe("docked");
  });
});

describe("session conversations", () => {
  it("titles a conversation from the first message", () => {
    expect(conversationTitle("  Where am I losing margin?  ")).toBe("Where am I losing margin?");
    expect(conversationTitle("")).toBe("New conversation");
    expect(conversationTitle("x".repeat(80)).length).toBe(48);
  });

  it("upserts by id, newest first", () => {
    const a = createConversation("a", 1);
    const b = createConversation("b", 2);
    let list = upsertConversation([a], b);
    expect(list.map((c) => c.id)).toEqual(["b", "a"]);
    list = upsertConversation(list, { ...b, title: "renamed" });
    expect(list).toHaveLength(2);
    expect(list.find((c) => c.id === "b")?.title).toBe("renamed");
  });

  it("lists only conversations with real messages (no fake rows)", () => {
    const empty = createConversation("a", 1);
    const used = { ...createConversation("b", 2), messages: [{ role: "user" as const, content: "hi" }] };
    expect(visibleConversations([empty, used], "a").map((c) => c.id)).toEqual(["b"]);
  });

  it("sends only role/content to the server", () => {
    const out = toRequestMessages([
      { role: "user", content: "hi" },
      { role: "assistant", content: "there", charts: [{ any: true } as unknown] },
    ]);
    expect(out).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "there" },
    ]);
  });
});
