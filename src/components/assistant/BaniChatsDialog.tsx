import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useFloatingBaniStore, type BaniMessage } from "./FloatingBaniContext";
import { CHATS_CHANGED, deleteChat, loadChats, type SavedChat } from "@/utils/baniChats";

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
export function BaniChatList({ chats, activeId, onPick, onNew, onDelete }: { chats: SavedChat[]; activeId: string | null; onPick: (c: SavedChat) => void; onNew: () => void; onDelete?: (c: SavedChat) => void }) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const target = chats.find((c) => c.id === confirm) ?? null;
  return <div className="fb-chatlist">
    <AlertDialog open={!!target} onOpenChange={(v) => { if (!v) setConfirm(null); }}>
      <AlertDialogContent className="max-w-[500px] rounded-[18px] p-5 gap-3 sm:rounded-[18px]">
        <AlertDialogHeader className="space-y-1">
          <AlertDialogTitle className="text-base">Delete session?</AlertDialogTitle>
          <AlertDialogDescription>This session will be permanently deleted. This can’t be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:space-x-0">
          <AlertDialogCancel className="mt-0 h-9 border-0 bg-muted hover:bg-muted/80">Cancel</AlertDialogCancel>
          <AlertDialogAction className="h-9 border border-destructive/60 bg-destructive/10 text-destructive hover:bg-destructive/15"
            onClick={() => { if (target) onDelete?.(target); setConfirm(null); }}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <button type="button" className="fb-chatlist-new" onClick={onNew}><Plus className="h-4 w-4" />New chat</button>
    {chats.length > 0 && <div className="fb-chatlist-label">Recents</div>}
    {chats.map((c) => <div key={c.id} className={`fb-chatlist-row ${c.id === activeId ? "is-on" : ""}`}>
      <button type="button" className={`fb-chatlist-item ${c.id === activeId ? "is-on" : ""}`} title={c.title} onClick={() => onPick(c)}>{c.title}</button>
      {onDelete && <button type="button" className="fb-chatlist-del" aria-label={`Delete chat: ${c.title}`} title="Delete chat"
        onClick={() => setConfirm(c.id)}><Trash2 className="h-3.5 w-3.5" /></button>}
    </div>)}
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
          <BaniChatList chats={chats} activeId={store.chatId[0]} onPick={(c) => show(c.messages as BaniMessage[], c.id)} onNew={() => show([], null)}
            onDelete={(c) => { deleteChat(store.scope[0], c.id); if (c.id === store.chatId[0]) { store.messages[1]([]); store.chatId[1](null); } }} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
