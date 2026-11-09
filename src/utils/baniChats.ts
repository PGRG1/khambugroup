// Bani chat history per person and restaurant (scope = "user:tenant:..."), newest first.
// The database (bani_chats) is the record, so chats survive reloads, new tabs, deploys and devices.
// This browser keeps a copy so the list shows instantly; the copy is cleared on sign-out.
// Only text and results are kept, never files, drafts or action cards.
import { supabase } from "@/integrations/supabase/client";

export type ChatMessage = { role: "user" | "assistant"; content: string; hidden?: boolean; [k: string]: unknown };
export type SavedChat = { id: string; title: string; named?: boolean; last: string; updated: number; messages: ChatMessage[] };

const PREFIX = "bani-chats:";
const MAX = 30;

export const chatKey = (scope: string) => `${PREFIX}${scope}`;

const firstLine = (s: string) => s.replace(/[#*_`>[\]]/g, "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";

/** The chat is named by the first thing the person asked. */
export function chatTitle(messages: ChatMessage[]): string {
  const q = messages.find((m) => m.role === "user" && !m.hidden && m.content.trim());
  return firstLine(q?.content ?? "").slice(0, 90) || "Chat with Bani";
}

/** Bani's latest visible line (kept with the chat). */
export function chatLast(messages: ChatMessage[]): string {
  const a = [...messages].reverse().find((m) => m.role === "assistant" && !m.hidden && m.content.trim());
  return firstLine(a?.content ?? "").slice(0, 140);
}

/** Put this chat first, replacing its older copy; keep the newest MAX. */
export function upsertChat(list: SavedChat[], chat: SavedChat, max = MAX): SavedChat[] {
  const was = list.find((c) => c.id === chat.id);
  const next = was?.named ? { ...chat, title: was.title, named: true } : chat;
  return [next, ...list.filter((c) => c.id !== chat.id)].slice(0, max);
}

// bani_chats is not in the generated types yet; this is the only shape we use.
type ChatRow = { id: string; title: string; named: boolean; last: string; messages: ChatMessage[]; updated_at: string };
type Query = PromiseLike<{ data: ChatRow[] | null; error: unknown }> & { eq: (c: string, v: string) => Query; order: (c: string, o: { ascending: boolean }) => Query; limit: (n: number) => Query };
type Table = { select: (cols: string) => Query; upsert: (row: Record<string, unknown>) => PromiseLike<unknown>; delete: () => { eq: (c: string, v: string) => PromiseLike<unknown> } };
const table = () => (supabase as unknown as { from: (t: string) => Table }).from("bani_chats");
const tenantOf = (scope: string) => { const t = scope.split(":")[1] ?? ""; return /^[0-9a-f-]{36}$/i.test(t) ? t : ""; };
const quiet = (p: PromiseLike<unknown>) => { Promise.resolve(p).catch(() => { /* kept locally; next save retries */ }); };

/** Write one chat to the database. */
export function pushChat(scope: string, chat: SavedChat) {
  const tenant = tenantOf(scope);
  if (!tenant) return;
  quiet(table().upsert({ id: chat.id, tenant_id: tenant, title: chat.title, named: !!chat.named, last: chat.last, messages: chat.messages, updated_at: new Date(chat.updated).toISOString() }));
}

/** Save a chat (here and in the database) and move it to the top. */
export function storeChat(scope: string, chat: SavedChat) {
  const list = upsertChat(loadChats(scope), chat);
  saveChats(scope, list);
  pushChat(scope, list[0]);
}

/** Load this person's chats from the database. Chats saved only in this browser before are uploaded once. */
export async function syncChats(scope: string) {
  const tenant = tenantOf(scope);
  if (!tenant) return;
  const started = Date.now();
  const { data, error } = await table().select("id,title,named,last,messages,updated_at").eq("tenant_id", tenant).order("updated_at", { ascending: false }).limit(MAX);
  if (error || !data) return;
  const remote: SavedChat[] = data.map((r) => ({ id: r.id, title: r.title, ...(r.named ? { named: true } : {}), last: r.last, updated: Date.parse(r.updated_at), messages: r.messages ?? [] }));
  let extra: SavedChat[] = [];
  const once = `bani-chats-uploaded:${scope}`;
  try {
    if (!localStorage.getItem(once)) {
      extra = loadChats(scope).filter((c) => !remote.some((r) => r.id === c.id));
      extra.forEach((c) => pushChat(scope, c));
      localStorage.setItem(once, "1");
    }
  } catch { /* storage blocked: the database list still shows */ }
  // A chat saved here while the list was loading is newer than what came back: keep it.
  const fresher = loadChats(scope).filter((c) => c.updated >= started && !remote.some((r) => r.id === c.id) && !extra.some((e) => e.id === c.id));
  saveChats(scope, [...remote, ...extra, ...fresher].sort((a, b) => b.updated - a.updated).slice(0, MAX));
}

export function loadChats(scope: string): SavedChat[] {
  if (!scope) return [];
  try {
    const v = JSON.parse(localStorage.getItem(chatKey(scope)) ?? "[]");
    return Array.isArray(v) ? v.filter((c) => c && typeof c.id === "string" && Array.isArray(c.messages)) : [];
  } catch { return []; }
}

export const CHATS_CHANGED = "bani-chats-changed";

export function saveChats(scope: string, list: SavedChat[]) {
  if (!scope) return;
  try { localStorage.setItem(chatKey(scope), JSON.stringify(list)); } catch { /* storage full or blocked: history just isn't kept */ }
  try { window.dispatchEvent(new Event(CHATS_CHANGED)); } catch { /* no window in tests */ }
}

/** A name the person typed replaces the automatic one and is never overwritten. */
export function renameChat(scope: string, id: string, title: string) {
  const name = title.trim().slice(0, 90);
  if (!name) return;
  const list = loadChats(scope).map((c) => (c.id === id ? { ...c, title: name, named: true } : c));
  saveChats(scope, list);
  const c = list.find((x) => x.id === id);
  if (c) pushChat(scope, c);
}

/** Forget one saved chat. */
export function deleteChat(scope: string, id: string) {
  saveChats(scope, loadChats(scope).filter((c) => c.id !== id));
  if (tenantOf(scope)) quiet(table().delete().eq("id", id));
}

export function clearAllChats() {
  try { Object.keys(localStorage).filter((k) => k.startsWith(PREFIX) || k.startsWith("bani-chats-uploaded:")).forEach((k) => localStorage.removeItem(k)); } catch { /* nothing to clear */ }
}

// Signing out (by hand or after idle) clears this browser's copy. The chats stay in the person's account.
supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") clearAllChats(); });
