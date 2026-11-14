import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/** Scroll horizontally only, without moving the page or hiding the leading active tab. */
export function useActiveNavigationScroll(activePath: string, ready: unknown = true) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const nav = ref.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active) return;
    const frame = nav.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    const inset = 4;
    const fade = 24;
    if (item.left < frame.left + inset) nav.scrollLeft += item.left - frame.left - inset;
    else if (item.right > frame.right - fade) nav.scrollLeft += item.right - frame.right + fade;
  }, [activePath, ready]);
  return ref;
}

/** Revenue's phone section row, shared with Purchasing. */
export function SectionPillRow({ label, items, activePath }: {
  label: string;
  items: { label: string; path: string }[];
  activePath: string;
}) {
  const navRef = useActiveNavigationScroll(activePath, items.map(item => item.path).join("|"));
  // The right-hand fade only shows when there is more to scroll to.
  const [more, setMore] = useState(false);
  useEffect(() => {
    const nav = navRef.current; if (!nav) return;
    const check = () => setMore(nav.scrollWidth - nav.clientWidth - nav.scrollLeft > 2);
    check();
    nav.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check); ro.observe(nav);
    return () => { nav.removeEventListener("scroll", check); ro.disconnect(); };
  }, [navRef, items.length]);
  return <div className="mb-5 min-w-0">
    <div className="section-pill-row relative min-w-0 max-w-full overflow-hidden rounded-xl bg-muted/50">
      <nav ref={navRef} aria-label={label} className="flex min-w-0 max-w-full gap-0.5 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Tabs share the row evenly when they fit (equal edges); when they don't, they keep their width and scroll. */}
        {items.map(item => <Link key={item.path} to={item.path} aria-current={activePath === item.path ? "page" : undefined} className={cn(
          "inline-flex h-9 flex-[1_0_auto] items-center justify-center whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium transition-[background-color,color,box-shadow]",
          activePath === item.path ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}>{item.label}</Link>)}
      </nav>
      {more && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-muted to-transparent" />}
    </div>
  </div>;
}