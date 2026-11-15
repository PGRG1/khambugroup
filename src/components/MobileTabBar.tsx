import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useFloatingBaniOpen } from "@/components/assistant/FloatingBaniContext";

export type TabItem = { title: string; to: string; icon: any; active: boolean };

/**
 * Phone navigation (below 768px): a bar along the bottom of the screen. Bani team stays pinned on the
 * left; every other section the person can open sits beside it and slides sideways, nothing hidden
 * under "More". The section you are on always slides into view. The bar steps aside while you type
 * (so it never sits on top of the keyboard) and while a conversation with Bani fills the screen.
 * Desktop and tablet keep the side menu.
 */
export function MobileTabBar({ home, items }: { home: TabItem; items: TabItem[] }) {
  const [talking] = useFloatingBaniOpen();
  const [typing, setTyping] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  const activeKey = items.find((i) => i.active)?.to ?? "";

  // Bring the current section into view (only the bar scrolls, never the page).
  useEffect(() => {
    const r = row.current, el = r?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!r || !el) return;
    const left = el.offsetLeft - r.offsetLeft, right = left + el.offsetWidth;
    if (left < r.scrollLeft + 8) r.scrollTo({ left: Math.max(0, left - 8), behavior: "smooth" });
    else if (right > r.scrollLeft + r.clientWidth - 8) r.scrollTo({ left: right - r.clientWidth + 24, behavior: "smooth" });
  }, [activeKey]);

  // Hide while a text field has focus: phones that resize the page for the keyboard would otherwise lift the bar onto it.
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.matches("input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select") || t.isContentEditable);
    const on = (e: FocusEvent) => { if (isField(e.target)) setTyping(true); };
    const off = () => setTimeout(() => setTyping(isField(document.activeElement)), 0);
    document.addEventListener("focusin", on); document.addEventListener("focusout", off);
    return () => { document.removeEventListener("focusin", on); document.removeEventListener("focusout", off); };
  }, []);

  const Tab = ({ it, pinned }: { it: TabItem; pinned?: boolean }) => (
    <Link to={it.to} aria-current={it.active ? "page" : undefined} className={cn("mobile-tab", pinned && "is-pinned", it.active && "is-active")}>
      <it.icon className="mobile-tab-icon" strokeWidth={it.active ? 2.2 : 1.8} aria-hidden="true" />
      <span>{it.title}</span>
    </Link>
  );

  return createPortal(
    <nav className={cn("mobile-tabbar", (talking || typing) && "is-hidden")} aria-label="Sections">
      <Tab it={home} pinned />
      <div ref={row} className="mobile-tabbar-row">
        {items.map((it) => <Tab key={it.to} it={it} />)}
      </div>
    </nav>,
    document.body,
  );
}
