import { useEffect, useRef } from "react";
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
  return <div className="mb-5 min-w-0">
    <div className="relative min-w-0 max-w-full overflow-hidden rounded-lg bg-muted/50">
      <nav ref={navRef} aria-label={label} className="flex min-w-0 max-w-full gap-1 overflow-x-auto p-1">
        {items.map(item => <Link key={item.path} to={item.path} aria-current={activePath === item.path ? "page" : undefined} className={cn(
          "inline-flex h-9 shrink-0 items-center rounded-md px-3 text-[13px] font-medium transition-colors",
          activePath === item.path ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}>{item.label}</Link>)}
      </nav>
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-muted to-transparent" />
    </div>
  </div>;
}