import { lazy, type ComponentType } from "react";

/**
 * Screens load when they are first opened instead of all at sign-in. Each loader is remembered
 * so that, once Home has settled, the rest are fetched quietly in the background and later
 * screen changes are instant. If a screen's file has gone (a new version was published while
 * the app was open), the page reloads once to pick up the new version instead of failing.
 */
type Loader<T> = () => Promise<{ default: T }>;
const loaders: Loader<unknown>[] = [];
const RELOAD_KEY = "bani-chunk-reload";

export function lazyPage<T extends ComponentType<any>>(load: Loader<T>) {
  loaders.push(load);
  return lazy(async () => {
    try {
      const mod = await load();
      try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* no-op */ }
      return mod;
    } catch (err) {
      let reloaded = false;
      try { reloaded = sessionStorage.getItem(RELOAD_KEY) === "1"; sessionStorage.setItem(RELOAD_KEY, "1"); } catch { /* no-op */ }
      if (!reloaded) { window.location.reload(); return new Promise<{ default: T }>(() => {}); }
      throw err;
    }
  });
}

let prefetched = false;
/** Fetch every screen in the background, a few at a time, when the browser is idle. */
export function prefetchPages(delayMs = 2500) {
  if (prefetched || typeof window === "undefined") return;
  prefetched = true;
  const idle = (cb: () => void) => ((window as any).requestIdleCallback ? (window as any).requestIdleCallback(cb, { timeout: 2000 }) : window.setTimeout(cb, 200));
  window.setTimeout(() => {
    const queue = [...loaders];
    const next = () => { const batch = queue.splice(0, 4); if (!batch.length) return; Promise.allSettled(batch.map((l) => l())).then(() => idle(next)); };
    idle(next);
  }, delayMs);
}
