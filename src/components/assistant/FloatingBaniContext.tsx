import { createContext, useCallback, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { DraftProposal } from "@/utils/floatingDraft";
import type { Point } from "@/utils/floatingBaniUi";
import type { SalesRecord } from "@/types/sales";
import type { SalesChange } from "@/utils/salesReceiptCorrections";

/** The unsaved Scan Receipt draft Bani may propose corrections for (Apply only; Save stays manual). */
export type SalesDraft = { record: SalesRecord; venues: string[]; apply: (next: SalesRecord) => void };

type Host = { token: string; node: HTMLElement };
export type BaniAttachment = { id: string; file: File; name: string; type: string; size: number; url?: string };
export type BaniMessage = { role: "user" | "assistant"; content: string; files?: string[]; proposal?: DraftProposal; outcome?: string; before?: string; target?: string; salesChanges?: SalesChange[]; salesBase?: SalesRecord };
export type PageContext = { path: string; detail: string } | null;

type S<T> = [T, Dispatch<SetStateAction<T>>];
type Store = {
  host: Host | null; setHost: (host: Host | null) => void;
  scope: S<string>; messages: S<BaniMessage[]>; draft: S<string>; files: S<BaniAttachment[]>;
  /** Original attachments from the last turn that had files, so a follow-up
   *  "add it in procurement" can hand them to the scanner after the composer cleared. */
  lastFiles: S<BaniAttachment[]>;
  open: S<boolean>; hidden: S<boolean>; sphere: S<Point | null>; panel: S<Point | null>; page: S<PageContext>;
  sales: S<SalesDraft | null>;
};
const Context = createContext<Store | null>(null);

/** One conversation shared by the global and scanner-hosted assistant, so closing or moving never resets it. */
export function FloatingBaniProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<Host | null>(null);
  const store: Store = {
    host, setHost,
    scope: useState(""), messages: useState<BaniMessage[]>([]), draft: useState(""), files: useState<BaniAttachment[]>([]),
    lastFiles: useState<BaniAttachment[]>([]),
    open: useState(false), hidden: useState(false), sphere: useState<Point | null>(null), panel: useState<Point | null>(null), page: useState<PageContext>(null),
    sales: useState<SalesDraft | null>(null),
  };
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
const noop = () => {};
export const useFloatingBaniStore = () => useContext(Context);
export const useFloatingBaniHost = () => { const s = useContext(Context); return { host: s?.host ?? null, setHost: s?.setHost ?? noop }; };
/** Pages register only facts they actually hold (e.g. Home's selected venue chip). */
export const useFloatingBaniPage = () => useContext(Context)?.page[1] ?? noop;
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
