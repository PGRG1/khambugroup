import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useFloatingBaniStore, type BaniMessage } from "./FloatingBaniContext";
import { CHATS_CHANGED, loadChats, type SavedChat } from "@/utils/baniChats";

/** Saved chats for this person and restaurant, kept fresh as chats are saved or renamed. */
export function useSavedChats(scope: string, active = true) {
  const [chats, setChats] = useState<SavedChat[]>(() => (active ? loadChats(scope) : []));
  useEffect(() => {
    if (!active) return;
    const read = () => setChats(loadChats(scope));
    read();
    window.addEventListener(CHATS_CHANGED, read);
    window.addEventListener("storage", read);
    return () => { window.removeEventListener(CHATS_CHANGED, read); window.removeEventListener("storage", read); };
  }, [scope, active]);
  return chats;
}

/** "+ New chat", then Recents: one line per chat, by name. */
export function BaniChatList({ chats, activeId, onPick, onNew }: { chats: SavedChat[]; activeId: string | null; onPick: (c: SavedChat) => void; onNew: () => void }) {
  return <div className="fb-chatlist">
    <button type="button" className="fb-chatlist-new" onClick={onNew}><Plus className="h-4 w-4" />New chat</button>
    {chats.length > 0 && <div className="fb-chatlist-label">Recents</div>}
    {chats.map((c) => <button key={c.id} type="button" className={`fb-chatlist-item ${c.id === activeId ? "is-on" : ""}`} title={c.title} onClick={() => onPick(c)}>{c.title}</button>)}
  </div>;
}

/** Phone: the same list as a centred pop-up, opened from "Chats" at the top of a conversation. */
export function BaniChatsDialog() {
  const store = useFloatingBaniStore();
  const open = store?.chatsOpen[0] ?? false;
  const chats = useSavedChats(store?.scope[0] ?? "", open);
  if (!store) return null;
  const close = () => store.chatsOpen[1](false);
  const show = (messages: BaniMessage[], id: string | null) => {
    store.messages[1](messages); store.chatId[1](id); store.draft[1](""); store.hidden[1](false); store.open[1](true); close();
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent aria-describedby={undefined} className="max-w-[420px] p-0 sm:p-0 gap-0 flex flex-col overflow-hidden rounded-[18px] max-h-[80svh] sm:max-h-[80svh]">
        <DialogTitle className="px-5 pt-5 pb-2 text-base font-semibold">Chat history</DialogTitle>
        <div className="overflow-y-auto px-3 pb-4 min-h-0">
          <BaniChatList chats={chats} activeId={store.chatId[0]} onPick={(c) => show(c.messages as BaniMessage[], c.id)} onNew={() => show([], null)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
