import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { reduced } from "@/components/home/HomeMotion";
import "./page-motion.css";

/**
 * Every tab's entrance (AppLayout mounts one per screen):
 * 1. Hold: the new screen stays clear (the old one is already gone) while its file and first data
 *    load, so a half-loaded screen, a loading line or an empty "nothing here" card never flashes
 *    before the real one. It stops waiting after HOLD_MAX_MS and shows whatever is there.
 * 2. Play: the empty cards rise in one after another, then what is inside them sharpens in from a
 *    soft blur; table rows slide in; charts, bars and numbers build (RevenueEnter, Num).
 * The full build plays the first time a screen opens in a session; later opens get a quicker one.
 * Display only: nothing here changes data. Reduced motion keeps the hold and skips the movement.
 */
const HOLD_MAX_MS = 2500;
const SETTLE_MS = 90;
const PLAY_MS = { full: 1700, quick: 900 } as const;

type Stage = { revealed: boolean; full: boolean };
const StageCtx = createContext<Stage>({ revealed: true, full: false });
/** True once the screen is on view (always true outside a PageStage). */
export const usePageRevealed = () => useContext(StageCtx).revealed;
/** True when this screen's entrance is the full first-of-session build. */
export const usePageFull = () => useContext(StageCtx).full;

const playedKey = (key: string) => `bani-page-played-${key}`;
const seen = new Set<string>();
const firstOpen = (key: string) => {
  if (seen.has(key)) return false;
  try { if (sessionStorage.getItem(playedKey(key)) === "1") return false; } catch { /* memory set only */ }
  return true;
};
const markOpened = (key: string) => {
  seen.add(key);
  try { sessionStorage.setItem(playedKey(key), "1"); } catch { /* memory set still holds it */ }
};

const CARDS = ".card-glass, .glass-surface, [data-card], [data-rv]";
const BUSY = '[aria-busy="true"], .rv-hold, [aria-label^="Loading"]';
const LOADING_TEXT = /\bLoading\b[^.…\n]{0,40}…/;

function stillLoading(root: HTMLElement) {
  if (root.querySelector(BUSY)) return true;
  return LOADING_TEXT.test(root.textContent ?? "");
}

/** Number the cards, the loose page parts and the first rows in page order. */
function tag(root: HTMLElement) {
  let n = 0;
  root.querySelectorAll<HTMLElement>(CARDS).forEach((el) => {
    if (el.parentElement?.closest(".pg-card")) return; // a card inside a card moves with its parent
    el.style.setProperty("--pg-i", String(Math.min(n++, 10)));
    el.classList.add("pg-card");
  });
  // Page parts outside any card (title, period, buttons, tabs) sharpen in with the first card.
  const page = root.firstElementChild as HTMLElement | null;
  page?.querySelectorAll<HTMLElement>(":scope > *").forEach((el) => {
    if (!el.classList.contains("pg-card") && !el.querySelector(".pg-card")) el.classList.add("pg-loose");
  });
  root.querySelectorAll<HTMLElement>(".pg-card tbody > tr").forEach((tr, i) => {
    if (i < 14) { tr.style.setProperty("--pg-r", String(i)); tr.classList.add("pg-row"); }
  });
}

export function PageStage({ id, animate = true, children }: { id: string; animate?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const [full] = useState(() => firstOpen(id));
  const [phase, setPhase] = useState<"hold" | "play" | "done">("hold");

  // Hold until the screen has loaded: no pending first fetch, no loading marker, steady for SETTLE_MS.
  useEffect(() => {
    if (phase !== "hold") return;
    let calmSince = 0;
    const started = performance.now();
    const firstLoads = () => qc.isFetching({ predicate: (q) => q.state.data === undefined && q.getObserversCount() > 0 });
    const timer = window.setInterval(() => {
      const root = ref.current;
      const now = performance.now();
      const busy = !root || firstLoads() > 0 || stillLoading(root);
      if (busy) calmSince = 0; else if (!calmSince) calmSince = now;
      if ((calmSince && now - calmSince >= SETTLE_MS) || now - started >= HOLD_MAX_MS) {
        window.clearInterval(timer);
        setPhase(animate && !reduced() ? "play" : "done");
      }
    }, 30);
    return () => window.clearInterval(timer);
  }, [phase, qc, animate]);

  // Tag the cards in the same frame the screen is shown, so nothing is ever seen untagged.
  useLayoutEffect(() => {
    if (phase !== "play" || !ref.current) return;
    tag(ref.current);
  }, [phase]);

  // Cards that arrive after the screen is on view (a slow list, a late answer) get the same entrance
  // on their own instead of popping in; only for a short while, so later edits never animate.
  useEffect(() => {
    const root = ref.current;
    if (phase === "hold" || !root || !animate || reduced()) return;
    let n = 0;
    const observer = new MutationObserver(() => {
      root.querySelectorAll<HTMLElement>(CARDS).forEach((el) => {
        if (el.classList.contains("pg-card") || el.parentElement?.closest(".pg-card")) return;
        el.style.setProperty("--pg-i", String(Math.min(n++, 6)));
        el.classList.add("pg-card", "pg-late");
      });
    });
    observer.observe(root, { childList: true, subtree: true });
    const stop = window.setTimeout(() => observer.disconnect(), 4000);
    return () => { observer.disconnect(); window.clearTimeout(stop); };
  }, [phase === "hold", animate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase === "hold") return;
    markOpened(id);
    if (phase !== "play") return;
    const t = window.setTimeout(() => setPhase("done"), full ? PLAY_MS.full : PLAY_MS.quick);
    return () => window.clearTimeout(t);
  }, [phase, full, id]);

  const cls = phase === "hold" ? "pg-hold" : phase === "play" ? (full ? "pg-play" : "pg-play pg-quick") : "";
  return (
    <StageCtx.Provider value={{ revealed: phase !== "hold", full }}>
      <div ref={ref} className={`pg-stage min-w-0 ${cls}`} aria-busy={phase === "hold" || undefined}>{children}</div>
    </StageCtx.Provider>
  );
}
