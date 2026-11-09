// Bani chat history, kept in this browser per person and restaurant (scope), newest first.
// Cleared on sign-out. Only text and results are kept, never files, drafts or action cards.
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
  saveChats(scope, loadChats(scope).map((c) => (c.id === id ? { ...c, title: name, named: true } : c)));
}

/** Forget one saved chat. */
export function deleteChat(scope: string, id: string) {
  saveChats(scope, loadChats(scope).filter((c) => c.id !== id));
}

export function clearAllChats() {
  try { Object.keys(localStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => localStorage.removeItem(k)); } catch { /* nothing to clear */ }
}

// Signing out (by hand or after idle) forgets every saved chat in this browser.
supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT") clearAllChats(); });
