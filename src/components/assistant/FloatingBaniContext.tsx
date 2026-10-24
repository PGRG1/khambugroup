import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import type { DraftProposal } from "@/utils/floatingDraft";
import type { Point } from "@/utils/floatingBaniUi";

type Host = { token: string; node: HTMLElement };
export type BaniAttachment = { id: string; file: File; name: string; type: string; size: number; url?: string };
export type BaniMessage = { role: "user" | "assistant"; content: string; files?: string[]; proposal?: DraftProposal; outcome?: string; before?: string; target?: string };
export type PageContext = { path: string; detail: string } | null;

type S<T> = [T, Dispatch<SetStateAction<T>>];
type Store = {
  host: Host | null; setHost: (host: Host | null) => void;
  scope: S<string>; messages: S<BaniMessage[]>; draft: S<string>; files: S<BaniAttachment[]>;
  open: S<boolean>; hidden: S<boolean>; sphere: S<Point | null>; panel: S<Point | null>; page: S<PageContext>;
};
const Context = createContext<Store | null>(null);

/** One conversation shared by the global and scanner-hosted assistant, so closing or moving never resets it. */
export function FloatingBaniProvider({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<Host | null>(null);
  const store: Store = {
    host, setHost,
    scope: useState(""), messages: useState<BaniMessage[]>([]), draft: useState(""), files: useState<BaniAttachment[]>([]),
    open: useState(false), hidden: useState(false), sphere: useState<Point | null>(null), panel: useState<Point | null>(null), page: useState<PageContext>(null),
  };
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
const noop = () => {};
export const useFloatingBaniStore = () => useContext(Context);
export const useFloatingBaniHost = () => { const s = useContext(Context); return { host: s?.host ?? null, setHost: s?.setHost ?? noop }; };
/** Pages register only facts they actually hold (e.g. Home's selected venue chip). */
export const useFloatingBaniPage = () => useContext(Context)?.page[1] ?? noop;
