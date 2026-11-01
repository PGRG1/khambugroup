import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Slots the shared PageTop exposes so content (tables, Bani notices) can place controls in row 2 and findings in the Bani card position. */
export type PageTopSlot = "left" | "tools" | "download" | "bani";
type Slots = Partial<Record<PageTopSlot, HTMLElement | null>>;
type Ctx = { slots: Slots; register: (s: PageTopSlot, el: HTMLElement | null) => void; claim: (id: object) => boolean };
const SlotContext = createContext<Ctx | null>(null);

export function PageTopSlotProvider({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<Slots>({});
  const owner = useRef<object | null>(null);
  const register = (s: PageTopSlot, el: HTMLElement | null) => setSlots((cur) => (cur[s] === el ? cur : { ...cur, [s]: el }));
  const claim = (id: object) => { if (!owner.current) owner.current = id; return owner.current === id; };
  return <SlotContext.Provider value={{ slots, register, claim }}>{children}</SlotContext.Provider>;
}

export function usePageTopSlots() { return useContext(SlotContext); }

/** Renders children into a PageTop slot when a PageTop is on the page; otherwise inline (or nothing when `inline` is false). */
export function PageTopPortal({ slot, children, inline = true }: { slot: PageTopSlot; children: ReactNode; inline?: boolean }) {
  const ctx = useContext(SlotContext);
  const el = ctx?.slots[slot];
  if (el) return createPortal(children, el);
  return inline ? <>{children}</> : null;
}

/** First table toolbar on a page owns PageTop row 2; later ones stay inline. */
export function useToolbarClaim() {
  const ctx = useContext(SlotContext);
  const id = useRef({}).current;
  return !!ctx && ctx.claim(id);
}
