import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useHomePlay } from "@/components/home/HomeMotion";

/**
 * Revenue tabs' entrance: the first time a tab opens in a session its cards rise in one flow,
 * top to bottom, charts build and headline numbers count up. Later visits are instant.
 * Display only; nothing here changes a figure. Reduced motion turns it off (useHomePlay).
 */
const PlayCtx = createContext(false);

/** True while this tab is playing its first entrance; charts use it to switch on their build. */
export const useRevenuePlay = () => useContext(PlayCtx);

/** Recharts settings for a chart that builds on entrance; `order` staggers charts down the page. */
// `card` is the chart's card position on the page, so the build starts the moment that card starts rising.
export const chartBuild = (play: boolean, card = 0) =>
  ({ isAnimationActive: play, animationBegin: card * 70, animationDuration: 650, animationEasing: "ease-out" as const });

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
  id: string; ready?: boolean; className?: string; children: ReactNode | ((play: boolean) => ReactNode);
}) {
  const first = useHomePlay(`revenue-${id}`, ready);
  // Switch off once the entrance has run, so data refreshes never replay it.
  const [play, setPlay] = useState(first);
  useEffect(() => { setPlay(first); if (!first) return; const t = setTimeout(() => setPlay(false), 2600); return () => clearTimeout(t); }, [first]);
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
    <PlayCtx.Provider value={play}>
      <div ref={ref} className={`${className} ${!ready ? "rv-hold" : play ? "rv-play" : ""}`}>{typeof children === "function" ? children(play) : children}</div>
    </PlayCtx.Provider>
  );
}
