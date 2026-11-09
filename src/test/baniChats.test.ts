import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { onAuthStateChange: vi.fn() } } }));
import { chatTitle, chatLast, upsertChat, loadChats, saveChats, clearAllChats, renameChat, type SavedChat } from "@/utils/baniChats";

const msgs = [
  { role: "user" as const, content: "context", hidden: true },
  { role: "user" as const, content: "Why are **Tuesdays** slow?\nmore" },
  { role: "assistant" as const, content: "First answer" },
  { role: "assistant" as const, content: "\n## Tuesdays average HK$28.5k\nmore" },
];
const chat = (id: string, updated = 1): SavedChat => ({ id, title: id, last: "", updated, messages: [] });

describe("bani chat history", () => {
  it("names a chat by the first visible question and shows Bani's latest line", () => {
    expect(chatTitle(msgs)).toBe("Why are Tuesdays slow?");
    expect(chatLast(msgs)).toBe("Tuesdays average HK$28.5k");
    expect(chatTitle([])).toBe("Chat with Bani");
  });
  it("moves an updated chat to the top without duplicates and keeps the newest", () => {
    const list = upsertChat([chat("a"), chat("b"), chat("c")], chat("b", 9), 3);
    expect(list.map((c) => c.id)).toEqual(["b", "a", "c"]);
    expect(upsertChat(list, chat("d"), 3).map((c) => c.id)).toEqual(["d", "b", "a"]);
  });
  it("keeps a name the person gave, even as the chat goes on", () => {
    saveChats("u1:t9", [chat("a")]);
    renameChat("u1:t9", "a", "  Tuesday plan  ");
    const list = upsertChat(loadChats("u1:t9"), { ...chat("a", 5), title: "Why are Tuesdays slow?" });
    expect(list[0]).toMatchObject({ id: "a", title: "Tuesday plan", named: true, updated: 5 });
    renameChat("u1:t9", "a", "   ");
    expect(loadChats("u1:t9")[0].title).toBe("Tuesday plan");
  });
  it("keeps chats per scope and forgets them all on sign-out", () => {
    saveChats("u1:t1", [chat("a")]); saveChats("u2:t1", [chat("b")]);
    expect(loadChats("u1:t1").map((c) => c.id)).toEqual(["a"]);
    expect(loadChats("u2:t1").map((c) => c.id)).toEqual(["b"]);
    clearAllChats();
    expect(loadChats("u1:t1")).toEqual([]);
  });
});
