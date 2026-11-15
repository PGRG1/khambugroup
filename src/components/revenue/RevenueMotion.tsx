import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { reduced, useHomePlay } from "@/components/home/HomeMotion";

/**
 * Revenue tabs' entrance, every time a tab opens (and on reload):
 * - first open in a session: the full build (cards rise in one flow, charts draw, numbers count up);
 * - every other open: a quick version (~0.6s), with numbers shown as they are.
 * Changing month or venue on the page never replays it. Display only; nothing here changes a
 * figure. Reduced motion turns it off.
 */
const PlayCtx = createContext({ motion: false, count: false });

/** True while the tab's entrance runs; charts use it to switch on their build. */
export const useRevenuePlay = () => useContext(PlayCtx).motion;
/** True only during the first-open entrance: headline numbers count up. */
export const useRevenueCount = () => useContext(PlayCtx).count;

/** Recharts settings for a chart that builds on entrance; `order` staggers charts down the page. */
// `card` is the chart's card position on the page, so the build starts the moment that card starts rising.
export const chartBuild = (play: boolean, card = 0) =>
  // No start delay: Recharts draws the finished bars during a delay. A later card's bars take longer instead.
  ({ isAnimationActive: play, animationBegin: 0, animationDuration: 800 + card * 90, animationEasing: "ease-out" as const });

/**
 * Lines and areas draw left to right with a CSS reveal (Recharts shows a delayed line in full
 * before animating it, so it cannot sequence). `then`: draws after the main series, continuing
 * from where it ends (a projection after actuals).
 */
/** Bars grow up from the axis, left to right (CSS: Recharts runs its own bar animation before the chart has its size). */
export const barBuild = (play: boolean, card = 0, then = false) =>
  ({ isAnimationActive: false, className: play ? `rv-bars rv-c${Math.min(card, 4)}${then ? " rv-then" : ""}` : undefined });

export const lineBuild = (play: boolean, card = 0, then = false) =>
  ({ isAnimationActive: false, className: play ? `rv-line rv-c${Math.min(card, 4)}${then ? " rv-then" : ""}` : undefined });

/** True once loading has lasted `ms` (as Home): until then the tab stays clear instead of flashing placeholders. */
export function useSlowLoad(loading: boolean, ms = 2500) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!loading) { setSlow(false); return; }
    const t = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(t);
  }, [loading, ms]);
  return slow;
}

export function RevenueEnter({ id, ready = true, className = "", children }: {
  id: string; ready?: boolean; className?: string; children: ReactNode | ((play: boolean, count: boolean) => ReactNode);
}) {
  const first = useHomePlay(`revenue-${id}`, ready);
  // Decided in the very render the page first becomes ready (never a frame of the finished page
  // first), once per visit; off when the entrance has run, so data refreshes never replay it.
  const [mode, setMode] = useState<"pending" | "full" | "quick" | "off">("pending");
  if (ready && mode === "pending") setMode(reduced() ? "off" : first ? "full" : "quick");
  const [done, setDone] = useState(false);
  const play = (mode === "full" || mode === "quick") && !done;
  const count = mode === "full" && !done;
  useEffect(() => {
    if (mode !== "full" && mode !== "quick") return;
    const t = setTimeout(() => setDone(true), mode === "full" ? 2600 : 1300);
    return () => clearTimeout(t);
  }, [mode]);
  // Nothing is drawn until the first time it is ready, so figures never mount with half-loaded data.
  const [shown, setShown] = useState(ready);
  if (ready && !shown) setShown(true);
  const ref = useRef<HTMLDivElement>(null);

  // Number the cards and the first table rows in page order, so they enter one after another.
  useLayoutEffect(() => {
    const root = ref.current;
    if (!play || !root) return;
    let n = 0;
    root.querySelectorAll<HTMLElement>(".card-glass, .glass-surface, [data-rv]").forEach((el) => {
      if (el.parentElement?.closest(".rv-item")) return; // a card inside a card moves with its parent
      el.style.setProperty("--rv-i", String(Math.min(n++, 8)));
      el.classList.add("rv-item");
    });
    root.querySelectorAll<HTMLElement>("tbody > tr").forEach((tr, i) => {
      if (i < 14) { tr.style.setProperty("--rv-r", String(i)); tr.classList.add("rv-row"); }
    });
  }, [play]);

  return (
    <PlayCtx.Provider value={{ motion: play, count }}>
      <div ref={ref} className={`${className} ${!ready ? "rv-hold" : play ? (count ? "rv-play" : "rv-play rv-quick") : ""}`}>{!shown ? null : typeof children === "function" ? children(play, count) : children}</div>
    </PlayCtx.Provider>
  );
}
