import type { ChartSpec } from "./AssistantChart";
import { createContext, useCallback, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { DraftProposal } from "@/utils/floatingDraft";
import type { Point } from "@/utils/floatingBaniUi";
import type { SalesRecord } from "@/types/sales";
import type { SalesChange } from "@/utils/salesReceiptCorrections";
import type { PageWorkItem } from "@/utils/baniPageWork";

/** The unsaved Scan Receipt draft Bani may propose corrections for (Apply only; Save stays manual). */
export type SalesDraft = { record: SalesRecord; venues: string[]; apply: (next: SalesRecord) => void; note?: string; applyNote?: (body: string) => void };

type Host = { token: string; node: HTMLElement };
export type BaniAttachment = { id: string; file: File; name: string; type: string; size: number; url?: string; thumb?: string };
export type BaniActionCard = { id: string; kind: "mark_closed_days" | "open_sales_scanner" | "open_invoice_scanner" | "people" | "create_alert_ask" | "log_waste" | "approve_bill" | "resolve_receipt_intake"; title: string; detail?: string | null; challenge?: string; amount?: number; currency?: string };
export type BaniMessage = { role: "user" | "assistant"; content: string; replies?: string[]; teamMessageId?: string; eventId?:string; preferenceId?:string; files?: string[]; proposal?: DraftProposal; outcome?: string; actionOutcome?: { message: string; link?: string; undo_available?: boolean; instruction?: string }; before?: string; target?: string; salesChanges?: SalesChange[]; salesBase?: SalesRecord; actionCard?: BaniActionCard; charts?: ChartSpec[]; hidden?: boolean };
export type PageContext = { path: string; detail: string; person?: { id: string; name: string }; facts?: string; retainFiles?: (files: File[]) => Promise<void> } | null;

type S<T> = [T, Dispatch<SetStateAction<T>>];
type Store = {
  host: Host | null; setHost: (host: Host | null) => void;
  scope: S<string>; messages: S<BaniMessage[]>; draft: S<string>; files: S<BaniAttachment[]>;
  /** Original attachments from the last turn that had files, so a follow-up
   *  "add it in procurement" can hand them to the scanner after the composer cleared. */
  lastFiles: S<BaniAttachment[]>;
  open: S<boolean>; hidden: S<boolean>; sphere: S<Point | null>; panel: S<Point | null>; page: S<PageContext>;
  sales: S<SalesDraft | null>;
  work: S<{ path: string; items: PageWorkItem[] } | null>;
  continueToPage: S<boolean>;
  /** A question a Home button sends straight away (not just drafted). */
  ask: S<string | null>;
  /** Which saved chat is on screen (null = not saved yet), and whether the phone chat list is open. */
  chatId: S<string | null>;
  chatsOpen: S<boolean>;
};
const Context = createContext<Store | null>(null);

/** One conversation shared by the global and scanner-hosted assistant, so closing or moving never resets it. */
export function FloatingBaniProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<Host | null>(null);
  const store: Store = {
    host, setHost,
    scope: useState(""), messages: useState<BaniMessage[]>([]), chatId: useState<string | null>(null), chatsOpen: useState(false), draft: useState(""), files: useState<BaniAttachment[]>([]),
    lastFiles: useState<BaniAttachment[]>([]),
    open: useState(false), hidden: useState(false), sphere: useState<Point | null>(null), panel: useState<Point | null>(null), page: useState<PageContext>(null),
    sales: useState<SalesDraft | null>(null),
    work: useState<{ path: string; items: PageWorkItem[] } | null>(null), continueToPage: useState(false), ask: useState<string | null>(null),
  };
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
const noop = () => {};
export const useFloatingBaniStore = () => useContext(Context);
export const useFloatingBaniHost = () => { const s = useContext(Context); return { host: s?.host ?? null, setHost: s?.setHost ?? noop }; };
/** Pages register only facts they actually hold (e.g. Home's selected venue chip). */
export const useFloatingBaniPage = () => useContext(Context)?.page[1] ?? noop;
/** Opens a grounded topic in the composer; only the person can send it. */
export function useBaniTopic() {
  const s=useContext(Context);
  return useCallback((text:string)=>{s?.draft[1](text);s?.hidden[1](false);s?.open[1](true);},[s?.draft[1],s?.hidden[1],s?.open[1]]);
}
/** Opens Bani and sends the question right away (Home buttons). */
export function useBaniAsk() {
  const s=useContext(Context);
  return useCallback((text:string)=>{s?.hidden[1](false);s?.open[1](true);s?.ask[1](text);},[s?.hidden[1],s?.open[1],s?.ask[1]]);
}
/** Register already-computed page facts, without a second query or an AI turn. */
export function useBaniWorkPublisher(path: string, items: PageWorkItem[], ready = true) {
  const setWork = useContext(Context)?.work[1];
  const signature = JSON.stringify(items);
  // The exact current period/scope is represented by the published items.
  useEffect(() => {
    setWork?.({ path, items: ready ? JSON.parse(signature) : [] });
    return () => setWork?.(current => current?.path === path ? null : current);
  }, [setWork, path, signature, ready]);
}
/** Whether the shared Bani conversation is open (on Home it replaces the cards). */
export function useFloatingBaniOpen() { const s = useContext(Context); return [s?.open[0] ?? false, s?.open[1] ?? noop] as const; }
/** Scan Receipt registers its live unsaved draft so the floating sphere can fix it. */
export const useFloatingBaniSales = () => useContext(Context)?.sales[1] ?? noop;
/** Launchpad drop zone: stage files in Bani's composer and open it; Bani classifies and routes them. */
export const useFloatingBaniAttach = () => {
  const s = useContext(Context);
  const setFiles = s?.files[1], setOpen = s?.open[1], setHidden = s?.hidden[1];
  return useCallback((list: File[]) => {
    if (!setFiles || !list.length) return false;
    setFiles(prev => [...prev, ...list.map(f => ({ id: crypto.randomUUID(), file: f, name: f.name, type: f.type, size: f.size }))]);
    setHidden?.(false); setOpen?.(true);
    return true;
  }, [setFiles, setOpen, setHidden]);
};
/** Scanners post a grounded post-scan verdict into the shared Bani conversation and open it. */
export const useFloatingBaniSay = () => {
  const s = useContext(Context);
  const setMessages = s?.messages[1], setOpen = s?.open[1], setHidden = s?.hidden[1];
  return useCallback((content: string) => {
    if (!setMessages) return;
    setMessages(prev => [...prev, { role: "assistant", content }]);
    setHidden?.(false); setOpen?.(true);
  }, [setMessages, setOpen, setHidden]);
};
