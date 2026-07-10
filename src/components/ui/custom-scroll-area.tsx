import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * CustomScrollArea — floating overlay scrollbar with a brass thumb.
 *
 * - Hides the native scrollbar entirely.
 * - Renders a floating capsule thumb inset from the right edge.
 * - Fades on scroll, auto-hides after 900ms idle.
 * - Widens on hover; supports click-and-drag to scroll.
 *
 * Wrap any scrollable region:
 *   <CustomScrollArea className="h-full">
 *     ...content...
 *   </CustomScrollArea>
 */

interface CustomScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Classes applied to the inner scrolling viewport (where overflow lives). */
  viewportClassName?: string;
  /** Ref to the scrolling viewport, if the caller needs to control scroll. */
  viewportRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}

const MIN_THUMB = 30;
const IDLE_MS = 900;

export const CustomScrollArea = React.forwardRef<HTMLDivElement, CustomScrollAreaProps>(
  ({ className, viewportClassName, viewportRef, children, ...rest }, ref) => {
    const innerViewportRef = React.useRef<HTMLDivElement | null>(null);
    const setViewportRef = (node: HTMLDivElement | null) => {
      innerViewportRef.current = node;
      if (typeof viewportRef === "function") viewportRef(node);
      else if (viewportRef && "current" in viewportRef) {
        (viewportRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    };

    const thumbRef = React.useRef<HTMLDivElement | null>(null);
    const idleTimerRef = React.useRef<number | null>(null);
    const draggingRef = React.useRef<{
      startY: number;
      startScrollTop: number;
      trackHeight: number;
      thumbHeight: number;
    } | null>(null);

    const [thumbHeight, setThumbHeight] = React.useState(0);
    const [thumbTop, setThumbTop] = React.useState(0);
    const [visible, setVisible] = React.useState(false);
    const [hovering, setHovering] = React.useState(false);
    const [dragging, setDragging] = React.useState(false);
    const [needed, setNeeded] = React.useState(false);

    const recalc = React.useCallback(() => {
      const el = innerViewportRef.current;
      if (!el) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight <= clientHeight + 1) {
        setNeeded(false);
        return;
      }
      setNeeded(true);
      const ratio = clientHeight / scrollHeight;
      const h = Math.max(MIN_THUMB, Math.round(clientHeight * ratio));
      const maxTop = clientHeight - h;
      const scrollable = scrollHeight - clientHeight;
      const top = scrollable > 0 ? Math.round((scrollTop / scrollable) * maxTop) : 0;
      setThumbHeight(h);
      setThumbTop(top);
    }, []);

    const showThenIdle = React.useCallback(() => {
      setVisible(true);
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(() => {
        if (!draggingRef.current && !hovering) setVisible(false);
      }, IDLE_MS);
    }, [hovering]);

    // Scroll listener
    React.useEffect(() => {
      const el = innerViewportRef.current;
      if (!el) return;
      const onScroll = () => {
        recalc();
        showThenIdle();
      };
      el.addEventListener("scroll", onScroll, { passive: true });
      recalc();
      return () => el.removeEventListener("scroll", onScroll);
    }, [recalc, showThenIdle]);

    // Resize observer for content/viewport changes
    React.useEffect(() => {
      const el = innerViewportRef.current;
      if (!el || typeof ResizeObserver === "undefined") return;
      const ro = new ResizeObserver(() => recalc());
      ro.observe(el);
      Array.from(el.children).forEach((child) => ro.observe(child as Element));
      return () => ro.disconnect();
    }, [recalc]);

    // Drag handling
    React.useEffect(() => {
      const onMove = (e: PointerEvent) => {
        const d = draggingRef.current;
        const el = innerViewportRef.current;
        if (!d || !el) return;
        const delta = e.clientY - d.startY;
        const maxThumbTop = d.trackHeight - d.thumbHeight;
        if (maxThumbTop <= 0) return;
        const scrollable = el.scrollHeight - el.clientHeight;
        const nextScroll = d.startScrollTop + (delta / maxThumbTop) * scrollable;
        el.scrollTop = Math.max(0, Math.min(scrollable, nextScroll));
      };
      const onUp = () => {
        if (!draggingRef.current) return;
        draggingRef.current = null;
        setDragging(false);
        showThenIdle();
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      return () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
    }, [showThenIdle]);

    const onThumbPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      const el = innerViewportRef.current;
      if (!el) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      draggingRef.current = {
        startY: e.clientY,
        startScrollTop: el.scrollTop,
        trackHeight: el.clientHeight,
        thumbHeight,
      };
      setDragging(true);
      setVisible(true);
    };

    const active = hovering || dragging;
    const opacity = !needed ? 0 : dragging ? 1 : hovering ? 1 : visible ? 0.9 : 0;
    const width = active ? 7 : 4;
    const right = active ? 5 : 6;

    return (
      <div
        ref={ref}
        className={cn("relative overflow-hidden", className)}
        {...rest}
      >
        <div
          ref={setViewportRef}
          className={cn("h-full w-full overflow-auto custom-scroll-hide", viewportClassName)}
        >
          {children}
        </div>
        <div
          ref={thumbRef}
          onPointerDown={onThumbPointerDown}
          onPointerEnter={() => setHovering(true)}
          onPointerLeave={() => setHovering(false)}
          style={{
            position: "absolute",
            top: thumbTop,
            right,
            width,
            height: thumbHeight,
            opacity,
            borderRadius: 6,
            background: "linear-gradient(180deg, #D9A860, #8A6A3E)",
            transition:
              "opacity 300ms ease, width 200ms ease, right 200ms ease, background 200ms ease",
            pointerEvents: needed ? "auto" : "none",
            touchAction: "none",
            cursor: dragging ? "grabbing" : "grab",
            willChange: "transform, opacity",
          }}
          aria-hidden
        />
      </div>
    );
  },
);
CustomScrollArea.displayName = "CustomScrollArea";
