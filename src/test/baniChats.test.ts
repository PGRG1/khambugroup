import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], upserts: [] as Record<string, unknown>[], deletes: [] as string[] }));
vi.mock("@/integrations/supabase/client", () => {
  const q = () => { const r = { eq: () => r, order: () => r, limit: () => r, then: (f: (v: unknown) => unknown) => Promise.resolve({ data: db.rows, error: null }).then(f) }; return r; };
  return { supabase: { auth: { onAuthStateChange: vi.fn() }, from: () => ({
    select: q,
    upsert: (row: Record<string, unknown>) => { db.upserts.push(row); return Promise.resolve({ error: null }); },
    delete: () => ({ eq: (_c: string, id: string) => { db.deletes.push(id); return Promise.resolve({ error: null }); } }),
  }) } };
});
import { chatTitle, chatLast, upsertChat, loadChats, saveChats, clearAllChats, renameChat, storeChat, syncChats, deleteChat, type SavedChat } from "@/utils/baniChats";

const T = "11111111-2222-3333-4444-555555555555";
const S = `u1:${T}:false:null`;
beforeEach(() => { localStorage.clear(); db.rows = []; db.upserts = []; db.deletes = []; });

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
  it("saves every chat to the database, with the name the person gave", () => {
    storeChat(S, { ...chat("a", 5), title: "Why are Tuesdays slow?" });
    renameChat(S, "a", "Tuesday plan");
    expect(db.upserts.map((r) => [r.id, r.tenant_id, r.title, r.named])).toEqual([["a", T, "Why are Tuesdays slow?", false], ["a", T, "Tuesday plan", true]]);
    deleteChat(S, "a");
    expect(db.deletes).toEqual(["a"]);
  });
  it("brings chats back from the database after a reload, new tab or sign-in", async () => {
    db.rows = [{ id: "b", title: "Month-end", named: false, last: "3 left", messages: [{ role: "user", content: "Month-end" }], updated_at: "2026-11-09T10:00:00Z" }];
    await syncChats(S);
    expect(loadChats(S)).toMatchObject([{ id: "b", title: "Month-end", messages: [{ content: "Month-end" }] }]);
  });
  it("uploads chats kept only in this browser once, then trusts the database", async () => {
    saveChats(S, [chat("old", 1)]);
    db.rows = [{ id: "b", title: "b", named: false, last: "", messages: [], updated_at: "2026-11-09T10:00:00Z" }];
    await syncChats(S);
    expect(db.upserts.map((r) => r.id)).toEqual(["old"]);
    expect(loadChats(S).map((c) => c.id)).toEqual(["b", "old"]);
    db.upserts = [];
    await syncChats(S);
    expect(db.upserts).toEqual([]);
    expect(loadChats(S).map((c) => c.id)).toEqual(["b"]);
  });
  it("never writes chats without a real restaurant", () => {
    storeChat("u1:t9", chat("x"));
    expect(db.upserts).toEqual([]);
  });
});
