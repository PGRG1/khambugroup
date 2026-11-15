import { useEffect, useRef, useState } from "react";

/**
 * Home's entrance choreography plays once per browser session per client and block, then Home
 * is quiet: coming back, or data refreshing, only rolls the numbers that actually changed.
 * Display only; never changes a figure, only how it arrives.
 */
const played = new Set<string>();
export const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const seen = (key: string) => {
  if (played.has(key)) return true;
  try { return sessionStorage.getItem(`bani-home-played-${key}`) === "1"; } catch { return false; }
};
const mark = (key: string) => {
  played.add(key);
  try { sessionStorage.setItem(`bani-home-played-${key}`, "1"); } catch { /* memory set still holds it */ }
};

/** True for the render that reveals a block for the first time this session. */
export function useHomePlay(key: string | null, ready: boolean) {
  const [play] = useState(() => !!key && !reduced() && !seen(key));
  useEffect(() => { if (key && ready) mark(key); }, [key, ready]);
  return play && ready;
}

/**
 * True for a short window (`ms`) after a block is first shown on this visit, when the full
 * first-of-session reveal is not playing: every other visit gets a quick version of it.
 * Once per mount, so data refreshes never replay it.
 */
export function useQuickPlay(ready: boolean, full: boolean, ms = 1100) {
  const [state, setState] = useState<"wait" | "on" | "off">("wait");
  if (ready && state === "wait") setState(full || reduced() ? "off" : "on");
  useEffect(() => {
    if (state !== "on") return;
    const t = setTimeout(() => setState("off"), ms);
    return () => clearTimeout(t);
  }, [state, ms]);
  return state === "on";
}

const easeOut = (p: number) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)); // expo: fast start, long soft landing

/**
 * A figure that counts up to its value on the first reveal (delay, then `duration` ms), and on
 * later changes rolls from the old value to the new one. Static when reduced motion is on.
 */
export function Num({ value, format, play, delay = 250, duration = 1100 }: {
  value: number; format: (n: number) => string; play: boolean; delay?: number; duration?: number;
}) {
  const [shown, setShown] = useState(play ? 0 : value);
  const last = useRef(play ? 0 : value);
  const first = useRef(true);
  useEffect(() => {
    const from = last.current;
    const isFirst = first.current; first.current = false;
    if (from === value || reduced() || (isFirst && !play)) { last.current = value; setShown(value); return; }
    const wait = isFirst ? delay : 0, dur = isFirst ? duration : 500;
    let raf = 0, t0 = 0;
    const step = (t: number) => {
      if (!t0) t0 = t + wait;
      const p = Math.max(0, Math.min(1, (t - t0) / dur));
      const v = from + (value - from) * easeOut(p);
      last.current = v; setShown(v);
      if (p < 1) raf = requestAnimationFrame(step); else last.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  // The final figure sits invisibly underneath, so the space is right from the first frame and
  // nothing beside it moves or wraps while it counts.
  if (shown === value) return <>{format(value)}</>;
  return (
    <span style={{ display: "inline-grid" }}>
      <span aria-hidden="true" style={{ gridArea: "1 / 1", visibility: "hidden" }}>{format(value)}</span>
      <span style={{ gridArea: "1 / 1" }}>{format(shown)}</span>
    </span>
  );
}
