import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useFloatingBaniOpen } from "@/components/assistant/FloatingBaniContext";

export type TabItem = { title: string; to: string; icon: any; active: boolean };

/**
 * Phone navigation (below 768px): a floating glass bar. Bani team stays pinned on the left; every other
 * section the person can open sits beside it as an icon and slides sideways (nothing hidden under "More").
 * The section you are on shows its name in a brighter glass bubble and always slides into view.
 * Scrolling down shrinks the bar to Bani team and the current section; scrolling up opens it again.
 * It steps aside while you type and while a conversation with Bani fills the screen.
 * Desktop and tablet keep the side menu.
 */
export function MobileTabBar({ home, items }: { home: TabItem; items: TabItem[] }) {
  const [talking] = useFloatingBaniOpen();
  const [typing, setTyping] = useState(false);
  const [compact, setCompact] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  const activeKey = items.find((i) => i.active)?.to ?? "";

  // Bring the current section into view (only the bar scrolls, never the page).
  useEffect(() => {
    const r = row.current, el = r?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!r || !el) return;
    const left = el.offsetLeft - r.offsetLeft, right = left + el.offsetWidth;
    if (left < r.scrollLeft + 8) r.scrollTo({ left: Math.max(0, left - 8), behavior: "smooth" });
    else if (right > r.scrollLeft + r.clientWidth - 8) r.scrollTo({ left: right - r.clientWidth + 24, behavior: "smooth" });
  }, [activeKey, compact]);

  // Shrink while reading down a page, open again on the way up (or near the top, or on a new page).
  useEffect(() => {
    let last = window.scrollY, raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY, d = y - last;
        if (y < 80) setCompact(false);
        else if (d > 10) setCompact(true);
        else if (d < -10) setCompact(false);
        if (Math.abs(d) > 10) last = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);
  useEffect(() => { setCompact(false); }, [activeKey, home.active]);

  // Hide while a text field has focus: phones that resize the page for the keyboard would otherwise lift the bar onto it.
  useEffect(() => {
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.matches("input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select") || t.isContentEditable);
    const on = (e: FocusEvent) => { if (isField(e.target)) setTyping(true); };
    const off = () => setTimeout(() => setTyping(isField(document.activeElement)), 0);
    document.addEventListener("focusin", on); document.addEventListener("focusout", off);
    return () => { document.removeEventListener("focusin", on); document.removeEventListener("focusout", off); };
  }, []);

  const Tab = ({ it, pinned }: { it: TabItem; pinned?: boolean }) => (
    <Link to={it.to} aria-current={it.active ? "page" : undefined} aria-label={it.title} title={it.title}
      className={cn("glass-tab", pinned && "is-pinned", it.active && "is-active")}>
      <it.icon className="glass-tab-icon" strokeWidth={it.active ? 2 : 1.8} aria-hidden="true" />
      {it.active && <span>{it.title}</span>}
    </Link>
  );

  return createPortal(
    <div className={cn("glass-tabbar-wrap", (talking || typing) && "is-hidden", compact && "is-compact")}>
      <nav className="glass-tabbar" aria-label="Sections">
        <Tab it={home} pinned />
        <i className="glass-tabbar-sep" aria-hidden="true" />
        <div ref={row} className="glass-tabbar-row">
          {items.map((it) => <Tab key={it.to} it={it} />)}
        </div>
      </nav>
    </div>,
    document.body,
  );
}
